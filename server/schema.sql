-- ========================================================
-- CollabX PostgreSQL Database Schema (Supabase / Production)
-- Complete Schema Specification Covering All 10 Tables,
-- Triggers, Stored Functions, and 27 Performance Indexes.
-- ========================================================

-- --------------------------------------------------------
-- 1. Users Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'student',
    roll_no VARCHAR(50),
    phone VARCHAR(30),
    mentor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    role_classified BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    refresh_token_hash TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- --------------------------------------------------------
-- 2. Projects Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'Planning',
    priority VARCHAR DEFAULT 'Medium',
    progress INTEGER DEFAULT 0,
    deadline TIMESTAMP WITHOUT TIME ZONE,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    mentor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    github_url TEXT,
    demo_url TEXT,
    ppt_url TEXT,
    is_on_leaderboard BOOLEAN DEFAULT FALSE,
    leaderboard_submitted_at TIMESTAMP WITHOUT TIME ZONE,
    mentor_review TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- --------------------------------------------------------
-- 3. Project Members Table (Squad Membership)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    PRIMARY KEY (project_id, user_id)
);

-- --------------------------------------------------------
-- 4. Tasks Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'Todo',
    priority VARCHAR(50) DEFAULT 'Medium',
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    due_date TIMESTAMP WITHOUT TIME ZONE,
    completed_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- --------------------------------------------------------
-- 5. Notifications Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- --------------------------------------------------------
-- 6. Messages Table (Official & Unofficial Channels)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(20) DEFAULT 'official',
    content TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- --------------------------------------------------------
-- 7. Invitations Table (Squad & Mentor Invitations)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitations (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    recipient_email VARCHAR NOT NULL,
    recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    role VARCHAR DEFAULT 'member',
    status VARCHAR DEFAULT 'Pending',
    token VARCHAR,
    expires_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- --------------------------------------------------------
-- 8. Activities Table (Audit Log & Feed)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR NOT NULL,
    description TEXT NOT NULL,
    entity_type VARCHAR,
    entity_id INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- --------------------------------------------------------
-- 9. Announcements Table (Institute & Project Broadcasts)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    target_role VARCHAR(30) DEFAULT 'all',
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- --------------------------------------------------------
-- 10. Project Stars Table (Leaderboard Voting & Endorsement)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_stars (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    UNIQUE (project_id, user_id)
);

-- ========================================================
-- Triggers & Stored Functions
-- ========================================================

-- Trigger 1: Automatic updated_at timestamp maintenance for projects
CREATE OR REPLACE FUNCTION update_projects_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_projects_updated_at ON projects;
CREATE TRIGGER trigger_update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_projects_updated_at_column();

-- Trigger 2: Automatic progress calculation & status synchronization on task changes
CREATE OR REPLACE FUNCTION sync_project_progress()
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
            COUNT(*) FILTER (WHERE status = 'Completed')::int
        INTO v_total, v_completed
        FROM tasks
        WHERE project_id = target_project_id;

        IF v_total > 0 THEN
            v_progress := ROUND((v_completed::numeric / v_total::numeric) * 100)::int;
        ELSE
            v_progress := 0;
        END IF;

        UPDATE projects
        SET progress = v_progress,
            status = CASE 
                WHEN status = 'Completed' AND (v_total = 0 OR v_completed < v_total) THEN 'In Progress'
                ELSE status
            END,
            updated_at = NOW()
        WHERE id = target_project_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_project_progress ON tasks;
CREATE TRIGGER trg_sync_project_progress
    AFTER INSERT OR UPDATE OF status, project_id OR DELETE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION sync_project_progress();

-- ========================================================
-- Production Performance Indexes (27 Total)
-- ========================================================

-- 1. Project Indexes (5)
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects (owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_mentor_id ON projects (mentor_id);
CREATE INDEX IF NOT EXISTS idx_projects_leaderboard ON projects (is_on_leaderboard, status);
CREATE INDEX IF NOT EXISTS idx_projects_status_created ON projects (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_leaderboard_rank ON projects (is_on_leaderboard, status, progress, leaderboard_submitted_at DESC);

-- 2. Stars & Squad Membership Indexes (4)
CREATE INDEX IF NOT EXISTS idx_project_stars_project ON project_stars (project_id);
CREATE INDEX IF NOT EXISTS idx_project_stars_user ON project_stars (user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_user ON project_members (project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members (user_id);

-- 3. Tasks Indexes (3)
CREATE INDEX IF NOT EXISTS idx_tasks_project_status_assigned ON tasks (project_id, status, assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks (project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON tasks (assigned_to, status);

-- 4. Real-time Messages & Activities Indexes (5)
CREATE INDEX IF NOT EXISTS idx_messages_project_channel_created ON messages (project_id, channel, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_project_created ON messages (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_project_created ON activities (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_user_created ON activities (user_id, created_at DESC);

-- 5. Notifications & Users Indexes (5)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_users_mentor_id ON users (mentor_id);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users (role, is_active);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_roll_no ON users (roll_no);

-- 6. Announcements Indexes (2)
CREATE INDEX IF NOT EXISTS idx_announcements_target_created ON announcements (target_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_project_created ON announcements (project_id, created_at DESC);

-- 7. Invitations Indexes (3)
CREATE INDEX IF NOT EXISTS idx_invitations_recipient_status ON invitations (recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_project_status ON invitations (project_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_email_status ON invitations (LOWER(recipient_email), status);
