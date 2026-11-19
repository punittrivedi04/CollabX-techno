import pool from "../config/db.js";

async function migrate() {
  console.log("1. Adding channel column to messages table...");
  await pool.query(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'official';
  `);
  console.log("   ✓ channel column added or verified.");

  await pool.query(`
    UPDATE messages SET channel = 'official' WHERE channel IS NULL;
  `);
  console.log("   ✓ Existing messages updated to 'official'.");

  console.log("2. Cleaning duplicate student in Thinkflux (project 40)...");
  const delRes = await pool.query(`
    DELETE FROM project_members WHERE project_id = 40 AND user_id = 154;
  `);
  console.log(`   ✓ Deleted ${delRes.rowCount} extra member row for Thinkflux.`);

  // Verify Thinkflux member count
  const check = await pool.query(`
    SELECT p.id, p.title, p.owner_id, COUNT(pm.user_id) as member_count
    FROM projects p
    LEFT JOIN project_members pm ON p.id = pm.project_id
    WHERE p.id = 40
    GROUP BY p.id, p.title, p.owner_id;
  `);
  const row = check.rows[0];
  const total = Number(row.member_count) + (row.owner_id ? 1 : 0);
  console.log(`   ✓ Project #${row.id} "${row.title}": owner_id=${row.owner_id}, non-owner members=${row.member_count}, total=${total}`);

  await pool.end();
}

migrate().catch(console.error);
