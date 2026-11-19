import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

try {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    console.log("Existing tables in public schema:", res.rows.map(r => r.table_name));
} catch (err) {
    console.error("Error:", err);
} finally {
    await pool.end();
}
