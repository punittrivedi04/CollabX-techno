import "dotenv/config";
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

try {
    for (const t of ['projects', 'project_members', 'tasks']) {
        const cols = await pool.query(`
            SELECT column_name, data_type, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
        `, [t]);
        console.log(`\nTable ${t}:`);
        console.table(cols.rows);
    }
} catch (err) {
    console.error("Inspect error:", err);
} finally {
    await pool.end();
}
