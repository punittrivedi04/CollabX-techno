import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { Pool, types } = pg;

// Parse PostgreSQL TIMESTAMP WITHOUT TIME ZONE (OID 1114) strictly as UTC across all host timezones
types.setTypeParser(1114, (str) => {
    if (!str) return null;
    if (str instanceof Date) return str;
    const normalized = String(str).trim().replace(" ", "T");
    return new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`);
});

// Optimized PostgreSQL pool tuned for campus concurrency & Supabase connection poolers
// max: 20 pooled connections, 30s idle timeout, 10s query statement timeout to prevent hung locks
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    query_timeout: 10000,
    allowExitOnIdle: false,
});

pool.on("error", (err) => {
    console.error("[PostgreSQL Pool] Unexpected error on idle client:", err.message);
});

// Wrapped query helper with duration measurement and slow query warnings (> 500ms in dev or when DEBUG_DB=true)
export const query = async (text, params) => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        if (duration > 500 && (process.env.NODE_ENV !== "production" || process.env.DEBUG_DB === "true")) {
            const preview = typeof text === "string" ? text.slice(0, 140).replace(/\s+/g, " ") : "Non-string SQL";
            console.warn(`[PostgreSQL Slow Query] ${duration}ms: ${preview}`);
        }
        return result;
    } catch (err) {
        throw err;
    }
};

const SCHEMA_MIGRATION_QUERIES = [
    // Safe, non-destructive user table extensions
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS mentor_id INTEGER REFERENCES users(id) ON DELETE SET NULL;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role_classified BOOLEAN DEFAULT FALSE;",
    // Safely mark existing non-student roles as classified without overwriting any role values
    `UPDATE users
     SET role_classified = TRUE
     WHERE LOWER(COALESCE(role, 'student')) != 'student'
       AND COALESCE(role_classified, FALSE) = FALSE;`,
    // Announcements table (institute-wide or project/team-scoped)
    `CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        target_role VARCHAR(30) DEFAULT 'all',
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
    );`,
    // Global Leaderboard & Star Voting tables
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_on_leaderboard BOOLEAN DEFAULT FALSE;",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS leaderboard_submitted_at TIMESTAMP WITHOUT TIME ZONE;",
    // Mentor Project Review columns
    "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS mentor_review TEXT;",
    "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;",
    `CREATE TABLE IF NOT EXISTS project_stars (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(project_id, user_id)
    );`,
    // Calculate and synchronize projects.progress strictly from tasks
    `UPDATE projects p
     SET progress = CASE
         WHEN (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) > 0 THEN
             ROUND(((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed')::numeric / 
                    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id)::numeric) * 100)::int
         ELSE 0
     END;`,
    // Correct falsely marked "Completed" projects where tasks are incomplete or 0 tasks exist
    `UPDATE projects p
     SET status = 'In Progress'
     WHERE LOWER(TRIM(COALESCE(status, ''))) = 'completed'
       AND (
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) = 0
         OR (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND LOWER(TRIM(COALESCE(t.status, ''))) NOT IN ('completed', 'done')) > 0
       );`,
    // Function & trigger to maintain synchronized task progress and status guards on tasks changes
    `CREATE OR REPLACE FUNCTION sync_project_progress()
     RETURNS TRIGGER AS $$
     DECLARE
         target_project_id INT;
         v_total INT;
         v_completed INT;
         v_progress INT;
     BEGIN
         target_project_id := COALESCE(NEW.project_id, OLD.project_id);
         IF target_project_id IS NOT NULL THEN
             SELECT 
                 COUNT(*)::int,
                 COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('completed', 'done'))::int
             INTO v_total, v_completed
             FROM tasks
             WHERE project_id = target_project_id;

             IF v_total > 0 THEN
                 v_progress := ROUND((v_completed::numeric / v_total::numeric) * 100)::int;
             ELSE
                 v_progress := 0;
             END IF;

             IF (v_total = 0 OR v_completed < v_total) THEN
                 UPDATE projects
                 SET progress = v_progress,
                     status = CASE 
                         WHEN LOWER(TRIM(COALESCE(status, ''))) = 'completed' THEN 'In Progress'
                         ELSE status
                     END,
                     updated_at = NOW()
                 WHERE id = target_project_id;
             ELSE
                 UPDATE projects
                 SET progress = v_progress,
                     status = CASE 
                         WHEN v_total > 0 AND v_completed = v_total AND LOWER(TRIM(COALESCE(status, ''))) IN ('in progress', 'planning') THEN 'Completed'
                         ELSE status
                     END,
                     updated_at = NOW()
                 WHERE id = target_project_id;
             END IF;
         END IF;
         RETURN NULL;
     END;
     $$ LANGUAGE plpgsql;`,
    `DROP TRIGGER IF EXISTS trg_sync_project_progress ON tasks;`,
    `CREATE TRIGGER trg_sync_project_progress
     AFTER INSERT OR UPDATE OF status, project_id OR DELETE ON tasks
     FOR EACH ROW EXECUTE FUNCTION sync_project_progress();`,
    // Ensure invitations columns token and expires_at exist with 48h expiration
    "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS token VARCHAR;",
    "ALTER TABLE invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;",
    `UPDATE invitations
     SET expires_at = created_at + INTERVAL '48 hours'
     WHERE expires_at IS NULL;`,
    `UPDATE invitations
     SET status = 'Expired'
     WHERE status = 'Pending' AND expires_at IS NOT NULL AND expires_at < NOW();`,
];

const PERFORMANCE_INDEX_QUERIES = [
    // Project indexes
    "CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects (owner_id);",
    "CREATE INDEX IF NOT EXISTS idx_projects_mentor_id ON projects (mentor_id);",
    "CREATE INDEX IF NOT EXISTS idx_projects_leaderboard ON projects (is_on_leaderboard, status);",
    "CREATE INDEX IF NOT EXISTS idx_projects_status_created ON projects (status, created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_projects_leaderboard_rank ON projects (is_on_leaderboard, status, progress, leaderboard_submitted_at DESC);",

    // Stars & Squad membership
    "CREATE INDEX IF NOT EXISTS idx_project_stars_project ON project_stars (project_id);",
    "CREATE INDEX IF NOT EXISTS idx_project_stars_user ON project_stars (user_id);",
    "CREATE INDEX IF NOT EXISTS idx_project_members_project_user ON project_members (project_id, user_id);",
    "CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members (user_id);",

    // Tasks indexes
    "CREATE INDEX IF NOT EXISTS idx_tasks_project_status_assigned ON tasks (project_id, status, assigned_to);",
    "CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks (project_id, status);",
    "CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON tasks (assigned_to, status);",

    // Real-time messages & activities
    "CREATE INDEX IF NOT EXISTS idx_messages_project_channel_created ON messages (project_id, channel, created_at);",
    "CREATE INDEX IF NOT EXISTS idx_messages_project_created ON messages (project_id, created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities (created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_activities_project_created ON activities (project_id, created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_activities_user_created ON activities (user_id, created_at DESC);",

    // Notifications & Users
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read);",
    "CREATE INDEX IF NOT EXISTS idx_users_mentor_id ON users (mentor_id);",
    "CREATE INDEX IF NOT EXISTS idx_users_role_active ON users (role, is_active);",
    "CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));",
    "CREATE INDEX IF NOT EXISTS idx_users_roll_no ON users (roll_no);",

    // Announcements
    "CREATE INDEX IF NOT EXISTS idx_announcements_target_created ON announcements (target_role, created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_announcements_project_created ON announcements (project_id, created_at DESC);",

    // Invitations
    "CREATE INDEX IF NOT EXISTS idx_invitations_recipient_status ON invitations (recipient_id, status);",
    "CREATE INDEX IF NOT EXISTS idx_invitations_project_status ON invitations (project_id, status);",
    "CREATE INDEX IF NOT EXISTS idx_invitations_email_status ON invitations (LOWER(recipient_email), status);",
    "CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations (token);",
];

export const ensureSchemaMigrations = async () => {
    for (const sql of SCHEMA_MIGRATION_QUERIES) {
        try {
            await pool.query(sql);
        } catch (err) {
            console.error("[DB Migration] Failed step:", err.message);
            throw err;
        }
    }
};

export const ensurePerformanceIndexes = async () => {
    for (const sql of PERFORMANCE_INDEX_QUERIES) {
        try {
            await pool.query(sql);
        } catch (err) {
            console.warn("[DB Index] Skipped index creation:", err.message);
        }
    }
};

export default pool;
