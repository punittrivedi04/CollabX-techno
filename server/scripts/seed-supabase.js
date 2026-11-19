import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const sqlPath = path.join(__dirname, "..", "portal-data-no-passwords.sql");

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

function parseSqlValues(content, targetTable) {
    const records = [];
    const prefix = `INSERT INTO ${targetTable} VALUES`;
    let i = 0;

    while (i < content.length) {
        const found = content.indexOf(prefix, i);
        if (found === -1) break;

        let pos = found + prefix.length;
        while (pos < content.length && content[pos] !== "(") pos++;
        if (pos >= content.length) break;
        pos++;

        const values = [];
        let current = "";
        let inString = false;

        while (pos < content.length) {
            const char = content[pos];

            if (inString) {
                if (char === "'") {
                    if (content[pos + 1] === "'") {
                        current += "'";
                        pos += 2;
                        continue;
                    } else {
                        inString = false;
                        pos++;
                        continue;
                    }
                } else {
                    current += char;
                    pos++;
                    continue;
                }
            } else {
                if (char === "'") {
                    inString = true;
                    pos++;
                    continue;
                } else if (char === ",") {
                    values.push(cleanValue(current));
                    current = "";
                    pos++;
                    continue;
                } else if (char === ")") {
                    values.push(cleanValue(current));
                    records.push(values);
                    pos++;
                    break;
                } else {
                    current += char;
                    pos++;
                }
            }
        }

        i = pos;
    }

    return records;
}

function cleanValue(val) {
    val = val.trim();
    if (val === "NULL" || val === "null" || val === "") return null;
    if (!isNaN(val) && !isNaN(parseFloat(val))) return Number(val);
    return val;
}

async function runSeed() {
    console.log("==========================================");
    console.log("Seeding Supabase PostgreSQL from SQL Data");
    console.log("==========================================");

    if (!fs.existsSync(sqlPath)) {
        throw new Error(`SQL file not found at ${sqlPath}`);
    }

    const content = fs.readFileSync(sqlPath, "utf8");

    const usersSql = parseSqlValues(content, "users");
    const teamsSql = parseSqlValues(content, "teams");
    const teamMembersSql = parseSqlValues(content, "team_members");
    const tasksSql = parseSqlValues(content, "tasks");
    const notificationsSql = parseSqlValues(content, "notifications");

    console.log(`Parsed SQL data:
- ${usersSql.length} users
- ${teamsSql.length} teams
- ${teamMembersSql.length} team_members
- ${tasksSql.length} tasks
- ${notificationsSql.length} notifications`);

    console.log("Generating bcrypt hash for '123456' with 12 salt rounds...");
    const passwordHash12 = await bcrypt.hash("123456", 12);
    console.log("Password hash generated.");

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // 1. Seed Users
        console.log("Seeding Users...");
        const roleMapping = {
            admin: "admin",
            coordinator: "coordinator",
            mentor: "mentor",
            student: "student",
        };

        const existingUserIds = new Set();

        for (const row of usersSql) {
            const id = row[0];
            let name = (row[1] || "").trim();
            const email = (row[2] || "").trim().toLowerCase();
            const rawRole = (row[4] || "student").toLowerCase();
            const rollNoCandidate = row[10] ? String(row[10]).trim() : null;
            const createdAt = row[7] ? new Date(row[7]) : new Date();

            if (!email) continue;

            if (name.startsWith("http://") || name.startsWith("https://")) {
                const prefix = email.split("@")[0] || "User";
                const parts = prefix.split(".");
                const candidate = parts[parts.length - 1] || prefix;
                name = candidate.charAt(0).toUpperCase() + candidate.slice(1);
            }
            if (name.length > 100) name = name.slice(0, 100);
            if (name.length < 2) name = "User";

            const role = roleMapping[rawRole] || "student";
            let rollNo = rollNoCandidate;
            if (!rollNo && email.includes("@")) {
                const prefix = email.split("@")[0];
                if (/^\d{2}[a-z]{5}\d+/i.test(prefix)) {
                    rollNo = prefix;
                }
            }

            await client.query(`
                INSERT INTO users (id, name, email, password_hash, roll_no, role, is_verified, is_active, failed_login_attempts, lock_until, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, 0, NULL, $7)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    email = EXCLUDED.email,
                    password_hash = EXCLUDED.password_hash,
                    roll_no = EXCLUDED.roll_no,
                    role = EXCLUDED.role,
                    is_verified = TRUE,
                    is_active = TRUE,
                    failed_login_attempts = 0,
                    lock_until = NULL;
            `, [id, name, email, passwordHash12, rollNo, role, createdAt]);

            existingUserIds.add(id);
        }

        // Ensure 25etccs149@technonjr.org exists
        const user149Check = await client.query("SELECT id FROM users WHERE email = $1", ["25etccs149@technonjr.org"]);
        let student149Id;
        if (user149Check.rows.length === 0) {
            const nextUserRes = await client.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM users");
            student149Id = nextUserRes.rows[0].next_id;
            await client.query(`
                INSERT INTO users (id, name, email, password_hash, roll_no, role, is_verified, is_active, failed_login_attempts, lock_until, created_at)
                VALUES ($1, 'Punit Trivedi', '25etccs149@technonjr.org', $2, '25etccs149', 'student', TRUE, TRUE, 0, NULL, NOW());
            `, [student149Id, passwordHash12]);
            console.log(`Created student user 25etccs149@technonjr.org with id ${student149Id}`);
        } else {
            student149Id = user149Check.rows[0].id;
            await client.query(`
                UPDATE users SET password_hash = $1, is_verified = TRUE, is_active = TRUE, failed_login_attempts = 0, lock_until = NULL
                WHERE id = $2;
            `, [passwordHash12, student149Id]);
        }

        // Also ensure punittrivedi699@gmail.com is present with verified status and 123456 password
        const punitCheck = await client.query("SELECT id FROM users WHERE email = $1", ["punittrivedi699@gmail.com"]);
        let punitId = 149;
        if (punitCheck.rows.length === 0) {
            await client.query(`
                INSERT INTO users (id, name, email, password_hash, roll_no, role, is_verified, is_active, failed_login_attempts, lock_until, created_at)
                VALUES (149, 'Punit Trivedi', 'punittrivedi699@gmail.com', $1, '25etccs149', 'student', TRUE, TRUE, 0, NULL, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    email = EXCLUDED.email,
                    password_hash = EXCLUDED.password_hash,
                    is_verified = TRUE;
            `, [passwordHash12]);
            punitId = 149;
        } else {
            punitId = punitCheck.rows[0].id;
            await client.query(`
                UPDATE users SET password_hash = $1, is_verified = TRUE, is_active = TRUE, failed_login_attempts = 0, lock_until = NULL
                WHERE id = $2;
            `, [passwordHash12, punitId]);
        }

        await client.query("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));");

        // 2. Map Team Members
        const teamMembersByTeamId = new Map();
        for (const m of teamMembersSql) {
            const [teamId, userId, isLead] = m;
            if (!teamMembersByTeamId.has(teamId)) {
                teamMembersByTeamId.set(teamId, []);
            }
            teamMembersByTeamId.get(teamId).push({ userId, isLead });
        }

        // 3. Seed Projects (Teams)
        console.log("Seeding Projects...");
        for (const row of teamsSql) {
            const sqlId = row[0];
            const teamName = (row[1] || "").trim() || `Team ${sqlId}`;
            const projectTitle = (row[3] || "").trim() || teamName;
            const mentorId = row[5] && existingUserIds.has(row[5]) ? row[5] : null;
            const pptUrl = row[6] || "";
            const repoUrl = row[7] || "";
            const demoUrl = row[8] || "";
            const health = row[9] || "green";
            const mentorPct = row[11] !== null ? Number(row[11]) : null;
            const archived = row[12] === 1;
            const createdAt = row[13] ? new Date(row[13]) : new Date();
            const mentorStatus = row[15] || "accepted";
            const createdBy = row[16] && existingUserIds.has(row[16]) ? row[16] : null;

            // Determine lead and members
            const rawMembers = teamMembersByTeamId.get(sqlId) || [];
            let leadUserId = null;
            for (const rm of rawMembers) {
                if (rm.isLead === 1 && existingUserIds.has(rm.userId)) {
                    leadUserId = rm.userId;
                    break;
                }
            }

            // Special handling for Team 40 Thinkflux
            if (sqlId === 40) {
                leadUserId = punitId;
            }

            let ownerId = leadUserId;
            if (!ownerId && rawMembers.length > 0) {
                ownerId = rawMembers.find(m => existingUserIds.has(m.userId))?.userId || null;
            }
            if (!ownerId) ownerId = createdBy || mentorId || 1;

            let progress = 0;
            if (mentorPct !== null && !isNaN(mentorPct)) {
                progress = Math.min(100, Math.max(0, mentorPct));
            } else if (health === "green") {
                progress = 80;
            } else if (health === "amber") {
                progress = 40;
            } else {
                progress = 20;
            }

            let status = "In Progress";
            if (progress === 100) {
                status = "Completed";
            } else if (archived) {
                status = "On Hold";
            } else if (mentorStatus === "pending") {
                status = "Planning";
            }

            const priority = (health === "red" || progress === 100) ? "High" : "Medium";

            await client.query(`
                INSERT INTO projects (id, title, description, status, priority, progress, owner_id, mentor_id, github_url, demo_url, ppt_url, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    status = EXCLUDED.status,
                    priority = EXCLUDED.priority,
                    progress = EXCLUDED.progress,
                    owner_id = EXCLUDED.owner_id,
                    mentor_id = EXCLUDED.mentor_id,
                    github_url = EXCLUDED.github_url,
                    demo_url = EXCLUDED.demo_url,
                    ppt_url = EXCLUDED.ppt_url;
            `, [sqlId, teamName, projectTitle, status, priority, progress, ownerId, mentorId, repoUrl, demoUrl, pptUrl, createdAt]);
        }

        await client.query("SELECT setval('projects_id_seq', (SELECT MAX(id) FROM projects));");

        // 4. Seed Project Members
        console.log("Seeding Project Members...");
        await client.query("DELETE FROM project_members;");

        for (const [teamId, members] of teamMembersByTeamId.entries()) {
            for (const m of members) {
                if (existingUserIds.has(m.userId)) {
                    await client.query(`
                        INSERT INTO project_members (project_id, user_id, role)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (project_id, user_id) DO NOTHING;
                    `, [teamId, m.userId, m.isLead === 1 ? "lead" : "member"]);
                }
            }
        }

        // For Team 40 Thinkflux: ensure 6 unique members
        // IDs: 121, 149 (punit), 150, 151, 152, 153
        const thinkfluxMembers = [121, punitId, 150, 151, 152, 153];
        for (const memberId of thinkfluxMembers) {
            if (existingUserIds.has(memberId)) {
                await client.query(`
                    INSERT INTO project_members (project_id, user_id, role)
                    VALUES (40, $1, $2)
                    ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;
                `, [memberId, memberId === punitId ? "lead" : "member"]);
            }
        }

        // If student149Id is different from punitId, ensure student149Id can also access Thinkflux
        if (student149Id && student149Id !== punitId) {
            await client.query(`
                INSERT INTO project_members (project_id, user_id, role)
                VALUES (40, $1, 'member')
                ON CONFLICT (project_id, user_id) DO NOTHING;
            `, [student149Id]);
        }

        // 5. Seed Tasks
        console.log("Seeding Tasks...");
        const taskStatusMap = {
            todo: "Todo",
            in_progress: "In Progress",
            in_review: "In Review",
            done: "Completed",
            completed: "Completed",
        };

        const taskPriorityMap = {
            low: "Low",
            medium: "Medium",
            high: "High",
        };

        for (const row of tasksSql) {
            const taskId = row[0];
            const teamId = row[1];
            const title = (row[3] || "").trim();
            const description = (row[4] || "").trim();
            const assigneeId = row[5] && existingUserIds.has(row[5]) ? row[5] : null;
            const dueDate = row[6] ? new Date(row[6]) : null;
            const rawStatus = (row[7] || "todo").toLowerCase();
            const rawPriority = (row[8] || "medium").toLowerCase();
            const createdById = row[13] && existingUserIds.has(row[13]) ? row[13] : null;
            const createdAt = row[14] ? new Date(row[14]) : new Date();
            const completedAt = row[15] ? new Date(row[15]) : (rawStatus === "done" ? new Date() : null);

            if (!title) continue;

            const status = taskStatusMap[rawStatus] || "Todo";
            const priority = taskPriorityMap[rawPriority] || "Medium";

            await client.query(`
                INSERT INTO tasks (id, project_id, title, description, status, priority, assigned_to, created_by, due_date, completed_at, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    status = EXCLUDED.status,
                    priority = EXCLUDED.priority,
                    assigned_to = EXCLUDED.assigned_to,
                    due_date = EXCLUDED.due_date,
                    completed_at = EXCLUDED.completed_at;
            `, [taskId, teamId, title, description, status, priority, assigneeId, createdById, dueDate, completedAt, createdAt]);
        }

        await client.query("SELECT setval('tasks_id_seq', (SELECT MAX(id) FROM tasks));");

        // 6. Seed Notifications
        console.log("Seeding Notifications...");
        for (const row of notificationsSql) {
            const id = row[0];
            const userId = row[1];
            const message = (row[2] || "").trim();
            const isRead = row[4] === 1;
            const createdAt = row[5] ? new Date(row[5]) : new Date();

            if (!message || !existingUserIds.has(userId)) continue;

            let type = "general";
            const lowerMsg = message.toLowerCase();
            if (lowerMsg.includes("task assigned")) type = "task_assigned";
            else if (lowerMsg.includes("moved to")) type = "task_updated";
            else if (lowerMsg.includes("completed")) type = "task_completed";
            else if (lowerMsg.includes("reminder") || lowerMsg.includes("due today")) type = "reminder";

            await client.query(`
                INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
                VALUES ($1, $2, 'Update', $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET
                    message = EXCLUDED.message,
                    type = EXCLUDED.type,
                    is_read = EXCLUDED.is_read;
            `, [id, userId, message, type, isRead, createdAt]);
        }

        await client.query("SELECT setval('notifications_id_seq', (SELECT MAX(id) FROM notifications));");

        await client.query("COMMIT");
        console.log("==========================================");
        console.log("Supabase PostgreSQL Seeding COMPLETED!");
        console.log("==========================================");

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Seeding failed with error:", err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

runSeed().catch(console.error);
