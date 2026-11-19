import pool from "../config/db.js";

async function check() {
  const { rows } = await pool.query("SELECT id, name, email, role FROM users WHERE email = 'director@technonjr.org'");
  console.log("Director account:", rows[0]);
  const admins = await pool.query("SELECT id, name, email, role FROM users WHERE role = 'admin' OR role = 'coordinator'");
  console.log("All Admins/Coordinators:", admins.rows);
  await pool.end();
}

check();
