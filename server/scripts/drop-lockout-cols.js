import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

try {
    await pool.query(`
        ALTER TABLE users DROP COLUMN IF EXISTS failed_login_attempts;
        ALTER TABLE users DROP COLUMN IF EXISTS lock_until;
    `);
    console.log("Successfully dropped failed_login_attempts and lock_until from users table.");

    const res = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
        ORDER BY ordinal_position;
    `);
    console.table(res.rows);
} catch (err) {
    console.error("Migration error:", err);
} finally {
    await pool.end();
}
