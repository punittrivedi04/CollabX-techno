import pool from "../config/db.js";

async function cleanDuplicates() {
  console.log("Checking project_members for duplicate owner rows...");
  const before = await pool.query(`
    SELECT COUNT(*) FROM project_members pm
    JOIN projects p ON pm.project_id = p.id
    WHERE pm.user_id = p.owner_id;
  `);
  console.log(`Duplicate rows before cleanup: ${before.rows[0].count}`);

  const deleteRes = await pool.query(`
    DELETE FROM project_members pm
    USING projects p
    WHERE pm.project_id = p.id AND pm.user_id = p.owner_id;
  `);
  console.log(`Deleted ${deleteRes.rowCount} duplicate (project_id, owner_id) rows from project_members.`);

  const after = await pool.query(`
    SELECT COUNT(*) FROM project_members pm
    JOIN projects p ON pm.project_id = p.id
    WHERE pm.user_id = p.owner_id;
  `);
  console.log(`Duplicate rows after cleanup: ${after.rows[0].count}`);

  // Also check total member counts per project
  const projectStats = await pool.query(`
    SELECT p.id, p.title, p.owner_id, u.name as owner_name,
           COUNT(pm.user_id) as member_count
    FROM projects p
    LEFT JOIN users u ON p.owner_id = u.id
    LEFT JOIN project_members pm ON p.id = pm.project_id
    GROUP BY p.id, p.title, p.owner_id, u.name
    ORDER BY p.id ASC;
  `);
  console.log(`Verified ${projectStats.rows.length} projects. Sample stats:`);
  projectStats.rows.slice(0, 5).forEach((p) => {
    console.log(`  Project #${p.id} "${p.title}": Owner=${p.owner_name} (ID ${p.owner_id}), Members=${p.member_count}, Total Team=${Number(p.member_count) + (p.owner_id ? 1 : 0)}`);
  });

  await pool.end();
}

cleanDuplicates().catch(console.error);
