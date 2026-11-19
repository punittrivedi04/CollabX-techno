import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDB() {
    console.log("Initializing Supabase PostgreSQL schema...");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR NOT NULL,
                email VARCHAR UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                roll_no VARCHAR,
                role VARCHAR DEFAULT 'student',
                is_verified BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                failed_login_attempts INTEGER DEFAULT 0,
                lock_until TIMESTAMP,
                refresh_token_hash TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // Ensure users columns match exact requirements (NO avatar, NO department)
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS roll_no VARCHAR;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS lock_until TIMESTAMP;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT;
            ALTER TABLE users DROP COLUMN IF EXISTS avatar;
            ALTER TABLE users DROP COLUMN IF EXISTS department;
            ALTER TABLE users DROP COLUMN IF EXISTS bio;
            ALTER TABLE users DROP COLUMN IF EXISTS institution;
        `);

        // 2. Projects table
        await client.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                title VARCHAR NOT NULL,
                description TEXT,
                status VARCHAR DEFAULT 'Planning',
                priority VARCHAR DEFAULT 'Medium',
                progress INTEGER DEFAULT 0,
                deadline TIMESTAMP,
                owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                mentor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                github_url TEXT,
                demo_url TEXT,
                ppt_url TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority VARCHAR DEFAULT 'Medium';
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline TIMESTAMP;
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
            ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'Planning';
        `);

        // 3. Trigger for projects.updated_at
        await client.query(`
            CREATE OR REPLACE FUNCTION update_projects_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ language 'plpgsql';

            DROP TRIGGER IF EXISTS trigger_update_projects_updated_at ON projects;
            CREATE TRIGGER trigger_update_projects_updated_at
                BEFORE UPDATE ON projects
                FOR EACH ROW
                EXECUTE FUNCTION update_projects_updated_at_column();
        `);

        // 4. Project Members table
        await client.query(`
            CREATE TABLE IF NOT EXISTS project_members (
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role VARCHAR DEFAULT 'member',
                PRIMARY KEY (project_id, user_id)
            );
        `);

        // 5. Tasks table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                title VARCHAR NOT NULL,
                description TEXT,
                status VARCHAR DEFAULT 'Todo',
                priority VARCHAR DEFAULT 'Medium',
                assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                due_date TIMESTAMP,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
            ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
            ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
            ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'Todo';
            ALTER TABLE tasks ALTER COLUMN priority SET DEFAULT 'Medium';
        `);

        // 6. Notifications table
        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR,
                message TEXT NOT NULL,
                type VARCHAR DEFAULT 'general',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 7. Messages table
        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 8. Invitations table
        await client.query(`
            CREATE TABLE IF NOT EXISTS invitations (
                id SERIAL PRIMARY KEY,
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                recipient_email VARCHAR NOT NULL,
                recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                role VARCHAR DEFAULT 'member',
                status VARCHAR DEFAULT 'Pending',
                token VARCHAR,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 9. Activities table
        await client.query(`
            CREATE TABLE IF NOT EXISTS activities (
                id SERIAL PRIMARY KEY,
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                action VARCHAR NOT NULL,
                description TEXT NOT NULL,
                entity_type VARCHAR,
                entity_id INTEGER,
                metadata JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query("COMMIT");
        console.log("Schema initialization successful!");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Schema initialization failed:", err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

initDB().catch(console.error);
