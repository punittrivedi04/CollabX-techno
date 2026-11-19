import pool from "../config/db.js";
import {
    safeUser,
    formatTask,
    parsePositiveInt,
    escapeLikePattern,
    pickAllowedFields,
    isPresentHttpUrl,
} from "../utils/formatters.js";
import { readCache, invalidateAllCaches } from "../utils/microCache.js";
import logActivity from "../utils/activityLogger.js";

const VALID_TASK_STATUSES = ["Todo", "In Progress", "In Review", "Completed"];
const VALID_PRIORITIES = ["Low", "Medium", "High"];
const MAX_TITLE_LEN = 150;
const MAX_DESC_LEN = 2000;

const normalizeStatus = (status) => {
    if (!status) return null;
    const s = String(status).trim().toLowerCase();
    if (s === "todo" || s === "to do") return "Todo";
    if (s === "in_progress" || s === "in progress") return "In Progress";
    if (s === "in_review" || s === "in review") return "In Review";
    if (s === "completed" || s === "done" || s === "approved") return "Completed";
    return VALID_TASK_STATUSES.includes(status) ? status : null;
};

const normalizePriority = (priority) => {
    if (!priority) return "Medium";
    const p = String(priority).trim().toLowerCase();
    if (p === "low") return "Low";
    if (p === "medium") return "Medium";
    if (p === "high") return "High";
    return VALID_PRIORITIES.includes(priority) ? priority : "Medium";
};

const createNotification = async ({ userId, title, message, type = "info", client = null, io = null }) => {
    const uid = parsePositiveInt(userId);
    if (!uid) return null;
    try {
        const executor = client || pool;
        const { rows } = await executor.query(
            `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
             VALUES ($1, $2, $3, $4, FALSE, NOW())
             RETURNING id, user_id, title, message, type, is_read, created_at;`,
            [uid, title, message, type]
        );
        const created = rows[0];
        if (io && created) {
            io.to(`user:${uid}`).emit("notification:new", {
                id: created.id,
                _id: created.id,
                title: created.title,
                message: created.message,
                type: created.type,
                isRead: false,
                createdAt: created.created_at,
            });
        }
        return created;
    } catch (err) {
        console.error("[Mentor Notification] Failed:", err.message);
        return null;
    }
};

const formatActivityRow = (a) => ({
    id: a.id,
    _id: a.id,
    projectId: a.project_id || null,
    projectTitle: a.project_title || null,
    user: a.user_id
        ? {
              id: a.user_id,
              _id: a.user_id,
              name: a.user_name || "User",
              email: a.user_email || "",
              role: a.user_role || "student",
          }
        : null,
    action: a.action,
    description: a.description,
    entityType: a.entity_type,
    entityId: a.entity_id,
    metadata: a.metadata || {},
    createdAt: a.created_at,
});

const formatAnnouncementRow = (row) => ({
    id: row.id,
    _id: row.id,
    title: row.title,
    content: row.content,
    targetRole: row.target_role || "all",
    target_role: row.target_role || "all",
    projectId: row.project_id || null,
    project_id: row.project_id || null,
    projectTitle: row.project_title || null,
    scope: row.project_id ? "team" : "institute",
    createdBy: row.created_by
        ? {
              id: row.created_by,
              _id: row.created_by,
              name: row.creator_name || "Mentor",
              email: row.creator_email || "",
              role: row.creator_role || "mentor",
          }
        : null,
    createdAt: row.created_at,
});

// Check whether a student belongs to this mentor (direct users.mentor_id OR member/owner of a mentored project)
const isMentorAuthorizedForStudent = async (mentorId, studentId) => {
    const { rows } = await pool.query(
        `SELECT 1
         FROM users u
         WHERE u.id = $2
           AND LOWER(COALESCE(u.role, 'student')) = 'student'
           AND (
               u.mentor_id = $1
               OR EXISTS (SELECT 1 FROM projects p WHERE p.mentor_id = $1 AND p.owner_id = $2)
               OR EXISTS (
                   SELECT 1
                   FROM project_members pm
                   JOIN projects p ON p.id = pm.project_id
                   WHERE p.mentor_id = $1 AND pm.user_id = $2
               )
           )
         LIMIT 1;`,
        [mentorId, studentId]
    );
    return rows.length > 0;
};

// ==========================================
// 1. GET /api/mentor/overview
// ==========================================
export const getMentorOverview = async (req, res, next) => {
    try {
        const mentorId = req.user.id;
        const cacheKey = `mentor:overview:u:${mentorId}`;

        const overview = await readCache.getOrSet(cacheKey, async () => {
            const [projectsRes, studentsRes] = await Promise.all([
                pool.query(
                    `SELECT p.*, o.name AS owner_name, o.email AS owner_email, o.roll_no AS owner_roll_no,
                            (
                                SELECT COUNT(DISTINCT uid)::int FROM (
                                    SELECT pm.user_id AS uid FROM project_members pm WHERE pm.project_id = p.id
                                    UNION
                                    SELECT p.owner_id AS uid WHERE p.owner_id IS NOT NULL
                                ) sub
                            ) AS member_count,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
                     FROM projects p
                     LEFT JOIN users o ON o.id = p.owner_id
                     WHERE p.mentor_id = $1
                     ORDER BY p.updated_at DESC, p.id DESC;`,
                    [mentorId]
                ),
                pool.query(
                    `SELECT DISTINCT u.id, u.name, u.email, u.roll_no, u.role, u.phone, u.mentor_id, u.role_classified,
                            u.is_verified, u.is_active, u.created_at
                     FROM users u
                     WHERE LOWER(COALESCE(u.role, 'student')) = 'student'
                       AND (
                           u.mentor_id = $1
                           OR u.id IN (SELECT owner_id FROM projects WHERE mentor_id = $1 AND owner_id IS NOT NULL)
                           OR u.id IN (
                               SELECT pm.user_id FROM project_members pm
                               JOIN projects p ON p.id = pm.project_id
                               WHERE p.mentor_id = $1
                           )
                       )
                     ORDER BY u.created_at DESC, u.id DESC;`,
                    [mentorId]
                ),
            ]);

            const projects = projectsRes.rows;
            const projectIds = projects.map((p) => p.id);
            const students = studentsRes.rows;

            let pendingTasks = 0;
            let completedTasks = 0;
            let pendingStudentTasks = [];
            let upcomingTaskDeadlines = [];
            let recentActivities = [];

            if (projectIds.length > 0) {
                const [taskStatsRes, pendingTasksRes, upcomingTaskRes, activitiesRes] = await Promise.all([
                    pool.query(
                        `SELECT
                            COUNT(*) FILTER (WHERE status != 'Completed')::int AS pending_tasks,
                            COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed_tasks
                         FROM tasks
                         WHERE project_id = ANY($1);`,
                        [projectIds]
                    ),
                    pool.query(
                        `SELECT t.*, p.title AS project_title,
                                u_a.name AS assignee_name, u_a.email AS assignee_email,
                                u_c.name AS creator_name, u_c.email AS creator_email
                         FROM tasks t
                         JOIN projects p ON p.id = t.project_id
                         LEFT JOIN users u_a ON u_a.id = t.assigned_to
                         LEFT JOIN users u_c ON u_c.id = t.created_by
                         WHERE t.project_id = ANY($1) AND t.status != 'Completed'
                         ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
                         LIMIT 15;`,
                        [projectIds]
                    ),
                    pool.query(
                        `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.project_id,
                                p.title AS project_title, u_a.name AS assignee_name
                         FROM tasks t
                         JOIN projects p ON p.id = t.project_id
                         LEFT JOIN users u_a ON u_a.id = t.assigned_to
                         WHERE t.project_id = ANY($1)
                           AND t.due_date IS NOT NULL
                           AND t.due_date >= NOW()
                           AND t.status != 'Completed'
                         ORDER BY t.due_date ASC
                         LIMIT 10;`,
                        [projectIds]
                    ),
                    pool.query(
                        `SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                                p.title AS project_title
                         FROM activities a
                         LEFT JOIN users u ON u.id = a.user_id
                         LEFT JOIN projects p ON p.id = a.project_id
                         WHERE a.project_id = ANY($1) OR a.user_id = $2
                         ORDER BY a.created_at DESC
                         LIMIT 20;`,
                        [projectIds, mentorId]
                    ),
                ]);

                pendingTasks = Number(taskStatsRes.rows[0]?.pending_tasks || 0);
                completedTasks = Number(taskStatsRes.rows[0]?.completed_tasks || 0);
                pendingStudentTasks = pendingTasksRes.rows.map((t) => formatTask(t));
                upcomingTaskDeadlines = upcomingTaskRes.rows.map((t) => ({
                    type: "task",
                    id: t.id,
                    title: t.title,
                    projectId: t.project_id,
                    projectTitle: t.project_title,
                    assigneeName: t.assignee_name || null,
                    status: t.status,
                    priority: t.priority,
                    deadline: t.due_date,
                }));
                recentActivities = activitiesRes.rows.map(formatActivityRow);
            } else {
                const actRes = await pool.query(
                    `SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                            p.title AS project_title
                     FROM activities a
                     LEFT JOIN users u ON u.id = a.user_id
                     LEFT JOIN projects p ON p.id = a.project_id
                     WHERE a.user_id = $1
                     ORDER BY a.created_at DESC
                     LIMIT 20;`,
                    [mentorId]
                );
                recentActivities = actRes.rows.map(formatActivityRow);
            }

            const now = Date.now();
            const upcomingProjectDeadlines = projects
                .filter((p) => p.deadline && new Date(p.deadline).getTime() >= now && p.status !== "Completed")
                .map((p) => ({
                    type: "project",
                    id: p.id,
                    projectId: p.id,
                    title: p.title,
                    status: p.status,
                    priority: p.priority,
                    progress: Number(p.progress || 0),
                    deadline: p.deadline,
                }));

            const upcomingDeadlines = [...upcomingProjectDeadlines, ...upcomingTaskDeadlines]
                .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
                .slice(0, 15);

            const activeTeams = projects.map((p) => {
                const totalT = Number(p.total_tasks || 0);
                const compT = Number(p.completed_tasks || 0);
                const taskProgressRate = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                const status = String(p.status).toLowerCase() === "completed" && (totalT === 0 || compT < totalT)
                    ? (compT > 0 ? "In Progress" : "Planning")
                    : p.status;
                return {
                    id: p.id,
                    _id: p.id,
                    projectId: p.id,
                    title: p.title,
                    name: p.title,
                    status,
                    priority: p.priority,
                    progress: taskProgressRate,
                    deadline: p.deadline,
                    teamLeader: p.owner_id
                        ? { id: p.owner_id, name: p.owner_name, email: p.owner_email, roll_no: p.owner_roll_no || "" }
                        : null,
                    memberCount: Number(p.member_count || 0),
                    taskProgress: {
                        total: totalT,
                        completed: compT,
                        pending: totalT - compT,
                        completionRate: taskProgressRate,
                    },
                };
            });

            const activeProjects = projects.filter((p) => p.status !== "Completed").length;
            const stats = {
                totalStudents: students.length,
                totalTeams: projects.length,
                activeProjects,
                pendingTasks,
                completedTasks,
            };

            return {
                ...stats,
                stats,
                upcomingDeadlines,
                recentStudents: students.slice(0, 8).map(safeUser),
                activeTeams,
                pendingStudentTasks,
                recentActivities,
            };
        });

        return res.status(200).json({
            success: true,
            ...overview,
            data: overview,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 2. GET /api/mentor/students
// ==========================================
export const getMentorStudents = async (req, res, next) => {
    try {
        const mentorId = req.user.id;
        const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
        const teamId = req.query.teamId || req.query.projectId ? parsePositiveInt(req.query.teamId || req.query.projectId) : null;

        if ((req.query.teamId || req.query.projectId) && !teamId) {
            return res.status(400).json({ success: false, message: "Valid teamId/projectId filter is required" });
        }

        // If filtering by specific teamId, enforce ownership
        if (teamId) {
            const pCheck = await pool.query("SELECT id, mentor_id FROM projects WHERE id = $1", [teamId]);
            if (pCheck.rows.length === 0) {
                return res.status(404).json({ success: false, message: "Team/Project not found" });
            }
            if (Number(pCheck.rows[0].mentor_id) !== Number(mentorId)) {
                return res.status(403).json({ success: false, message: "You do not have access to this team" });
            }
        }

        const cacheKey = `mentor:students:u:${mentorId}:q:${search}:t:${teamId || ""}`;
        const students = await readCache.getOrSet(cacheKey, async () => {
            const conditions = [
                "LOWER(COALESCE(u.role, 'student')) = 'student'",
                `(
                    u.mentor_id = $1
                    OR u.id IN (SELECT owner_id FROM projects WHERE mentor_id = $1 AND owner_id IS NOT NULL)
                    OR u.id IN (
                        SELECT pm.user_id FROM project_members pm
                        JOIN projects p ON p.id = pm.project_id
                        WHERE p.mentor_id = $1
                    )
                )`,
            ];
            const params = [mentorId];

            if (search) {
                params.push(`%${escapeLikePattern(search)}%`);
                const idx = params.length;
                conditions.push(`(u.name ILIKE $${idx} ESCAPE '\\' OR u.email ILIKE $${idx} ESCAPE '\\' OR COALESCE(u.roll_no, '') ILIKE $${idx} ESCAPE '\\')`);
            }

            if (teamId) {
                params.push(teamId);
                const idx = params.length;
                conditions.push(`EXISTS (
                    SELECT 1 FROM projects p
                    LEFT JOIN project_members pm ON pm.project_id = p.id
                    WHERE p.id = $${idx} AND p.mentor_id = $1 AND (p.owner_id = u.id OR pm.user_id = u.id)
                )`);
            }

            const { rows: studentRows } = await pool.query(
                `SELECT DISTINCT u.id, u.name, u.email, u.roll_no, u.role, u.phone, u.mentor_id, u.role_classified,
                        u.is_verified, u.is_active, u.created_at
                 FROM users u
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY u.name ASC
                 LIMIT 200;`,
                params
            );

            if (studentRows.length === 0) return [];
            const studentIds = studentRows.map((s) => s.id);

            const [projectsRes, tasksRes] = await Promise.all([
                pool.query(
                    `SELECT DISTINCT p.id, p.title, p.status, p.progress, p.deadline, p.owner_id,
                            CASE WHEN p.owner_id = s.sid THEN TRUE ELSE FALSE END AS is_leader,
                            s.sid AS student_id,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
                     FROM (
                         SELECT owner_id AS sid, id AS pid FROM projects WHERE mentor_id = $1 AND owner_id = ANY($2)
                         UNION
                         SELECT pm.user_id AS sid, pm.project_id AS pid
                         FROM project_members pm
                         JOIN projects p ON p.id = pm.project_id
                         WHERE p.mentor_id = $1 AND pm.user_id = ANY($2)
                     ) s
                     JOIN projects p ON p.id = s.pid
                     ORDER BY p.id ASC;`,
                    [mentorId, studentIds]
                ),
                pool.query(
                    `SELECT t.assigned_to AS student_id,
                            COUNT(*)::int AS total_tasks,
                            COUNT(*) FILTER (WHERE t.status = 'Completed')::int AS completed_tasks,
                            COUNT(*) FILTER (WHERE t.status != 'Completed')::int AS pending_tasks
                     FROM tasks t
                     JOIN projects p ON p.id = t.project_id
                     WHERE p.mentor_id = $1 AND t.assigned_to = ANY($2)
                     GROUP BY t.assigned_to;`,
                    [mentorId, studentIds]
                ),
            ]);

            const projectsByStudent = new Map();
            for (const row of projectsRes.rows) {
                if (!projectsByStudent.has(row.student_id)) projectsByStudent.set(row.student_id, []);
                const totalT = Number(row.total_tasks || 0);
                const compT = Number(row.completed_tasks || 0);
                const taskProgressRate = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                const status = String(row.status).toLowerCase() === "completed" && (totalT === 0 || compT < totalT)
                    ? (compT > 0 ? "In Progress" : "Planning")
                    : row.status;
                projectsByStudent.get(row.student_id).push({
                    id: row.id,
                    _id: row.id,
                    title: row.title,
                    name: row.title,
                    status,
                    progress: taskProgressRate,
                    deadline: row.deadline,
                    isLeader: Boolean(row.is_leader),
                    taskProgress: {
                        total: totalT,
                        completed: compT,
                        pending: totalT - compT,
                        completionRate: taskProgressRate,
                    },
                });
            }

            const tasksByStudent = new Map();
            for (const row of tasksRes.rows) {
                const totalT = Number(row.total_tasks || 0);
                const compT = Number(row.completed_tasks || 0);
                tasksByStudent.set(row.student_id, {
                    total: totalT,
                    completed: compT,
                    pending: Number(row.pending_tasks || 0),
                    completionRate: totalT > 0 ? Math.round((compT / totalT) * 100) : 0,
                });
            }

            return studentRows.map((s) => {
                const teams = projectsByStudent.get(s.id) || [];
                return {
                    ...safeUser(s),
                    team: teams[0] || null,
                    project: teams[0] || null,
                    teams,
                    taskProgress: tasksByStudent.get(s.id) || { total: 0, completed: 0, pending: 0, completionRate: 0 },
                };
            });
        });

        return res.status(200).json({
            success: true,
            count: students.length,
            students,
            data: students,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 3. GET /api/mentor/students/:id
// ==========================================
export const getMentorStudentById = async (req, res, next) => {
    try {
        const mentorId = req.user.id;
        const studentId = parsePositiveInt(req.params.id);
        if (!studentId) {
            return res.status(400).json({ success: false, message: "Valid student ID is required" });
        }

        const userCheck = await pool.query(
            `SELECT id, name, email, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at
             FROM users WHERE id = $1;`,
            [studentId]
        );
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Student not found" });
        }

        const allowed = await isMentorAuthorizedForStudent(mentorId, studentId);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "Forbidden. This student is not assigned to you.",
            });
        }

        const cacheKey = `mentor:student:u:${mentorId}:sid:${studentId}`;
        const detail = await readCache.getOrSet(cacheKey, async () => {
            const student = userCheck.rows[0];
            const [projectsRes, tasksRes] = await Promise.all([
                pool.query(
                    `SELECT DISTINCT p.*, o.name AS owner_name, o.email AS owner_email,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
                     FROM projects p
                     LEFT JOIN project_members pm ON pm.project_id = p.id
                     LEFT JOIN users o ON o.id = p.owner_id
                     WHERE p.mentor_id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)
                     ORDER BY p.created_at DESC;`,
                    [mentorId, studentId]
                ),
                pool.query(
                    `SELECT t.*, p.title AS project_title,
                            u_a.name AS assignee_name, u_a.email AS assignee_email,
                            u_c.name AS creator_name, u_c.email AS creator_email
                     FROM tasks t
                     JOIN projects p ON p.id = t.project_id
                     LEFT JOIN users u_a ON u_a.id = t.assigned_to
                     LEFT JOIN users u_c ON u_c.id = t.created_by
                     WHERE p.mentor_id = $1 AND t.assigned_to = $2
                     ORDER BY t.created_at DESC
                     LIMIT 100;`,
                    [mentorId, studentId]
                ),
            ]);

            const projectIds = projectsRes.rows.map((p) => p.id);
            const activitiesRes = await pool.query(
                `SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                        p.title AS project_title
                 FROM activities a
                 LEFT JOIN users u ON u.id = a.user_id
                 LEFT JOIN projects p ON p.id = a.project_id
                 WHERE ($2::int[] IS NOT NULL AND a.project_id = ANY($2))
                    OR (a.user_id = $1 AND a.project_id IS NULL)
                 ORDER BY a.created_at DESC
                 LIMIT 25;`,
                [studentId, projectIds.length > 0 ? projectIds : null]
            );

            const formattedTasks = tasksRes.rows.map((t) => formatTask(t));
            const completedTasks = formattedTasks.filter((t) => t.status === "Completed").length;
            const totalTasks = formattedTasks.length;

            const teams = projectsRes.rows.map((p) => {
                const totalT = Number(p.total_tasks || 0);
                const compT = Number(p.completed_tasks || 0);
                const taskProgressRate = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                const status = String(p.status).toLowerCase() === "completed" && (totalT === 0 || compT < totalT)
                    ? (compT > 0 ? "In Progress" : "Planning")
                    : p.status;
                return {
                    id: p.id,
                    _id: p.id,
                    title: p.title,
                    name: p.title,
                    status,
                    priority: p.priority,
                    progress: taskProgressRate,
                    deadline: p.deadline,
                    isLeader: Number(p.owner_id) === studentId,
                    teamLeader: p.owner_id ? { id: p.owner_id, name: p.owner_name, email: p.owner_email } : null,
                    taskProgress: {
                        total: totalT,
                        completed: compT,
                        pending: totalT - compT,
                        completionRate: taskProgressRate,
                    },
                };
            });

            return {
                student: safeUser(student),
                team: teams[0] || null,
                project: teams[0] || null,
                teams,
                projects: teams,
                tasks: formattedTasks,
                taskProgress: {
                    total: totalTasks,
                    completed: completedTasks,
                    pending: totalTasks - completedTasks,
                    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
                },
                recentActivities: activitiesRes.rows.map(formatActivityRow),
            };
        });

        return res.status(200).json({
            success: true,
            ...detail,
            data: detail,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 4. GET /api/mentor/teams
// ==========================================
export const getMentorTeams = async (req, res, next) => {
    try {
        const mentorId = req.user.id;
        const cacheKey = `mentor:teams:u:${mentorId}`;

        const teams = await readCache.getOrSet(cacheKey, async () => {
            const { rows: projects } = await pool.query(
                `SELECT p.*, o.name AS owner_name, o.email AS owner_email, o.roll_no AS owner_roll_no,
                        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
                 FROM projects p
                 LEFT JOIN users o ON o.id = p.owner_id
                 WHERE p.mentor_id = $1
                 ORDER BY p.updated_at DESC, p.id DESC;`,
                [mentorId]
            );

            if (projects.length === 0) return [];
            const projectIds = projects.map((p) => p.id);

            const membersRes = await pool.query(
                `SELECT pm.project_id, pm.role, u.id, u.name, u.email, u.roll_no, u.phone
                 FROM project_members pm
                 JOIN users u ON u.id = pm.user_id
                 WHERE pm.project_id = ANY($1)
                 ORDER BY u.name ASC;`,
                [projectIds]
            );

            const membersByProject = new Map();
            for (const m of membersRes.rows) {
                if (!membersByProject.has(m.project_id)) membersByProject.set(m.project_id, []);
                membersByProject.get(m.project_id).push({
                    id: m.id,
                    _id: m.id,
                    name: m.name,
                    email: m.email,
                    roll_no: m.roll_no || "",
                    phone: m.phone || "",
                    role: m.role || "member",
                });
            }

            return projects.map((p) => {
                const members = (membersByProject.get(p.id) || []).filter((m) => String(m.id) !== String(p.owner_id));
                const teamLeader = p.owner_id
                    ? { id: p.owner_id, _id: p.owner_id, name: p.owner_name || "Lead", email: p.owner_email || "", roll_no: p.owner_roll_no || "", role: "lead" }
                    : null;
                const totalT = Number(p.total_tasks || 0);
                const compT = Number(p.completed_tasks || 0);
                const resources = {
                    githubUrl: p.github_url || "",
                    demoUrl: p.demo_url || "",
                    pptUrl: p.ppt_url || "",
                };
                const taskProgressRate = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                const status = String(p.status).toLowerCase() === "completed" && (totalT === 0 || compT < totalT)
                    ? (compT > 0 ? "In Progress" : "Planning")
                    : p.status;
                return {
                    id: p.id,
                    _id: p.id,
                    projectId: p.id,
                    title: p.title,
                    name: p.title,
                    description: p.description || "",
                    status,
                    priority: p.priority,
                    progress: taskProgressRate,
                    deadline: p.deadline,
                    teamLeader,
                    owner: teamLeader,
                    members,
                    memberCount: members.length + (teamLeader ? 1 : 0),
                    resources,
                    deliverables: resources,
                    taskProgress: {
                        total: totalT,
                        completed: compT,
                        pending: totalT - compT,
                        completionRate: taskProgressRate,
                    },
                    createdAt: p.created_at,
                    updatedAt: p.updated_at,
                };
            });
        });

        return res.status(200).json({
            success: true,
            count: teams.length,
            teams,
            data: teams,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 5. GET /api/mentor/teams/:projectId
// ==========================================
export const getMentorTeamById = async (req, res, next) => {
    try {
        const mentorId = req.user.id;
        const projectId = parsePositiveInt(req.params.projectId);
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Valid project ID is required" });
        }

        const projCheck = await pool.query(
            `SELECT p.*, o.name AS owner_name, o.email AS owner_email, o.roll_no AS owner_roll_no
             FROM projects p
             LEFT JOIN users o ON o.id = p.owner_id
             WHERE p.id = $1;`,
            [projectId]
        );
        if (projCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Team/Project not found" });
        }

        const project = projCheck.rows[0];
        if (Number(project.mentor_id) !== Number(mentorId)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden. You are not the assigned mentor for this team.",
            });
        }

        const cacheKey = `mentor:team:u:${mentorId}:pid:${projectId}`;
        const detail = await readCache.getOrSet(cacheKey, async () => {
            const [membersRes, tasksRes, activitiesRes] = await Promise.all([
                pool.query(
                    `SELECT pm.role, u.id, u.name, u.email, u.roll_no, u.phone, u.is_active
                     FROM project_members pm
                     JOIN users u ON u.id = pm.user_id
                     WHERE pm.project_id = $1
                     ORDER BY u.name ASC;`,
                    [projectId]
                ),
                pool.query(
                    `SELECT t.*, p.title AS project_title,
                            u_a.name AS assignee_name, u_a.email AS assignee_email,
                            u_c.name AS creator_name, u_c.email AS creator_email
                     FROM tasks t
                     LEFT JOIN projects p ON p.id = t.project_id
                     LEFT JOIN users u_a ON u_a.id = t.assigned_to
                     LEFT JOIN users u_c ON u_c.id = t.created_by
                     WHERE t.project_id = $1
                     ORDER BY t.created_at DESC
                     LIMIT 200;`,
                    [projectId]
                ),
                pool.query(
                    `SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                            p.title AS project_title
                     FROM activities a
                     LEFT JOIN users u ON u.id = a.user_id
                     LEFT JOIN projects p ON p.id = a.project_id
                     WHERE a.project_id = $1
                     ORDER BY a.created_at DESC
                     LIMIT 30;`,
                    [projectId]
                ),
            ]);

            const teamLeader = project.owner_id
                ? {
                      id: project.owner_id,
                      _id: project.owner_id,
                      name: project.owner_name || "Lead",
                      email: project.owner_email || "",
                      roll_no: project.owner_roll_no || "",
                      role: "lead",
                  }
                : null;

            const members = membersRes.rows
                .filter((m) => String(m.id) !== String(project.owner_id))
                .map((m) => ({
                    id: m.id,
                    _id: m.id,
                    name: m.name,
                    email: m.email,
                    roll_no: m.roll_no || "",
                    phone: m.phone || "",
                    is_active: Boolean(m.is_active),
                    role: m.role || "member",
                }));

            const formattedTasks = tasksRes.rows.map((t) => formatTask(t));
            const completedTasks = formattedTasks.filter((t) => t.status === "Completed").length;
            const totalTasks = formattedTasks.length;

            const resources = {
                githubUrl: project.github_url || "",
                demoUrl: project.demo_url || "",
                pptUrl: project.ppt_url || "",
            };

            const taskProgressRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            const status = String(project.status).toLowerCase() === "completed" && (totalTasks === 0 || completedTasks < totalTasks)
                ? (completedTasks > 0 ? "In Progress" : "Planning")
                : project.status;

            const team = {
                id: project.id,
                _id: project.id,
                projectId: project.id,
                title: project.title,
                name: project.title,
                description: project.description || "",
                status,
                priority: project.priority,
                progress: taskProgressRate,
                deadline: project.deadline,
                teamLeader,
                owner: teamLeader,
                members,
                memberCount: members.length + (teamLeader ? 1 : 0),
                resources,
                deliverables: resources,
                taskProgress: {
                    total: totalTasks,
                    completed: completedTasks,
                    pending: totalTasks - completedTasks,
                    completionRate: taskProgressRate,
                },
                mentorReview: project.mentor_review || null,
                reviewedAt: project.reviewed_at || null,
                createdAt: project.created_at,
                updatedAt: project.updated_at,
            };

            return {
                team,
                project: team,
                members,
                teamLeader,
                resources,
                tasks: formattedTasks,
                recentActivities: activitiesRes.rows.map(formatActivityRow),
                mentorReview: project.mentor_review || null,
                reviewedAt: project.reviewed_at || null,
            };
        });

        return res.status(200).json({
            success: true,
            ...detail,
            data: detail,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 6b. POST /api/mentor/teams/:projectId/review
// Project-Level Mentor Review (Strict Unlock Condition)
// ==========================================
export const submitMentorProjectReview = async (req, res, next) => {
    try {
        const mentorId = req.user.id;
        const projectId = parsePositiveInt(req.params.projectId);
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Valid project ID is required" });
        }

        const reviewText = String(req.body.review ?? req.body.mentorReview ?? req.body.feedback ?? "").trim();
        if (!reviewText || reviewText.length < 5) {
            return res.status(400).json({
                success: false,
                message: "Please provide a substantive review (minimum 5 characters).",
            });
        }
        if (reviewText.length > 5000) {
            return res.status(400).json({
                success: false,
                message: "Review text cannot exceed 5000 characters.",
            });
        }

        const projRes = await pool.query(
            `SELECT p.*, o.name AS owner_name, o.email AS owner_email
             FROM projects p
             LEFT JOIN users o ON o.id = p.owner_id
             WHERE p.id = $1;`,
            [projectId]
        );
        if (projRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Team/Project not found" });
        }

        const project = projRes.rows[0];
        if (Number(project.mentor_id) !== Number(mentorId)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden. You are not the assigned Faculty Mentor for this project.",
            });
        }

        // Strict Multi-Condition Unlock Validation:
        // 1. All tasks 100% completed (at least 1 task must exist)
        const taskStats = await pool.query(
            `SELECT COUNT(*)::int as total_tasks,
                    COUNT(CASE WHEN status = 'Completed' THEN 1 END)::int as completed_tasks
             FROM tasks WHERE project_id = $1;`,
            [projectId]
        );
        const { total_tasks, completed_tasks } = taskStats.rows[0];
        if (total_tasks === 0 || completed_tasks !== total_tasks) {
            return res.status(400).json({
                success: false,
                message: "Review locked: All project tasks must be 100% completed (at least 1 task required) before a mentor review can be submitted.",
            });
        }

        // 2. Project status must be explicitly 'Completed'
        if (String(project.status || "").trim().toLowerCase() !== "completed") {
            return res.status(400).json({
                success: false,
                message: "Review locked: The project status must be saved as 'Completed' before a mentor review can be submitted.",
            });
        }

        // 3. Fully uploaded: Both PPT and Live Demo links must be present and valid
        const hasPpt = isPresentHttpUrl(project.ppt_url);
        const hasDemo = isPresentHttpUrl(project.demo_url);
        if (!hasPpt || !hasDemo) {
            return res.status(400).json({
                success: false,
                message: "Review locked: Both Presentation Slides (PPT) and Live Demo links must be uploaded before a mentor review can be submitted.",
            });
        }

        // Persist mentor review and reviewed_at timestamp
        const { rows: updatedRows } = await pool.query(
            `UPDATE projects
             SET mentor_review = $1, reviewed_at = NOW(), updated_at = NOW()
             WHERE id = $2
             RETURNING id, title, status, mentor_review, reviewed_at, updated_at;`,
            [reviewText, projectId]
        );

        const updatedProject = updatedRows[0];
        invalidateAllCaches();

        // Audit log
        await logActivity({
            projectId,
            userId: mentorId,
            action: "MENTOR_PROJECT_REVIEWED",
            description: `Faculty Mentor ${req.user.name} reviewed and finalized project "${project.title}"`,
            entityType: "project",
            entityId: projectId,
        });

        // Notify Project Owner and Squad Members
        const membersRes = await pool.query(
            "SELECT user_id FROM project_members WHERE project_id = $1",
            [projectId]
        );
        const recipientIds = new Set();
        if (project.owner_id) recipientIds.add(project.owner_id);
        membersRes.rows.forEach((m) => recipientIds.add(m.user_id));
        recipientIds.delete(mentorId);

        const io = req.app?.get("io");
        for (const uid of recipientIds) {
            await createNotification({
                userId: uid,
                title: "Faculty Mentor Review Published",
                message: `Faculty Mentor ${req.user.name} has submitted the official project review for "${project.title}".`,
                type: "mentor_review",
                io,
            });
        }

        if (io) {
            io.to(`project:${projectId}`).emit("project:mentor_reviewed", {
                projectId,
                mentorReview: updatedProject.mentor_review,
                reviewedAt: updatedProject.reviewed_at,
                mentor: {
                    id: req.user.id,
                    name: req.user.name,
                    email: req.user.email,
                },
            });
        }

        return res.status(200).json({
            success: true,
            message: "Project review submitted successfully.",
            mentorReview: updatedProject.mentor_review,
            reviewedAt: updatedProject.reviewed_at,
            project: updatedProject,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 6. PATCH /api/mentor/teams/:projectId/leader
// Blocked: Only the current Team Leader or Admin can switch leadership
// ==========================================
export const switchTeamLeader = async (req, res, next) => {
    return res.status(403).json({
        success: false,
        message: "Forbidden. Mentors cannot switch or transfer team leadership. Only the current Team Leader or an Administrator can transfer leadership.",
    });
};

// ==========================================
// 7. POST /api/mentor/tasks
// ==========================================
export const createMentorTask = async (req, res, next) => {
    try {
        const mentorId = req.user.id;
        const {
            title,
            description,
            projectId,
            project_id,
            assignedTo,
            assigned_to,
            priority,
            dueDate,
            due_date,
        } = pickAllowedFields(req.body, [
            "title",
            "description",
            "projectId",
            "project_id",
            "assignedTo",
            "assigned_to",
            "priority",
            "dueDate",
            "due_date",
        ]);

        if (typeof title !== "string" || !title.trim() || title.trim().length > MAX_TITLE_LEN) {
            return res.status(400).json({
                success: false,
                message: `Task title is required and cannot exceed ${MAX_TITLE_LEN} characters`,
            });
        }

        const cleanDescription = description !== undefined && description !== null ? String(description).trim() : "";
        if (cleanDescription.length > MAX_DESC_LEN) {
            return res.status(400).json({
                success: false,
                message: `Task description cannot exceed ${MAX_DESC_LEN} characters`,
            });
        }

        const parsedProjectId = parsePositiveInt(projectId ?? project_id);
        if (!parsedProjectId) {
            return res.status(400).json({ success: false, message: "Valid projectId is required" });
        }

        const projRes = await pool.query(
            "SELECT id, title, owner_id, mentor_id FROM projects WHERE id = $1;",
            [parsedProjectId]
        );
        if (projRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Team/Project not found" });
        }

        const project = projRes.rows[0];
        if (Number(project.mentor_id) !== Number(mentorId)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden. You can only assign tasks to teams mentored by you.",
            });
        }

        let assigneeId = null;
        let assigneeObj = null;
        const rawAssignee = assignedTo ?? assigned_to;
        if (rawAssignee !== undefined && rawAssignee !== null && rawAssignee !== "") {
            assigneeId = parsePositiveInt(rawAssignee);
            if (!assigneeId) {
                return res.status(400).json({ success: false, message: "Valid assignedTo user ID is required" });
            }

            // Ensure assignee belongs to this authorized project (owner or member)
            const assigneeCheck = await pool.query(
                `SELECT u.id, u.name, u.email
                 FROM users u
                 WHERE u.id = $1 AND u.is_active = TRUE
                   AND (
                       $1 = $2
                       OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $3 AND pm.user_id = $1)
                   );`,
                [assigneeId, project.owner_id, parsedProjectId]
            );
            if (assigneeCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "Tasks can only be assigned to active student members of this team",
                });
            }
            assigneeObj = {
                id: assigneeCheck.rows[0].id,
                _id: assigneeCheck.rows[0].id,
                name: assigneeCheck.rows[0].name,
                email: assigneeCheck.rows[0].email,
            };
        }

        let parsedDueDate = null;
        const rawDueDate = dueDate ?? due_date;
        if (rawDueDate !== undefined && rawDueDate !== null && rawDueDate !== "") {
            const d = new Date(rawDueDate);
            if (Number.isNaN(d.getTime())) {
                return res.status(400).json({ success: false, message: "Invalid dueDate format" });
            }
            parsedDueDate = d;
        }

        const taskPriority = normalizePriority(priority);
        const { rows } = await pool.query(
            `INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, created_by, due_date, created_at, updated_at)
             VALUES ($1, $2, $3, 'Todo', $4, $5, $6, $7, NOW(), NOW())
             RETURNING *;`,
            [parsedProjectId, title.trim(), cleanDescription, taskPriority, assigneeId, mentorId, parsedDueDate]
        );

        const createdTask = rows[0];
        const io = req.app.get("io");

        await logActivity({
            projectId: parsedProjectId,
            userId: mentorId,
            action: "MENTOR_TASK_ASSIGNED",
            description: `Mentor ${req.user.name} assigned task "${createdTask.title}" in "${project.title}"`,
            entityType: "Task",
            entityId: createdTask.id,
            metadata: { assignedTo: assigneeId, priority: taskPriority },
        });

        if (assigneeId) {
            await createNotification({
                userId: assigneeId,
                title: "New Task Assigned by Mentor",
                message: `${req.user.name} assigned you "${createdTask.title}" in project "${project.title}".`,
                type: "task_assigned",
                io,
            });
        }

        invalidateAllCaches();

        const formatted = formatTask(
            createdTask,
            { id: project.id, _id: project.id, name: project.title, title: project.title },
            assigneeObj,
            { id: req.user.id, _id: req.user.id, name: req.user.name, email: req.user.email }
        );

        return res.status(201).json({
            success: true,
            message: "Task assigned successfully",
            task: formatted,
            data: formatted,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 8. PATCH /api/mentor/tasks/:id/review
// ==========================================
export const reviewMentorTask = async (req, res, next) => {
    try {
        const mentorId = req.user.id;
        const taskId = parsePositiveInt(req.params.id);
        if (!taskId) {
            return res.status(400).json({ success: false, message: "Valid task ID is required" });
        }

        const { status, decision, approved, feedback, comment, notes } = pickAllowedFields(req.body, [
            "status",
            "decision",
            "approved",
            "feedback",
            "comment",
            "notes",
        ]);

        const { rows: taskRows } = await pool.query(
            `SELECT t.*, p.title AS project_title, p.mentor_id AS project_mentor_id
             FROM tasks t
             JOIN projects p ON p.id = t.project_id
             WHERE t.id = $1;`,
            [taskId]
        );
        if (taskRows.length === 0) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        const existingTask = taskRows[0];
        if (Number(existingTask.project_mentor_id) !== Number(mentorId)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden. You can only review tasks belonging to your assigned teams.",
            });
        }

        let nextStatus = null;
        if (typeof approved === "boolean") {
            nextStatus = approved ? "Completed" : "In Progress";
        } else if (typeof decision === "string" && decision.trim()) {
            const d = decision.trim().toLowerCase();
            if (d === "approve" || d === "approved" || d === "complete" || d === "completed") {
                nextStatus = "Completed";
            } else if (d === "reject" || d === "rejected" || d === "request_changes" || d === "rework") {
                nextStatus = "In Progress";
            }
        } else if (status !== undefined) {
            nextStatus = normalizeStatus(status);
        }

        if (!nextStatus) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid review decision ('approve' | 'request_changes'), boolean approved, or valid status",
            });
        }

        const reviewFeedback = String(feedback ?? comment ?? notes ?? "").trim().slice(0, 1000);
        const completedAt = nextStatus === "Completed" ? new Date() : null;

        const { rows: updatedRows } = await pool.query(
            `UPDATE tasks
             SET status = $1,
                 completed_at = $2,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *;`,
            [nextStatus, completedAt, taskId]
        );

        const updatedTask = updatedRows[0];
        const io = req.app.get("io");

        await logActivity({
            projectId: existingTask.project_id,
            userId: mentorId,
            action: "MENTOR_TASK_REVIEWED",
            description: `Mentor ${req.user.name} reviewed task "${existingTask.title}" -> ${nextStatus}`,
            entityType: "Task",
            entityId: taskId,
            metadata: {
                previousStatus: existingTask.status,
                newStatus: nextStatus,
                feedback: reviewFeedback || null,
                reviewedAt: new Date().toISOString(),
            },
        });

        if (existingTask.assigned_to) {
            const suffix = reviewFeedback ? ` Feedback: ${reviewFeedback}` : "";
            await createNotification({
                userId: existingTask.assigned_to,
                title: "Task Reviewed by Mentor",
                message: `${req.user.name} marked "${existingTask.title}" as ${nextStatus}.${suffix}`,
                type: "task_review",
                io,
            });
        }

        invalidateAllCaches();

        const formatted = formatTask({
            ...updatedTask,
            project_title: existingTask.project_title,
        });

        return res.status(200).json({
            success: true,
            message: `Task reviewed and marked as ${nextStatus}`,
            task: formatted,
            review: {
                status: nextStatus,
                feedback: reviewFeedback || null,
                reviewedBy: req.user.id,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 9. GET /api/mentor/announcements & POST /api/mentor/announcements
// ==========================================
export const getMentorAnnouncements = async (req, res, next) => {
    try {
        const mentorId = req.user.id;
        const cacheKey = `mentor:announcements:u:${mentorId}`;

        const announcements = await readCache.getOrSet(cacheKey, async () => {
            const { rows } = await pool.query(
                `SELECT a.*, u.name AS creator_name, u.email AS creator_email, u.role AS creator_role,
                        p.title AS project_title
                 FROM announcements a
                 LEFT JOIN users u ON u.id = a.created_by
                 LEFT JOIN projects p ON p.id = a.project_id
                 WHERE (a.project_id IS NULL AND a.target_role IN ('all', 'mentor'))
                    OR a.project_id IN (SELECT id FROM projects WHERE mentor_id = $1)
                 ORDER BY a.created_at DESC
                 LIMIT 100;`,
                [mentorId]
            );
            return rows.map(formatAnnouncementRow);
        });

        return res.status(200).json({
            success: true,
            count: announcements.length,
            announcements,
            data: announcements,
        });
    } catch (error) {
        next(error);
    }
};

export const createMentorAnnouncement = async (req, res, next) => {
    try {
        const mentorId = req.user.id;
        const { title, content, projectId, project_id } = pickAllowedFields(req.body, [
            "title",
            "content",
            "projectId",
            "project_id",
        ]);

        if (typeof title !== "string" || title.trim().length < 2 || title.trim().length > 200) {
            return res.status(400).json({ success: false, message: "Announcement title must be 2 to 200 characters" });
        }

        if (typeof content !== "string" || content.trim().length < 2 || content.trim().length > 5000) {
            return res.status(400).json({ success: false, message: "Announcement content must be 2 to 5000 characters" });
        }

        const parsedProjectId = parsePositiveInt(projectId ?? project_id);
        if (!parsedProjectId) {
            return res.status(400).json({
                success: false,
                message: "Valid projectId is required for mentor team announcements",
            });
        }

        const projRes = await pool.query(
            "SELECT id, title, owner_id, mentor_id FROM projects WHERE id = $1;",
            [parsedProjectId]
        );
        if (projRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Team/Project not found" });
        }

        const project = projRes.rows[0];
        if (Number(project.mentor_id) !== Number(mentorId)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden. You can only post announcements to teams assigned to you.",
            });
        }

        const { rows } = await pool.query(
            `INSERT INTO announcements (title, content, target_role, project_id, created_by, created_at)
             VALUES ($1, $2, 'student', $3, $4, NOW())
             RETURNING *;`,
            [title.trim(), content.trim(), parsedProjectId, mentorId]
        );
        const created = rows[0];

        // Notify team members + owner
        const membersRes = await pool.query(
            `SELECT DISTINCT uid FROM (
                SELECT owner_id AS uid FROM projects WHERE id = $1 AND owner_id IS NOT NULL
                UNION
                SELECT user_id AS uid FROM project_members WHERE project_id = $1
            ) t;`,
            [parsedProjectId]
        );

        const io = req.app.get("io");
        await Promise.all([
            logActivity({
                projectId: parsedProjectId,
                userId: mentorId,
                action: "MENTOR_ANNOUNCEMENT_CREATED",
                description: `Mentor ${req.user.name} posted team announcement "${created.title}" to "${project.title}"`,
                entityType: "Announcement",
                entityId: created.id,
            }),
            ...membersRes.rows.map((r) =>
                createNotification({
                    userId: r.uid,
                    title: `Announcement: ${created.title}`,
                    message: `${req.user.name} (${project.title}): ${created.content.slice(0, 200)}`,
                    type: "announcement",
                    io,
                })
            ),
        ]);

        invalidateAllCaches();

        const formatted = formatAnnouncementRow({
            ...created,
            project_title: project.title,
            creator_name: req.user.name,
            creator_email: req.user.email,
            creator_role: req.user.role,
        });

        return res.status(201).json({
            success: true,
            message: "Team announcement posted successfully",
            announcement: formatted,
            data: formatted,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 10. MENTOR INVITATIONS (/api/mentor/invitations)
// ==========================================
export const getMentorInvitations = async (req, res, next) => {
    try {
        const mentorId = req.user.id;
        const mentorEmail = req.user.email;
        const cacheKey = `mentor:invitations:u:${mentorId}`;

        const invitations = await readCache.getOrSet(cacheKey, async () => {
            const { rows } = await pool.query(
                `SELECT i.id, i.project_id, i.role, i.status, i.created_at,
                        p.title AS project_title, p.description AS project_description, p.status AS project_status,
                        s.id AS sender_id, s.name AS sender_name, s.email AS sender_email,
                        (
                            SELECT COUNT(DISTINCT uid)::int FROM (
                                SELECT pm.user_id AS uid FROM project_members pm WHERE pm.project_id = p.id
                                UNION
                                SELECT p.owner_id AS uid WHERE p.owner_id IS NOT NULL
                            ) sub
                        ) AS member_count
                 FROM invitations i
                 JOIN projects p ON p.id = i.project_id
                 LEFT JOIN users s ON s.id = i.sender_id
                 WHERE i.role = 'mentor'
                   AND i.status = 'Pending'
                   AND (i.recipient_id = $1 OR LOWER(i.recipient_email) = LOWER($2))
                 ORDER BY i.created_at DESC
                 LIMIT 50;`,
                [mentorId, mentorEmail]
            );

            return rows.map((r) => ({
                id: r.id,
                _id: r.id,
                projectId: r.project_id,
                project: {
                    id: r.project_id,
                    title: r.project_title,
                    description: r.project_description || "",
                    status: r.project_status,
                    memberCount: Number(r.member_count || 0),
                },
                sender: r.sender_id
                    ? { id: r.sender_id, name: r.sender_name, email: r.sender_email }
                    : null,
                role: r.role,
                status: r.status,
                createdAt: r.created_at,
            }));
        });

        return res.status(200).json({
            success: true,
            count: invitations.length,
            invitations,
            data: invitations,
        });
    } catch (error) {
        next(error);
    }
};

export const acceptMentorInvitation = async (req, res, next) => {
    const client = await pool.connect();
    let inTransaction = false;
    try {
        const invitationId = parsePositiveInt(req.params.invitationId);
        const mentorId = req.user.id;
        const mentorEmail = req.user.email;

        if (!invitationId) {
            return res.status(400).json({ success: false, message: "Valid invitation ID is required" });
        }

        await client.query("BEGIN");
        inTransaction = true;

        const invRes = await client.query(
            `SELECT * FROM invitations
             WHERE id = $1
               AND role = 'mentor'
               AND (recipient_id = $2 OR LOWER(recipient_email) = LOWER($3))
             FOR UPDATE;`,
            [invitationId, mentorId, mentorEmail]
        );
        if (invRes.rows.length === 0) {
            await client.query("ROLLBACK");
            inTransaction = false;
            return res.status(404).json({ success: false, message: "Mentor invitation not found" });
        }

        const invitation = invRes.rows[0];
        if (invitation.status !== "Pending") {
            await client.query("ROLLBACK");
            inTransaction = false;
            return res.status(400).json({
                success: false,
                message: `Invitation has already been ${invitation.status.toLowerCase()}`,
            });
        }

        const projRes = await client.query(
            "SELECT id, title, owner_id FROM projects WHERE id = $1 FOR UPDATE;",
            [invitation.project_id]
        );
        if (projRes.rows.length === 0) {
            await client.query("ROLLBACK");
            inTransaction = false;
            return res.status(404).json({ success: false, message: "Project no longer exists" });
        }

        const project = projRes.rows[0];

        await client.query(
            "UPDATE projects SET mentor_id = $1, updated_at = NOW() WHERE id = $2;",
            [mentorId, project.id]
        );
        await client.query(
            "UPDATE invitations SET status = 'Accepted', recipient_id = $1 WHERE id = $2;",
            [mentorId, invitationId]
        );
        await client.query(
            "UPDATE invitations SET status = 'Rejected' WHERE project_id = $1 AND role = 'mentor' AND status = 'Pending' AND id != $2;",
            [project.id, invitationId]
        );

        await logActivity({
            projectId: project.id,
            userId: mentorId,
            action: "MENTOR_INVITATION_ACCEPTED",
            description: `Mentor ${req.user.name} accepted mentorship for "${project.title}"`,
            entityType: "Project",
            entityId: project.id,
            client,
        });

        const membersRes = await client.query(
            `SELECT DISTINCT uid FROM (
                SELECT owner_id AS uid FROM projects WHERE id = $1 AND owner_id IS NOT NULL
                UNION
                SELECT user_id AS uid FROM project_members WHERE project_id = $1
            ) t;`,
            [project.id]
        );

        const createdNotifs = [];
        for (const m of membersRes.rows) {
            const created = await createNotification({
                userId: m.uid,
                title: "Mentor Accepted Invitation",
                message: `${req.user.name} accepted your mentor invitation and is now officially assigned to "${project.title}".`,
                type: "mentor_assignment",
                client,
            });
            if (created) createdNotifs.push(created);
        }

        await client.query("COMMIT");
        inTransaction = false;

        const io = req.app.get("io");
        if (io) {
            for (const n of createdNotifs) {
                io.to(`user:${n.user_id}`).emit("notification:new", {
                    id: n.id,
                    _id: n.id,
                    title: n.title,
                    message: n.message,
                    type: n.type,
                    project: project.id,
                    isRead: false,
                    createdAt: n.created_at,
                });
            }
        }

        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: `You are now the assigned mentor for "${project.title}".`,
            projectId: project.id,
        });
    } catch (error) {
        if (inTransaction) {
            try {
                await client.query("ROLLBACK");
            } catch {
                // ignore
            }
        }
        next(error);
    } finally {
        client.release();
    }
};

export const rejectMentorInvitation = async (req, res, next) => {
    try {
        const invitationId = parsePositiveInt(req.params.invitationId);
        const mentorId = req.user.id;
        const mentorEmail = req.user.email;

        if (!invitationId) {
            return res.status(400).json({ success: false, message: "Valid invitation ID is required" });
        }

        const invRes = await pool.query(
            `SELECT i.*, p.title AS project_title
             FROM invitations i
             LEFT JOIN projects p ON p.id = i.project_id
             WHERE i.id = $1
               AND i.role = 'mentor'
               AND (i.recipient_id = $2 OR LOWER(i.recipient_email) = LOWER($3));`,
            [invitationId, mentorId, mentorEmail]
        );
        if (invRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Mentor invitation not found" });
        }

        const invitation = invRes.rows[0];
        if (invitation.status !== "Pending") {
            return res.status(400).json({
                success: false,
                message: `Invitation has already been ${invitation.status.toLowerCase()}`,
            });
        }

        await pool.query("UPDATE invitations SET status = 'Rejected' WHERE id = $1;", [invitationId]);

        if (invitation.sender_id) {
            const io = req.app.get("io");
            await createNotification({
                userId: invitation.sender_id,
                title: "Mentor Invitation Declined",
                message: `${req.user.name} declined the mentor invitation for "${invitation.project_title || "your project"}". You can invite another mentor from your Team page.`,
                type: "mentor_invitation",
                io,
            });
        }

        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: "Mentor invitation declined",
        });
    } catch (error) {
        next(error);
    }
};
