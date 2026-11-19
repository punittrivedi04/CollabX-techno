import pool from "../config/db.js";

async function inspect() {
  const projCount = await pool.query("SELECT COUNT(*) FROM projects");
  const userCount = await pool.query("SELECT COUNT(*) FROM users");
  const memberCount = await pool.query("SELECT COUNT(*) FROM project_members");
  const msgCount = await pool.query("SELECT COUNT(*) FROM messages");
  console.log({
    projects: projCount.rows[0].count,
    users: userCount.rows[0].count,
    project_members: memberCount.rows[0].count,
    messages: msgCount.rows[0].count,
  });

  // Check duplicate (project_id, owner_id) in project_members
  const dupes = await pool.query(`
    SELECT pm.project_id, pm.user_id, p.owner_id, p.title
    FROM project_members pm
    JOIN projects p ON pm.project_id = p.id
    WHERE pm.user_id = p.owner_id;
  `);
  console.log(`Found ${dupes.rows.length} duplicate (project_id, owner_id) rows in project_members:`);
  console.log(dupes.rows.slice(0, 10));

  // Check mentors
  const mentors = await pool.query(`
    SELECT id, name, email, role FROM users WHERE role = 'mentor' OR role = 'faculty';
  `);
  console.log(`Found ${mentors.rows.length} mentors/faculty in users:`, mentors.rows);

  const projWithMentor = await pool.query(`
    SELECT id, title, mentor_id, owner_id FROM projects WHERE mentor_id IS NOT NULL;
  `);
  console.log(`Found ${projWithMentor.rows.length} projects with mentor_id:`, projWithMentor.rows.slice(0, 5));

  await pool.end();
}

inspect();
