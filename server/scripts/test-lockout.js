import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function testLockout() {
    const testHash = await bcrypt.hash("testpass", 12);
    await pool.query(`
        INSERT INTO users (id, name, email, password_hash, role, is_verified, is_active, failed_login_attempts, lock_until, created_at)
        VALUES (9999, 'Lockout Test', 'lockout_test@technonjr.org', $1, 'student', TRUE, TRUE, 0, NULL, NOW())
        ON CONFLICT (id) DO UPDATE SET failed_login_attempts = 0, lock_until = NULL, password_hash = $1;
    `, [testHash]);

    console.log("Testing 6 failed login attempts on lockout_test@technonjr.org:");
    for (let i = 1; i <= 6; i++) {
        const res = await fetch("http://localhost:5000/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "lockout_test@technonjr.org", password: "wrongpassword" })
        });
        const data = await res.json();
        console.log(`Attempt ${i}: HTTP ${res.status} -> ${data.message}`);
    }

    // Cleanup
    await pool.query("DELETE FROM users WHERE id = 9999");
    await pool.end();
}

testLockout().catch(console.error);
