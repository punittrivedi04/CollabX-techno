import pool from "../config/db.js";

async function inspectDb() {
  const cols = await pool.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'messages';
  `);
  console.log("messages table columns:", cols.rows);

  const thinkflux = await pool.query(`
    SELECT p.id, p.title, p.owner_id, u.name as owner_name
    FROM projects p
    LEFT JOIN users u ON p.owner_id = u.id
    WHERE LOWER(p.title) LIKE '%thinkflux%';
  `);
  console.log("Thinkflux project:", thinkflux.rows);

  if (thinkflux.rows.length > 0) {
    const pId = thinkflux.rows[0].id;
    const members = await pool.query(`
      SELECT pm.user_id, u.name, u.email
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = $1;
    `, [pId]);
    console.log(`Members in project_members for ${thinkflux.rows[0].title}:`, members.rows);
  }

  await pool.end();
}

inspectDb().catch(console.error);
