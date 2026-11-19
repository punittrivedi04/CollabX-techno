import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

function formatSqlValue(val) {
    if (val === null || val === undefined) return "NULL";
    if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
    if (typeof val === "number") return val;
    if (val instanceof Date) return `'${val.toISOString()}'`;
    if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
    return `'${String(val).replace(/'/g, "''")}'`;
}

async function exportDatabase() {
    console.log("==========================================");
    console.log("Starting PostgreSQL Database Backup Dump");
    console.log("==========================================");

    const client = await pool.connect();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const exportFileName = `collabx-backup-${timestamp}.sql`;
    const exportLatestFileName = "collabx-backup-latest.sql";
    const exportPath = path.join(__dirname, "..", exportFileName);
    const exportLatestPath = path.join(__dirname, "..", exportLatestFileName);

    let sql = `-- ========================================================\n`;
    sql += `-- CollabX PostgreSQL Database Backup Dump\n`;
    sql += `-- Generated At: ${new Date().toISOString()}\n`;
    sql += `-- Target: College Server Handover\n`;
    sql += `-- ========================================================\n\n`;

    sql += `SET statement_timeout = 0;\n`;
    sql += `SET lock_timeout = 0;\n`;
    sql += `SET client_encoding = 'UTF8';\n`;
    sql += `SET standard_conforming_strings = on;\n\n`;

    const tables = [
        "users",
        "projects",
        "project_members",
        "tasks",
        "notifications",
        "messages",
        "invitations",
        "activities"
    ];

    try {
        for (const tableName of tables) {
            console.log(`Dumping table: ${tableName}...`);

            // Fetch columns
            const colRes = await client.query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1
                ORDER BY ordinal_position;
            `, [tableName]);

            if (colRes.rows.length === 0) continue;

            const columns = colRes.rows.map((r) => r.column_name);

            // Fetch rows
            const rowsRes = await client.query(`SELECT * FROM ${tableName} ORDER BY 1 ASC;`);
            sql += `-- Table: ${tableName} (${rowsRes.rows.length} rows)\n`;

            if (rowsRes.rows.length > 0) {
                const colsList = columns.map(c => `"${c}"`).join(", ");
                for (const row of rowsRes.rows) {
                    const valsList = columns.map((col) => formatSqlValue(row[col])).join(", ");
                    sql += `INSERT INTO "${tableName}" (${colsList}) VALUES (${valsList}) ON CONFLICT DO NOTHING;\n`;
                }
            }

            // Sync sequence if table has serial id
            if (columns.includes("id") && tableName !== "project_members") {
                sql += `SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 1), true);\n`;
            }

            sql += "\n";
        }

        fs.writeFileSync(exportPath, sql, "utf8");
        fs.writeFileSync(exportLatestPath, sql, "utf8");

        console.log("==========================================");
        console.log(`Database export completed successfully!`);
        console.log(`Backup saved to: ${exportFileName}`);
        console.log(`Latest backup: ${exportLatestFileName}`);
        console.log("==========================================");
    } catch (err) {
        console.error("Database export failed:", err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

exportDatabase().catch(console.error);
