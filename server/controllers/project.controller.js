import pool from "../config/db.js";
import { formatProject, parsePositiveInt, isSafeHttpUrl, isPresentHttpUrl, pickAllowedFields } from "../utils/formatters.js";
import { isDirector } from "../middleware/directorGuard.js";
import { readCache, invalidateAllCaches } from "../utils/microCache.js";

const VALID_STATUSES = ["Planning", "In Progress", "Completed", "On Hold"];
const VALID_PRIORITIES = ["Low", "Medium", "High"];
const MAX_TITLE_LEN = 150;
const MAX_DESC_LEN = 2000;

// 1. CREATE PROJECT
export const createProject = async (req, res, next) => {
    try {
        // Strict field allowlist: ignores injected owner_id, mentor_id (direct assignment), role, created_by, id, etc.
        // mentorId triggers a pending mentor invitation — mentor must accept before being assigned to projects.mentor_id
        const {
            name,
            title,
            description,
            status,
            priority,
            deadline,
            githubUrl,
            demoUrl,
            pptUrl,
            progress,
            teamMembers,
            mentorId,
            mentor_id,
        } = pickAllowedFields(req.body, [
            "name",
            "title",
            "description",
            "status",
            "priority",
            "deadline",
            "githubUrl",
            "demoUrl",
            "pptUrl",
            "progress",
            "teamMembers",
            "mentorId",
            "mentor_id",
        ]);

        const rawTitle = title !== undefined ? title : name;
        const projectTitle = typeof rawTitle === "string" ? rawTitle.trim() : "";
        if (!projectTitle) {
            return res.status(400).json({
                success: false,
                message: "Project title/name is required",
            });
        }
        if (projectTitle.length > MAX_TITLE_LEN) {
            return res.status(400).json({
                success: false,
                message: `Project title cannot exceed ${MAX_TITLE_LEN} characters`,
            });
        }

        const cleanDesc = description !== undefined && description !== null ? String(description).trim() : "";
        if (cleanDesc.length > MAX_DESC_LEN) {
            return res.status(400).json({
                success: false,
                message: `Project description cannot exceed ${MAX_DESC_LEN} characters`,
            });
        }

        const cleanGithub = githubUrl !== undefined && githubUrl !== null ? String(githubUrl).trim() : "";
        const cleanDemo = demoUrl !== undefined && demoUrl !== null ? String(demoUrl).trim() : "";
        const cleanPpt = pptUrl !== undefined && pptUrl !== null ? String(pptUrl).trim() : "";

        if (!isSafeHttpUrl(cleanGithub) || !isSafeHttpUrl(cleanDemo) || !isSafeHttpUrl(cleanPpt)) {
            return res.status(400).json({
                success: false,
                message: "Deliverable URLs must be valid http:// or https:// links (max 500 chars)",
            });
        }

        let projectDeadline = null;
        if (deadline !== undefined && deadline !== null && deadline !== "") {
            const parsed = new Date(deadline);
            if (Number.isNaN(parsed.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid deadline date format",
                });
            }
            projectDeadline = parsed;
        }

        if (status !== undefined && String(status).toLowerCase() === "completed") {
            return res.status(400).json({
                success: false,
                message: "Cannot mark a new project as Completed: project must have at least 1 task, and all tasks must be completed.",
            });
        }

        const projectStatus = VALID_STATUSES.includes(status) ? status : "Planning";
        const projectPriority = VALID_PRIORITIES.includes(priority) ? priority : "Medium";
        const projectProgress = 0; // New projects strictly start with 0% progress
        const ownerId = req.user.id;

        // Anti-Double Submit / Race Condition Protection (5-second idempotency window per owner & title)
        const duplicateCheck = await pool.query(
            `SELECT * FROM projects
             WHERE owner_id = $1 AND LOWER(TRIM(title)) = LOWER(TRIM($2))
               AND created_at > NOW() - INTERVAL '5 seconds'
             ORDER BY created_at DESC LIMIT 1;`,
            [ownerId, projectTitle]
        );
        if (duplicateCheck.rows.length > 0) {
            return res.status(200).json({
                success: true,
                message: "Project created successfully",
                project: formatProject(duplicateCheck.rows[0]),
                data: formatProject(duplicateCheck.rows[0]),
            });
        }

        const insertRes = await pool.query(`
            INSERT INTO projects (title, description, status, priority, progress, deadline, owner_id, github_url, demo_url, ppt_url, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            RETURNING *;
        `, [
            projectTitle,
            cleanDesc,
            projectStatus,
            projectPriority,
            projectProgress,
            projectDeadline,
            ownerId,
            cleanGithub,
            cleanDemo,
            cleanPpt,
        ]);

        const project = insertRes.rows[0];

        // If teamMembers provided (array of user IDs), validate active users before inserting
        const addedMembers = [];
        if (Array.isArray(teamMembers) && teamMembers.length > 0) {
            const candidateIds = [
                ...new Set(
                    teamMembers
                        .slice(0, 50)
                        .map((id) => parsePositiveInt(id))
                        .filter((id) => id && id !== ownerId)
                ),
            ];
            if (candidateIds.length > 0) {
                const validUsersRes = await pool.query(
                    "SELECT id FROM users WHERE id = ANY($1) AND is_active = TRUE;",
                    [candidateIds]
                );
                for (const row of validUsersRes.rows) {
                    await pool.query(`
                        INSERT INTO project_members (project_id, user_id, role)
                        VALUES ($1, $2, 'member')
                        ON CONFLICT (project_id, user_id) DO NOTHING;
                    `, [project.id, row.id]);
                    addedMembers.push({ id: row.id, _id: row.id });
                }
            }
        }

        // Optional Student-Driven Mentor Invitation: never assigns projects.mentor_id directly; mentor must accept
        let mentorInvitation = null;
        const rawMentorId = mentorId ?? mentor_id;
        if (rawMentorId !== undefined && rawMentorId !== null && rawMentorId !== "") {
            const parsedMentorId = parsePositiveInt(rawMentorId);
            if (parsedMentorId && parsedMentorId !== ownerId) {
                const mentorRes = await pool.query(
                    `SELECT id, name, email, role, is_active
                     FROM users
                     WHERE id = $1 AND is_active = TRUE AND LOWER(role) IN ('mentor', 'faculty');`,
                    [parsedMentorId]
                );
                if (mentorRes.rows.length > 0) {
                    const targetMentor = mentorRes.rows[0];
                    const invRes = await pool.query(
                        `INSERT INTO invitations (project_id, recipient_email, recipient_id, sender_id, role, status, created_at)
                         VALUES ($1, $2, $3, $4, 'mentor', 'Pending', NOW())
                         RETURNING id, project_id, recipient_email, recipient_id, role, status, created_at;`,
                        [project.id, targetMentor.email.toLowerCase(), targetMentor.id, ownerId]
                    );
                    mentorInvitation = {
                        ...invRes.rows[0],
                        mentor: { id: targetMentor.id, name: targetMentor.name, email: targetMentor.email },
                    };

                    const notifRes = await pool.query(
                        `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                         VALUES ($1, 'Mentor Invitation', $2, 'mentor_invitation', FALSE, NOW())
                         RETURNING id, title, message, type, is_read, created_at;`,
                        [
                            targetMentor.id,
                            `${req.user.name} invited you to mentor project "${project.title}". Accept or decline from your Mentor Dashboard.`,
                        ]
                    );
                    const io = req.app.get("io");
                    if (io && notifRes.rows[0]) {
                        io.to(`user:${targetMentor.id}`).emit("notification:new", {
                            id: notifRes.rows[0].id,
                            _id: notifRes.rows[0].id,
                            title: notifRes.rows[0].title,
                            message: notifRes.rows[0].message,
                            type: notifRes.rows[0].type,
                            project: project.id,
                            isRead: false,
                            createdAt: notifRes.rows[0].created_at,
                        });
                    }
                }
            }
        }

        invalidateAllCaches();

        return res.status(201).json({
            success: true,
            message: mentorInvitation
                ? "Project created and mentor invitation sent! The mentor will be assigned once they accept."
                : "Project created successfully",
            mentorInvitation,
            project: formatProject(project, addedMembers, {
                id: req.user.id,
                _id: req.user.id,
                name: req.user.name,
                email: req.user.email,
            }),
        });
    } catch (error) {
        next(error);
    }
};

// 2. GET PROJECTS (Strict Project Isolation + Bounded 3s Micro Cache)
export const getProjects = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = String(req.user.role || "student").toLowerCase().trim();
        const directorFlag = isDirector(req.user);
        const isAdmin = role === "admin" || role === "coordinator" || directorFlag;
        const cacheKey = `projects:u:${userId}:r:${role}:d:${directorFlag ? 1 : 0}`;

        const formattedProjects = await readCache.getOrSet(cacheKey, async () => {
            let projectsQuery;
            let queryParams;

            if (isAdmin) {
                projectsQuery = `
                    SELECT p.*, u.name as owner_name, u.email as owner_email,
                           (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                           (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
                    FROM projects p
                    LEFT JOIN users u ON p.owner_id = u.id
                    ORDER BY p.created_at DESC;
                `;
                queryParams = [];
            } else {
                projectsQuery = `
                    SELECT DISTINCT p.*, u.name as owner_name, u.email as owner_email,
                           (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                           (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
                    FROM projects p
                    LEFT JOIN users u ON p.owner_id = u.id
                    WHERE (
                        p.owner_id = $1 
                        OR p.mentor_id = $1 
                        OR p.id IN (SELECT project_id FROM project_members WHERE user_id = $1)
                    )
                    ORDER BY p.created_at DESC;
                `;
                queryParams = [userId];
            }

            const { rows: projects } = await pool.query(projectsQuery, queryParams);
            if (projects.length === 0) return [];

            const projectIds = projects.map((p) => p.id);
            const membersRes = await pool.query(`
                SELECT pm.project_id, pm.role, u.id, u.name, u.email, u.roll_no
                FROM project_members pm
                JOIN users u ON pm.user_id = u.id
                WHERE pm.project_id = ANY($1);
            `, [projectIds]);

            const membersByProject = new Map();
            for (const m of membersRes.rows) {
                if (!membersByProject.has(m.project_id)) {
                    membersByProject.set(m.project_id, []);
                }
                membersByProject.get(m.project_id).push({
                    id: m.id,
                    _id: m.id,
                    name: m.name,
                    email: m.email,
                    role: m.role,
                    roll_no: m.roll_no,
                });
            }

            return projects.map((p) => {
                const rawMembers = membersByProject.get(p.id) || [];
                const cleanMembers = rawMembers.filter((m) => String(m.id) !== String(p.owner_id));
                const ownerObj = p.owner_id ? {
                    id: p.owner_id,
                    _id: p.owner_id,
                    name: p.owner_name || "Lead",
                    email: p.owner_email || "",
                } : null;

                return formatProject(p, cleanMembers, ownerObj);
            });
        });

        return res.status(200).json({
            success: true,
            count: formattedProjects.length,
            projects: formattedProjects,
            data: formattedProjects,
        });
    } catch (error) {
        next(error);
    }
};

// 3. GET PROJECT BY ID
export const getProjectById = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.id);
        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID is required",
            });
        }

        const { rows } = await pool.query(`
            SELECT p.*, u.name as owner_name, u.email as owner_email,
                   (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                   (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
            FROM projects p
            LEFT JOIN users u ON p.owner_id = u.id
            WHERE p.id = $1;
        `, [projectId]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const project = rows[0];
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator" || isDirector(req.user);

        // Check membership
        const memberCheck = await pool.query(
            "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
            [projectId, userId]
        );
        const isMember = memberCheck.rows.length > 0;
        const isOwner = Number(project.owner_id) === Number(userId);
        const isMentor = Number(project.mentor_id) === Number(userId);

        if (!isAdmin && !isOwner && !isMember && !isMentor) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this project",
            });
        }

        const membersRes = await pool.query(`
            SELECT pm.role, u.id, u.name, u.email, u.roll_no
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = $1;
        `, [projectId]);

        const rawMembers = membersRes.rows.map((m) => ({
            id: m.id,
            _id: m.id,
            name: m.name,
            email: m.email,
            role: m.role,
            roll_no: m.roll_no,
        }));

        const cleanMembers = rawMembers.filter((m) => String(m.id) !== String(project.owner_id));

        const ownerObj = project.owner_id ? {
            id: project.owner_id,
            _id: project.owner_id,
            name: project.owner_name || "Lead",
            email: project.owner_email || "",
        } : null;

        return res.status(200).json({
            success: true,
            project: formatProject(project, cleanMembers, ownerObj),
        });
    } catch (error) {
        next(error);
    }
};

// 4. UPDATE PROJECT
export const updateProject = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.id);
        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID is required",
            });
        }

        const { rows } = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const existingProject = rows[0];
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";
        const isOwner = Number(existingProject.owner_id) === Number(userId);

        if (!isAdmin && !isOwner) {
            return res.status(403).json({
                success: false,
                message: "Only the project owner or an administrator can update this project",
            });
        }

        // Strict field allowlist: ignores injected owner_id, mentor_id, role, created_by, id, etc.
        const {
            name,
            title,
            description,
            status,
            priority,
            deadline,
            githubUrl,
            demoUrl,
            pptUrl,
            progress,
        } = pickAllowedFields(req.body, [
            "name",
            "title",
            "description",
            "status",
            "priority",
            "deadline",
            "githubUrl",
            "demoUrl",
            "pptUrl",
            "progress",
        ]);

        let newTitle = existingProject.title;
        const rawTitle = title !== undefined ? title : name;
        if (rawTitle !== undefined) {
            if (typeof rawTitle !== "string" || !rawTitle.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Project title/name cannot be empty",
                });
            }
            if (rawTitle.trim().length > MAX_TITLE_LEN) {
                return res.status(400).json({
                    success: false,
                    message: `Project title cannot exceed ${MAX_TITLE_LEN} characters`,
                });
            }
            newTitle = rawTitle.trim();
        }

        let newDescription = existingProject.description;
        if (description !== undefined) {
            const cleanDesc = description === null ? "" : String(description).trim();
            if (cleanDesc.length > MAX_DESC_LEN) {
                return res.status(400).json({
                    success: false,
                    message: `Project description cannot exceed ${MAX_DESC_LEN} characters`,
                });
            }
            newDescription = cleanDesc;
        }

        // Query current task counts for completion validation & strict progress calculation
        const taskStatsRes = await pool.query(`
            SELECT COUNT(*)::int AS total_tasks,
                   COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed_tasks
            FROM tasks
            WHERE project_id = $1
        `, [projectId]);
        const totalTasks = Number(taskStatsRes.rows[0]?.total_tasks || 0);
        const completedTasks = Number(taskStatsRes.rows[0]?.completed_tasks || 0);

        const newStatus = status !== undefined && VALID_STATUSES.includes(status) ? status : existingProject.status;

        // Strict Completion Guard: Block setting status = 'Completed' unless total_tasks >= 1 AND completed_tasks === total_tasks
        if (status !== undefined && String(status).toLowerCase() === "completed") {
            if (totalTasks === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot mark project as Completed: at least 1 task must exist and be completed (current: 0 tasks).",
                });
            }
            if (completedTasks !== totalTasks) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot mark project as Completed: all project tasks must be completed first (${completedTasks}/${totalTasks} completed).`,
                });
            }
        }

        const newPriority = priority !== undefined && VALID_PRIORITIES.includes(priority) ? priority : existingProject.priority;
        // Strictly compute progress from actual task counts: total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0
        const newProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        let newDeadline = existingProject.deadline;
        if (deadline !== undefined) {
            if (deadline === null || deadline === "") {
                newDeadline = null;
            } else {
                const parsed = new Date(deadline);
                if (Number.isNaN(parsed.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid deadline date format",
                    });
                }
                newDeadline = parsed;
            }
        }

        const newGithub = githubUrl !== undefined ? (githubUrl === null ? "" : String(githubUrl).trim()) : existingProject.github_url;
        const newDemo = demoUrl !== undefined ? (demoUrl === null ? "" : String(demoUrl).trim()) : existingProject.demo_url;
        const newPpt = pptUrl !== undefined ? (pptUrl === null ? "" : String(pptUrl).trim()) : existingProject.ppt_url;

        if (!isSafeHttpUrl(newGithub) || !isSafeHttpUrl(newDemo) || !isSafeHttpUrl(newPpt)) {
            return res.status(400).json({
                success: false,
                message: "Deliverable URLs must be valid http:// or https:// links (max 500 chars)",
            });
        }

        // Leaderboard rule enforcement:
        // A project can only stay on the leaderboard if status is 100% completed AND both PPT and Live Demo link are valid and present.
        const isCompleted = String(newStatus).toLowerCase() === "completed" && totalTasks >= 1 && completedTasks === totalTasks;
        const hasBothDeliverables = isPresentHttpUrl(newPpt) && isPresentHttpUrl(newDemo);
        const qualifiesForLeaderboard = isCompleted && hasBothDeliverables;

        let unlistLeaderboard = false;
        if (existingProject.is_on_leaderboard && !qualifiesForLeaderboard) {
            unlistLeaderboard = true;
        }

        // updated_at automatically updated by PostgreSQL trigger
        const updateRes = await pool.query(`
            UPDATE projects
            SET title = $1,
                description = $2,
                status = $3,
                priority = $4,
                progress = $5,
                deadline = $6,
                github_url = $7,
                demo_url = $8,
                ppt_url = $9,
                is_on_leaderboard = CASE WHEN $11::boolean = TRUE THEN FALSE ELSE is_on_leaderboard END,
                updated_at = NOW()
            WHERE id = $10
            RETURNING *;
        `, [
            newTitle,
            newDescription,
            newStatus,
            newPriority,
            newProgress,
            newDeadline,
            newGithub,
            newDemo,
            newPpt,
            projectId,
            unlistLeaderboard,
        ]);

        const updated = updateRes.rows[0];
        invalidateAllCaches();

        if (unlistLeaderboard) {
            const io = req.app.get("io");
            if (io) {
                io.emit("leaderboard:project_withdrawn", { projectId });
            }
        }

        // Fetch members
        const membersRes = await pool.query(`
            SELECT pm.role, u.id, u.name, u.email, u.roll_no
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = $1;
        `, [projectId]);

        const cleanMembers = membersRes.rows
            .map((m) => ({ id: m.id, _id: m.id, name: m.name, email: m.email, role: m.role, roll_no: m.roll_no }))
            .filter((m) => String(m.id) !== String(updated.owner_id));

        return res.status(200).json({
            success: true,
            message: "Project updated successfully",
            project: formatProject(updated, cleanMembers),
        });
    } catch (error) {
        next(error);
    }
};

// 5. DELETE PROJECT
export const deleteProject = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.id);
        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID is required",
            });
        }

        const { rows } = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const project = rows[0];
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";
        const isOwner = Number(project.owner_id) === Number(userId);

        if (!isAdmin && !isOwner) {
            return res.status(403).json({
                success: false,
                message: "Only the project owner or an administrator can delete this project",
            });
        }

        await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);
        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: "Project deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};
