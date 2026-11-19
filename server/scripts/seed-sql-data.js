import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import User from "../models/User.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "portal-data-no-passwords.sql");

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

async function runMigration() {
    console.log("==========================================");
    console.log("Starting SQL Data Migration to MongoDB Atlas");
    console.log("==========================================");

    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is missing in .env");
    }

    if (!fs.existsSync(sqlPath)) {
        throw new Error(`SQL file not found at ${sqlPath}`);
    }

    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected successfully to MongoDB Atlas.");

    console.log(`Reading SQL file: ${sqlPath}`);
    const content = fs.readFileSync(sqlPath, "utf8");

    const usersSql = parseSqlValues(content, "users");
    const teamsSql = parseSqlValues(content, "teams");
    const teamMembersSql = parseSqlValues(content, "team_members");
    const tasksSql = parseSqlValues(content, "tasks");
    const notificationsSql = parseSqlValues(content, "notifications");

    console.log(`Found in SQL:
- ${usersSql.length} users
- ${teamsSql.length} teams
- ${teamMembersSql.length} team_members
- ${tasksSql.length} tasks
- ${notificationsSql.length} notifications`);

    // 1. Password hash for default login "123456"
    console.log("Generating default password hash ('123456')...");
    const defaultPasswordHash = await bcrypt.hash("123456", 10);

    // 2. Map and migrate users
    console.log("Seeding / Syncing Users...");
    const userSqlIdToMongoId = new Map();

    const roleMapping = {
        admin: "Admin",
        coordinator: "Coordinator",
        mentor: "Mentor",
        student: "Member",
    };

    let usersCreated = 0;
    let usersUpdated = 0;

    for (const row of usersSql) {
        const sqlId = row[0];
        let name = (row[1] || "").trim();
        const email = (row[2] || "").trim().toLowerCase();
        const rawRole = (row[4] || "student").toLowerCase();
        const department = row[5] || "";
        const createdAt = row[7] ? new Date(row[7]) : new Date();

        if (!email) continue;

        if (name.startsWith("http://") || name.startsWith("https://")) {
            const prefix = email.split("@")[0] || "User";
            const parts = prefix.split(".");
            const candidate = parts[parts.length - 1] || prefix;
            name = candidate.charAt(0).toUpperCase() + candidate.slice(1);
        }

        if (name.length > 50) {
            name = name.slice(0, 50);
        }
        if (name.length < 2) {
            name = "User";
        }

        const role = roleMapping[rawRole] || "Member";
        const bio = department ? `${rawRole.toUpperCase()} - ${department}` : rawRole;

        const userDoc = {
            name,
            email,
            password: defaultPasswordHash,
            role,
            bio,
            institution: "Techno NJR Institute of Technology",
            createdAt,
        };

        const existing = await User.findOne({ email });

        let mongoUser;
        if (existing) {
            mongoUser = await User.findByIdAndUpdate(
                existing._id,
                {
                    $set: {
                        name: userDoc.name,
                        password: defaultPasswordHash,
                        role: userDoc.role,
                        bio: userDoc.bio,
                        institution: "Techno NJR Institute of Technology",
                    },
                },
                { new: true, runValidators: false }
            );
            usersUpdated++;
        } else {
            mongoUser = await User.create(userDoc);
            usersCreated++;
        }

        userSqlIdToMongoId.set(sqlId, mongoUser._id);
    }

    console.log(`Users synced: ${usersCreated} created, ${usersUpdated} updated (Total: ${userSqlIdToMongoId.size})`);

    // Verify Punit Trivedi and ensure 25etccs149 student account exists
    const punitUser = await User.findOne({ email: "punittrivedi699@gmail.com" });
    if (punitUser) {
        console.log(`Verified user Punit Trivedi: ${punitUser.name} (${punitUser.email}) -> ID: ${punitUser._id}`);
        // Ensure user 149 maps to this ID
        userSqlIdToMongoId.set(149, punitUser._id);
    } else {
        console.warn("WARNING: punittrivedi699@gmail.com was not found in users list.");
    }

    let student149User = await User.findOne({ email: "25etccs149@technonjr.org" });
    if (!student149User) {
        student149User = await User.create({
            name: "PUNIT TRIVEDI",
            email: "25etccs149@technonjr.org",
            password: defaultPasswordHash,
            role: "Member",
            bio: "STUDENT - CSE",
            institution: "Techno NJR Institute of Technology",
            createdAt: new Date(),
        });
        console.log(`Created student user 25etccs149@technonjr.org -> ID: ${student149User._id}`);
    } else {
        await User.findByIdAndUpdate(student149User._id, {
            $set: {
                password: defaultPasswordHash,
                role: "Member",
                bio: "STUDENT - CSE",
                institution: "Techno NJR Institute of Technology",
            }
        });
    }

    // 3. Map team_members: teamId -> array of { userId, isLead }
    const teamMembersByTeamId = new Map();
    for (const m of teamMembersSql) {
        const [teamId, userId, isLead] = m;
        if (!teamMembersByTeamId.has(teamId)) {
            teamMembersByTeamId.set(teamId, []);
        }
        teamMembersByTeamId.get(teamId).push({ userId, isLead });
    }

    // 4. Map and migrate teams -> projects
    console.log("Seeding / Syncing Projects from teams...");
    const teamSqlIdToMongoId = new Map();

    let projectsCreated = 0;
    let projectsUpdated = 0;

    for (const row of teamsSql) {
        const sqlId = row[0];
        const teamName = (row[1] || "").trim() || `Team ${sqlId}`;
        const refId = row[2] || "";
        const projectTitle = (row[3] || "").trim() || teamName;
        const department = row[4] || "";
        const mentorId = row[5];
        const pptUrl = row[6] || "";
        const repoUrl = row[7] || "";
        const demoUrl = row[8] || "";
        const health = row[9] || "green";
        const healthNote = row[10] || "";
        const mentorPct = row[11] !== null ? Number(row[11]) : null;
        const archived = row[12] === 1;
        const createdAt = row[13] ? new Date(row[13]) : new Date();
        const mentorStatus = row[15] || "accepted";
        const createdBy = row[16];

        // Determine members and owner
        const rawMembers = teamMembersByTeamId.get(sqlId) || [];
        const memberMongoIds = [];
        let leadMongoId = null;

        for (const rm of rawMembers) {
            const mId = userSqlIdToMongoId.get(rm.userId);
            if (mId) {
                memberMongoIds.push(mId);
                if (rm.isLead === 1) {
                    leadMongoId = mId;
                }
            }
        }

        // Special handling for Team 40 Thinkflux
        if (sqlId === 40) {
            if (punitUser) {
                leadMongoId = punitUser._id;
                if (!memberMongoIds.some((id) => id.toString() === punitUser._id.toString())) {
                    memberMongoIds.push(punitUser._id);
                }
            }
            if (student149User) {
                if (!memberMongoIds.some((id) => id.toString() === student149User._id.toString())) {
                    memberMongoIds.push(student149User._id);
                }
            }
        }

        let ownerId = leadMongoId;
        if (!ownerId && memberMongoIds.length > 0) {
            ownerId = memberMongoIds[0];
        }
        if (!ownerId && createdBy && userSqlIdToMongoId.has(createdBy)) {
            ownerId = userSqlIdToMongoId.get(createdBy);
        }
        if (!ownerId && mentorId && userSqlIdToMongoId.has(mentorId)) {
            ownerId = userSqlIdToMongoId.get(mentorId);
        }
        if (!ownerId) {
            ownerId = punitUser?._id || userSqlIdToMongoId.get(1) || userSqlIdToMongoId.get(2);
        }

        // Exclude owner from regular members list to prevent duplicate display
        const cleanMembers = memberMongoIds.filter(
            (id) => String(id) !== String(ownerId)
        );
        // Deduplicate
        const uniqueMemberIds = Array.from(
            new Set(cleanMembers.map(String))
        ).map((id) => new mongoose.Types.ObjectId(id));

        // Determine progress and status
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

        const projectDoc = {
            name: teamName,
            title: teamName,
            projectTitle,
            description: projectTitle,
            githubUrl: repoUrl,
            demoUrl,
            pptUrl,
            progress,
            status,
            priority,
            owner: ownerId,
            members: uniqueMemberIds,
            teamMembers: uniqueMemberIds,
            createdAt,
        };

        const existingProject = await Project.findOne({ name: teamName });

        let mongoProject;
        if (existingProject) {
            mongoProject = await Project.findByIdAndUpdate(
                existingProject._id,
                { $set: projectDoc },
                { new: true, runValidators: false }
            );
            projectsUpdated++;
        } else {
            mongoProject = await Project.create(projectDoc);
            projectsCreated++;
        }

        teamSqlIdToMongoId.set(sqlId, mongoProject._id);
    }

    console.log(`Projects synced: ${projectsCreated} created, ${projectsUpdated} updated (Total: ${teamSqlIdToMongoId.size})`);

    // Verify Thinkflux Project
    const thinkfluxProject = await Project.findOne({ name: /Thinkflux/i })
        .populate("owner", "name email")
        .populate("members", "name email");

    if (thinkfluxProject) {
        console.log("------------------------------------------");
        console.log("Verified Project: THINKFLUX");
        console.log(`Title: ${thinkfluxProject.title}`);
        console.log(`Description: ${thinkfluxProject.description}`);
        console.log(`Owner: ${thinkfluxProject.owner?.name} (${thinkfluxProject.owner?.email})`);
        console.log(`Members Count: ${thinkfluxProject.members?.length}`);
        console.log(`Progress: ${thinkfluxProject.progress}% | Status: ${thinkfluxProject.status}`);
        console.log(`GitHub URL: ${thinkfluxProject.githubUrl}`);
        console.log(`Demo URL: ${thinkfluxProject.demoUrl}`);
        console.log(`PPT URL: ${thinkfluxProject.pptUrl}`);
        console.log("------------------------------------------");
    }

    // 5. Map and migrate tasks
    console.log("Seeding / Syncing Tasks...");
    let tasksCreated = 0;
    let tasksUpdated = 0;

    const taskStatusMap = {
        todo: "Todo",
        in_progress: "In Progress",
        in_review: "In Review",
        done: "Completed",
    };

    const taskPriorityMap = {
        low: "Low",
        medium: "Medium",
        high: "High",
    };

    for (const row of tasksSql) {
        const sqlTaskId = row[0];
        const sqlTeamId = row[1];
        const title = (row[3] || "").trim().slice(0, 300);
        const description = (row[4] || "").trim();
        const assigneeSqlId = row[5];
        const dueDate = row[6] ? new Date(row[6]) : null;
        const rawStatus = (row[7] || "todo").toLowerCase();
        const rawPriority = (row[8] || "medium").toLowerCase();
        const createdBySqlId = row[13];
        const createdAt = row[14] ? new Date(row[14]) : new Date();
        const completedAt = row[15] ? new Date(row[15]) : (rawStatus === "done" ? new Date() : null);

        if (!title) continue;

        const projectMongoId = teamSqlIdToMongoId.get(sqlTeamId);
        if (!projectMongoId) continue;

        const assignedTo = userSqlIdToMongoId.get(assigneeSqlId) || null;
        let createdBy = userSqlIdToMongoId.get(createdBySqlId);
        if (!createdBy) {
            const proj = await Project.findById(projectMongoId).select("owner");
            createdBy = proj?.owner || punitUser?._id;
        }

        const status = taskStatusMap[rawStatus] || "Todo";
        const priority = taskPriorityMap[rawPriority] || "Medium";

        const taskDoc = {
            title,
            description,
            project: projectMongoId,
            assignedTo,
            createdBy,
            status,
            priority,
            dueDate,
            completedAt,
            createdAt,
        };

        const existingTask = await Task.findOne({
            title,
            project: projectMongoId,
        });

        if (existingTask) {
            await Task.findByIdAndUpdate(
                existingTask._id,
                { $set: taskDoc },
                { new: true, runValidators: false }
            );
            tasksUpdated++;
        } else {
            await Task.create(taskDoc);
            tasksCreated++;
        }
    }

    console.log(`Tasks synced: ${tasksCreated} created, ${tasksUpdated} updated.`);

    // 6. Map and migrate notifications for existing users
    console.log("Seeding / Syncing Notifications...");
    let notificationsCreated = 0;
    let notificationsSkipped = 0;

    // To prevent unbounded noise, seed notifications for users that belong to projects
    for (const row of notificationsSql) {
        const sqlNotifId = row[0];
        const userSqlId = row[1];
        const rawMessage = (row[2] || "").trim();
        const read = row[4] === 1;
        const createdAt = row[5] ? new Date(row[5]) : new Date();

        if (!rawMessage) continue;

        const recipientMongoId = userSqlIdToMongoId.get(userSqlId);
        if (!recipientMongoId) {
            notificationsSkipped++;
            continue;
        }

        const message = rawMessage.slice(0, 300);

        let type = "general";
        if (message.toLowerCase().includes("task assigned")) {
            type = "task_assigned";
        } else if (message.toLowerCase().includes("moved to")) {
            type = "task_updated";
        } else if (message.toLowerCase().includes("due today") || message.toLowerCase().includes("reminder")) {
            type = "reminder";
        }

        const existingNotif = await Notification.findOne({
            recipient: recipientMongoId,
            message,
        });

        if (!existingNotif) {
            await Notification.create({
                recipient: recipientMongoId,
                message,
                type,
                isRead: read,
                createdAt,
            });
            notificationsCreated++;
        }
    }

    console.log(`Notifications synced: ${notificationsCreated} created (${notificationsSkipped} skipped).`);

    console.log("==========================================");
    console.log("Migration Completed Successfully!");
    console.log("==========================================");

    await mongoose.disconnect();
}

runMigration().catch((err) => {
    console.error("Migration Failed:", err);
    process.exit(1);
});
