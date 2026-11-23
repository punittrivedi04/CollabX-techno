import crypto from "crypto";
import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import {
    safeUser,
    formatTask,
    parsePositiveInt,
    escapeLikePattern,
    pickAllowedFields,
} from "../utils/formatters.js";
import {
    readCache,
    aggregateCache,
    invalidateAllCaches,
    invalidateUserCache,
    revokeUserTokens,
} from "../utils/microCache.js";
import { isDirector } from "../middleware/directorGuard.js";
import logActivity from "../utils/activityLogger.js";
import { sendAccountApprovalEmail, sendAnnouncementEmail } from "../utils/sendEmail.js";
import { purgeProjectAndDependents } from "../utils/projectCleanup.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s()]{5,30}$/;
const ALLOWED_ANNOUNCEMENT_ROLES = new Set(["all", "student", "mentor"]);
const MENTOR_ROLE_LIST = ["mentor", "faculty"];
const PROTECTED_ROLES = new Set(["admin", "coordinator", "director"]);

const isProtectedAccount = (user) => {
    if (!user) return false;
    if (isDirector(user)) return true;
    return PROTECTED_ROLES.has(String(user.role || "").toLowerCase().trim());
};

const isMentorRole = (role) => MENTOR_ROLE_LIST.includes(String(role || "").toLowerCase().trim());

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
        console.error("[Admin Notification] Failed:", err.message);
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
              name: row.creator_name || "Admin",
              email: row.creator_email || "",
              role: row.creator_role || "admin",
          }
        : null,
    createdAt: row.created_at,
});

// ==========================================
// 1. GET /api/admin/overview
// ==========================================
export const getAdminOverview = async (req, res, next) => {
    try {
        const cacheKey = `admin:overview:u:${req.user.id}`;
        const overview = await aggregateCache.getOrSet(cacheKey, async () => {
            const [
                countsRes,
                recentStudentsRes,
                recentMentorsRes,
                recentTeamsRes,
                mentorWorkloadRes,
                nearingDeadlinesRes,
                overdueProjectsRes,
                recentActivitiesRes,
            ] = await Promise.all([
                pool.query(`
                    SELECT
                        (SELECT COUNT(*)::int FROM users WHERE LOWER(COALESCE(role, 'student')) = 'student') AS total_students,
                        (SELECT COUNT(*)::int FROM users WHERE LOWER(COALESCE(role, 'student')) = 'student' AND is_active = TRUE) AS active_students,
                        (SELECT COUNT(*)::int FROM users WHERE LOWER(role) IN ('mentor', 'faculty')) AS total_mentors,
                        (SELECT COUNT(*)::int FROM users WHERE LOWER(role) IN ('mentor', 'faculty') AND is_active = TRUE) AS active_mentors,
                        (SELECT COUNT(*)::int FROM projects) AS total_teams,
                        (
                            SELECT COUNT(*)::int FROM projects p
                            WHERE p.status != 'Archived'
                              AND NOT (
                                p.status = 'Completed'
                                AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                                AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                            )
                        ) AS active_projects,
                        (
                            SELECT COUNT(*)::int FROM projects p
                            WHERE p.status = 'Completed'
                              AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                              AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                        ) AS completed_projects,
                        (SELECT COUNT(*)::int FROM tasks WHERE status != 'Completed') AS pending_tasks,
                        (SELECT COUNT(*)::int FROM tasks WHERE status = 'Completed') AS completed_tasks,
                        (SELECT COUNT(*)::int FROM users WHERE COALESCE(role_classified, FALSE) = FALSE AND LOWER(COALESCE(role, 'student')) = 'student') AS unclassified_accounts
                `),
                pool.query(`
                    SELECT u.id, u.name, u.email, u.roll_no, u.role, u.phone, u.mentor_id, u.role_classified,
                           u.is_verified, u.is_active, u.created_at,
                           m.name AS mentor_name, m.email AS mentor_email
                    FROM users u
                    LEFT JOIN users m ON m.id = u.mentor_id
                    WHERE LOWER(COALESCE(u.role, 'student')) = 'student'
                    ORDER BY u.created_at DESC, u.id DESC
                    LIMIT 8;
                `),
                pool.query(`
                    SELECT m.id, m.name, m.email, m.roll_no, m.role, m.phone, m.mentor_id, m.role_classified,
                           m.is_verified, m.is_active, m.created_at,
                           (SELECT COUNT(*)::int FROM projects p WHERE p.mentor_id = m.id AND p.status != 'Archived') AS team_count,
                           (
                               SELECT COUNT(*)::int FROM projects p
                               WHERE p.mentor_id = m.id
                                 AND p.status != 'Archived'
                                 AND NOT (
                                     p.status = 'Completed'
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                                 )
                           ) AS active_project_count
                    FROM users m
                    WHERE LOWER(m.role) IN ('mentor', 'faculty')
                    ORDER BY m.created_at DESC, m.id DESC
                    LIMIT 8;
                `),
                pool.query(`
                    SELECT p.id, p.title, p.status, p.priority, p.progress, p.deadline, p.owner_id, p.mentor_id, p.created_at,
                           o.name AS owner_name, o.email AS owner_email,
                           m.name AS mentor_name, m.email AS mentor_email,
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
                    LEFT JOIN users m ON m.id = p.mentor_id
                    ORDER BY p.created_at DESC, p.id DESC
                    LIMIT 8;
                `),
                pool.query(`
                    SELECT m.id, m.name, m.email, m.is_active,
                           (
                               SELECT COUNT(DISTINCT sid)::int FROM (
                                   SELECT s.id AS sid FROM users s WHERE s.mentor_id = m.id AND LOWER(COALESCE(s.role, 'student')) = 'student'
                                   UNION
                                   SELECT p.owner_id AS sid FROM projects p JOIN users s ON s.id = p.owner_id WHERE p.mentor_id = m.id AND LOWER(COALESCE(s.role, 'student')) = 'student'
                                   UNION
                                   SELECT pm.user_id AS sid FROM project_members pm JOIN projects p ON p.id = pm.project_id JOIN users s ON s.id = pm.user_id WHERE p.mentor_id = m.id AND LOWER(COALESCE(s.role, 'student')) = 'student'
                               ) stu
                           ) AS student_count,
                           (SELECT COUNT(*)::int FROM users s WHERE s.mentor_id = m.id AND LOWER(COALESCE(s.role, 'student')) = 'student') AS direct_student_count,
                           (SELECT COUNT(*)::int FROM projects p WHERE p.mentor_id = m.id AND p.status != 'Archived') AS team_count,
                           (
                               SELECT COUNT(*)::int FROM projects p
                               WHERE p.mentor_id = m.id
                                 AND p.status != 'Archived'
                                 AND NOT (
                                     p.status = 'Completed'
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                                 )
                           ) AS active_project_count,
                           (
                               SELECT COUNT(*)::int FROM projects p
                               WHERE p.mentor_id = m.id
                                 AND p.status = 'Completed'
                                 AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                                 AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                           ) AS completed_project_count
                    FROM users m
                    WHERE LOWER(m.role) IN ('mentor', 'faculty')
                    ORDER BY team_count DESC, completed_project_count DESC, active_project_count DESC, student_count DESC, m.name ASC
                    LIMIT 100;
                `),
                pool.query(`
                    SELECT p.id, p.title, p.status, p.priority, p.progress, p.deadline,
                           m.id AS mentor_id, m.name AS mentor_name,
                           o.id AS owner_id, o.name AS owner_name,
                           (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                           (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
                    FROM projects p
                    LEFT JOIN users m ON m.id = p.mentor_id
                    LEFT JOIN users o ON o.id = p.owner_id
                    WHERE p.deadline IS NOT NULL
                      AND p.deadline >= NOW()
                      AND p.deadline <= NOW() + INTERVAL '14 days'
                      AND NOT (
                          p.status = 'Completed'
                          AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                          AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                      )
                    ORDER BY p.deadline ASC
                    LIMIT 15;
                `),
                pool.query(`
                    SELECT p.id, p.title, p.status, p.priority, p.progress, p.deadline,
                           m.id AS mentor_id, m.name AS mentor_name,
                           o.id AS owner_id, o.name AS owner_name,
                           (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                           (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
                    FROM projects p
                    LEFT JOIN users m ON m.id = p.mentor_id
                    LEFT JOIN users o ON o.id = p.owner_id
                    WHERE p.deadline IS NOT NULL
                      AND p.deadline < NOW()
                      AND NOT (
                          p.status = 'Completed'
                          AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                          AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                      )
                    ORDER BY p.deadline ASC
                    LIMIT 15;
                `),
                pool.query(`
                    SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                           p.title AS project_title
                    FROM activities a
                    LEFT JOIN users u ON u.id = a.user_id
                    LEFT JOIN projects p ON p.id = a.project_id
                    ORDER BY a.created_at DESC
                    LIMIT 20;
                `),
            ]);

            const c = countsRes.rows[0] || {};
            const stats = {
                totalStudents: Number(c.total_students || 0),
                activeStudents: Number(c.active_students || 0),
                totalMentors: Number(c.total_mentors || 0),
                activeMentors: Number(c.active_mentors || 0),
                totalTeams: Number(c.total_teams || 0),
                activeProjects: Number(c.active_projects || 0),
                completedProjects: Number(c.completed_projects || 0),
                pendingTasks: Number(c.pending_tasks || 0),
                completedTasks: Number(c.completed_tasks || 0),
                unclassifiedAccounts: Number(c.unclassified_accounts || 0),
            };

            return {
                ...stats,
                stats,
                recentStudents: recentStudentsRes.rows.map((u) => ({
                    ...safeUser(u),
                    mentor: u.mentor_id ? { id: u.mentor_id, name: u.mentor_name, email: u.mentor_email } : null,
                })),
                recentMentors: recentMentorsRes.rows.map((m) => ({
                    ...safeUser(m),
                    teamCount: Number(m.team_count || 0),
                    activeProjectCount: Number(m.active_project_count || 0),
                })),
                recentTeams: recentTeamsRes.rows.map((p) => {
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
                        teamLeader: p.owner_id ? { id: p.owner_id, name: p.owner_name, email: p.owner_email } : null,
                        mentor: p.mentor_id ? { id: p.mentor_id, name: p.mentor_name, email: p.mentor_email } : null,
                        memberCount: Number(p.member_count || 0),
                        taskProgress: {
                            total: totalT,
                            completed: compT,
                            pending: totalT - compT,
                            completionRate: taskProgressRate,
                        },
                        createdAt: p.created_at,
                    };
                }),
                mentorWorkload: mentorWorkloadRes.rows.map((mw) => ({
                    mentorId: mw.id,
                    id: mw.id,
                    name: mw.name,
                    email: mw.email,
                    isActive: Boolean(mw.is_active),
                    studentCount: Number(mw.student_count || 0),
                    directStudentCount: Number(mw.direct_student_count || 0),
                    teamCount: Number(mw.team_count || 0),
                    projectCount: Number(mw.team_count || 0),
                    totalProjects: Number(mw.team_count || 0),
                    activeProjectCount: Number(mw.active_project_count || 0),
                    activeProjects: Number(mw.active_project_count || 0),
                    completedProjectCount: Number(mw.completed_project_count || 0),
                    completedProjects: Number(mw.completed_project_count || 0),
                })),
                nearingDeadlines: nearingDeadlinesRes.rows.map((p) => {
                    const totalT = Number(p.total_tasks || 0);
                    const compT = Number(p.completed_tasks || 0);
                    const taskProgressRate = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                    return {
                        id: p.id,
                        projectId: p.id,
                        title: p.title,
                        status: p.status,
                        priority: p.priority,
                        progress: taskProgressRate,
                        deadline: p.deadline,
                        mentor: p.mentor_id ? { id: p.mentor_id, name: p.mentor_name } : null,
                        teamLeader: p.owner_id ? { id: p.owner_id, name: p.owner_name } : null,
                        taskProgress: {
                            total: totalT,
                            completed: compT,
                            pending: totalT - compT,
                            completionRate: taskProgressRate,
                        },
                    };
                }),
                overdueProjects: overdueProjectsRes.rows.map((p) => {
                    const totalT = Number(p.total_tasks || 0);
                    const compT = Number(p.completed_tasks || 0);
                    const taskProgressRate = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                    return {
                        id: p.id,
                        projectId: p.id,
                        title: p.title,
                        status: p.status,
                        priority: p.priority,
                        progress: taskProgressRate,
                        deadline: p.deadline,
                        mentor: p.mentor_id ? { id: p.mentor_id, name: p.mentor_name } : null,
                        teamLeader: p.owner_id ? { id: p.owner_id, name: p.owner_name } : null,
                        taskProgress: {
                            total: totalT,
                            completed: compT,
                            pending: totalT - compT,
                            completionRate: taskProgressRate,
                        },
                    };
                }),
                recentActivities: recentActivitiesRes.rows.map(formatActivityRow),
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
// 2. GET /api/admin/students
// ==========================================
export const getAdminStudents = async (req, res, next) => {
    try {
        const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
        const mentorId = req.query.mentorId ? parsePositiveInt(req.query.mentorId) : null;
        const teamId = req.query.teamId || req.query.projectId ? parsePositiveInt(req.query.teamId || req.query.projectId) : null;
        const statusFilter = String(req.query.status || "all").toLowerCase().trim();
        const page = Math.min(1000, Math.max(1, parseInt(req.query.page, 10) || 1));
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const offset = (page - 1) * limit;

        if (req.query.mentorId && !mentorId) {
            return res.status(400).json({ success: false, message: "Invalid mentorId filter" });
        }
        if ((req.query.teamId || req.query.projectId) && !teamId) {
            return res.status(400).json({ success: false, message: "Invalid teamId filter" });
        }

        const cacheKey = `admin:students:u:${req.user.id}:q:${search}:m:${mentorId || ""}:t:${teamId || ""}:s:${statusFilter}:p:${page}:l:${limit}`;
        const result = await readCache.getOrSet(cacheKey, async () => {
            const conditions = [
                "LOWER(COALESCE(u.role, 'student')) = 'student'",
            ];
            const params = [];

            if (search) {
                params.push(`%${escapeLikePattern(search)}%`);
                const idx = params.length;
                conditions.push(`(u.name ILIKE $${idx} ESCAPE '\\' OR u.email ILIKE $${idx} ESCAPE '\\' OR COALESCE(u.roll_no, '') ILIKE $${idx} ESCAPE '\\')`);
            }

            if (mentorId) {
                params.push(mentorId);
                const idx = params.length;
                conditions.push(`(
                    u.mentor_id = $${idx}
                    OR EXISTS (
                        SELECT 1 FROM projects p
                        LEFT JOIN project_members pm ON pm.project_id = p.id
                        WHERE p.mentor_id = $${idx} AND (p.owner_id = u.id OR pm.user_id = u.id)
                    )
                )`);
            }

            if (teamId) {
                params.push(teamId);
                const idx = params.length;
                conditions.push(`EXISTS (
                    SELECT 1 FROM projects p
                    LEFT JOIN project_members pm ON pm.project_id = p.id
                    WHERE p.id = $${idx} AND (p.owner_id = u.id OR pm.user_id = u.id)
                )`);
            }

            if (statusFilter === "active") {
                conditions.push("u.is_active = TRUE");
            } else if (statusFilter === "inactive") {
                conditions.push("u.is_active = FALSE");
            } else if (statusFilter === "unclassified") {
                conditions.push("COALESCE(u.role_classified, FALSE) = FALSE");
            }

            const whereClause = conditions.join(" AND ");

            const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM users u WHERE ${whereClause}`, params);
            const total = Number(countRes.rows[0]?.total || 0);

            const listParams = [...params, limit, offset];
            const { rows: students } = await pool.query(
                `SELECT u.id, u.name, u.email, u.roll_no, u.role, u.phone, u.mentor_id, u.role_classified,
                        u.is_verified, u.is_active, u.created_at,
                        m.name AS mentor_name, m.email AS mentor_email
                 FROM users u
                 LEFT JOIN users m ON m.id = u.mentor_id
                 WHERE ${whereClause}
                 ORDER BY u.created_at DESC, u.id DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2};`,
                listParams
            );

            if (students.length === 0) {
                return { students: [], total, page, limit };
            }

            // Deduplicate students strictly by user ID
            const uniqueStudents = [];
            const seenStudentIds = new Set();
            for (const s of students) {
                if (!seenStudentIds.has(s.id)) {
                    seenStudentIds.add(s.id);
                    uniqueStudents.push(s);
                }
            }

            const studentIds = uniqueStudents.map((s) => s.id);
            const [projectsRes, tasksRes] = await Promise.all([
                pool.query(
                    `SELECT DISTINCT p.id, p.title, p.status, p.progress, p.deadline, p.owner_id, p.mentor_id,
                            m.name AS mentor_name, m.email AS mentor_email,
                            (p.owner_id = s.sid OR EXISTS (
                                SELECT 1 FROM project_members pm_leader
                                WHERE pm_leader.project_id = p.id AND pm_leader.user_id = s.sid AND LOWER(TRIM(pm_leader.role)) = 'leader'
                            )) AS is_leader,
                            s.sid AS student_id,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND LOWER(TRIM(COALESCE(t.status, ''))) IN ('completed', 'done')) AS completed_tasks
                     FROM (
                         SELECT owner_id AS sid, id AS pid FROM projects
                         WHERE owner_id = ANY($1) AND (status IS NULL OR LOWER(TRIM(status)) != 'archived')
                         UNION
                         SELECT pm.user_id AS sid, pm.project_id AS pid FROM project_members pm
                         JOIN projects p2 ON p2.id = pm.project_id
                         WHERE pm.user_id = ANY($1) AND (p2.status IS NULL OR LOWER(TRIM(p2.status)) != 'archived')
                     ) s
                     JOIN projects p ON p.id = s.pid
                     LEFT JOIN users m ON m.id = p.mentor_id
                     WHERE (p.status IS NULL OR LOWER(TRIM(p.status)) != 'archived')
                     ORDER BY p.id ASC;`,
                    [studentIds]
                ),
                pool.query(
                    `SELECT t.assigned_to AS student_id,
                            COUNT(*)::int AS total_tasks,
                            COUNT(*) FILTER (WHERE LOWER(TRIM(t.status)) IN ('completed', 'done'))::int AS completed_tasks,
                            COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(t.status, ''))) NOT IN ('completed', 'done'))::int AS pending_tasks
                     FROM tasks t
                     LEFT JOIN projects p ON p.id = t.project_id
                     WHERE t.assigned_to = ANY($1) AND (p.status != 'Archived' OR p.status IS NULL)
                     GROUP BY t.assigned_to;`,
                    [studentIds]
                ),
            ]);

            const projectsByStudent = new Map();
            const seenStudentProjects = new Set();
            for (const row of projectsRes.rows) {
                const sId = Number(row.student_id);
                const pId = Number(row.id);
                const key = `${sId}:${pId}`;
                if (seenStudentProjects.has(key)) continue;
                seenStudentProjects.add(key);

                if (!projectsByStudent.has(sId)) projectsByStudent.set(sId, []);
                const totalT = Number(row.total_tasks || 0);
                const compT = Number(row.completed_tasks || 0);
                const taskProgressRate = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                const status = String(row.status).toLowerCase() === "completed" && (totalT === 0 || compT < totalT)
                    ? (compT > 0 ? "In Progress" : "Planning")
                    : row.status;
                projectsByStudent.get(sId).push({
                    id: pId,
                    _id: pId,
                    title: row.title,
                    name: row.title,
                    status,
                    progress: taskProgressRate,
                    deadline: row.deadline,
                    isLeader: Boolean(row.is_leader),
                    mentor: row.mentor_id ? { id: row.mentor_id, name: row.mentor_name, email: row.mentor_email } : null,
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
                    totalTasks: totalT,
                    completedTasks: compT,
                    pending: Number(row.pending_tasks || 0),
                    completionRate: totalT > 0 ? Math.round((compT / totalT) * 100) : 0,
                });
            }

            const formatted = uniqueStudents.map((u) => {
                const teams = projectsByStudent.get(u.id) || [];
                const primaryTeam = teams[0] || null;
                const assignedMentor = u.mentor_id
                    ? { id: u.mentor_id, name: u.mentor_name, email: u.mentor_email }
                    : primaryTeam?.mentor || null;

                const projectCount = teams.length;
                const leaderProjectsCount = teams.filter((t) => t.isLeader).length;
                const isLeaderAny = leaderProjectsCount > 0;

                return {
                    ...safeUser(u),
                    mentor: assignedMentor,
                    directMentor: u.mentor_id ? { id: u.mentor_id, name: u.mentor_name, email: u.mentor_email } : null,
                    team: primaryTeam,
                    project: primaryTeam,
                    teams,
                    projects: teams,
                    projectCount,
                    teamsCount: projectCount,
                    leaderProjectsCount,
                    isLeader: isLeaderAny,
                    taskProgress: tasksByStudent.get(u.id) || { total: 0, completed: 0, totalTasks: 0, completedTasks: 0, pending: 0, completionRate: 0 },
                };
            });

            return { students: formatted, total, page, limit };
        });

        return res.status(200).json({
            success: true,
            count: result.students.length,
            students: result.students,
            data: result.students,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: Math.ceil(result.total / result.limit),
            },
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 3. GET /api/admin/students/:id
// ==========================================
export const getAdminStudentById = async (req, res, next) => {
    try {
        const studentId = parsePositiveInt(req.params.id);
        if (!studentId) {
            return res.status(400).json({ success: false, message: "Valid student ID is required" });
        }

        const cacheKey = `admin:student:u:${req.user.id}:sid:${studentId}`;
        const detail = await readCache.getOrSet(cacheKey, async () => {
            const { rows } = await pool.query(
                `SELECT u.id, u.name, u.email, u.roll_no, u.role, u.phone, u.mentor_id, u.role_classified,
                        u.is_verified, u.is_active, u.created_at,
                        m.name AS mentor_name, m.email AS mentor_email, m.phone AS mentor_phone
                 FROM users u
                 LEFT JOIN users m ON m.id = u.mentor_id
                 WHERE u.id = $1 AND LOWER(COALESCE(u.role, 'student')) = 'student';`,
                [studentId]
            );
            if (rows.length === 0) return null;
            const student = rows[0];

            const [projectsRes, tasksRes] = await Promise.all([
                pool.query(
                    `SELECT DISTINCT p.*,
                            o.name AS owner_name, o.email AS owner_email,
                            m.name AS mentor_name, m.email AS mentor_email,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND LOWER(TRIM(t.status)) IN ('completed', 'done')) AS completed_tasks
                     FROM projects p
                     LEFT JOIN project_members pm ON pm.project_id = p.id
                     LEFT JOIN users o ON o.id = p.owner_id
                     LEFT JOIN users m ON m.id = p.mentor_id
                     WHERE p.owner_id = $1 OR pm.user_id = $1
                     ORDER BY p.created_at DESC;`,
                    [studentId]
                ),
                pool.query(
                    `SELECT t.*, p.title AS project_title,
                            u_a.name AS assignee_name, u_a.email AS assignee_email,
                            u_c.name AS creator_name, u_c.email AS creator_email
                     FROM tasks t
                     LEFT JOIN projects p ON p.id = t.project_id
                     LEFT JOIN users u_a ON u_a.id = t.assigned_to
                     LEFT JOIN users u_c ON u_c.id = t.created_by
                     WHERE t.assigned_to = $1 AND (p.status != 'Archived' OR p.status IS NULL)
                     ORDER BY t.created_at DESC
                     LIMIT 100;`,
                    [studentId]
                ),
            ]);

            const projectIds = projectsRes.rows.map((p) => p.id);
            const activitiesRes = await pool.query(
                `SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                        p.title AS project_title
                 FROM activities a
                 LEFT JOIN users u ON u.id = a.user_id
                 LEFT JOIN projects p ON p.id = a.project_id
                 WHERE a.user_id = $1
                    OR (a.entity_type = 'User' AND a.entity_id = $1)
                    OR ($2::int[] IS NOT NULL AND a.project_id = ANY($2))
                 ORDER BY a.created_at DESC
                 LIMIT 30;`,
                [studentId, projectIds.length > 0 ? projectIds : null]
            );

            const tasks = tasksRes.rows.map((t) => formatTask(t));
            const completedTasks = tasks.filter((t) => ["completed", "done"].includes(String(t.status || "").trim().toLowerCase())).length;
            const totalTasks = tasks.length;

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
                    mentor: p.mentor_id ? { id: p.mentor_id, name: p.mentor_name, email: p.mentor_email } : null,
                    taskProgress: {
                        total: totalT,
                        completed: compT,
                        pending: totalT - compT,
                        completionRate: taskProgressRate,
                    },
                    githubUrl: p.github_url || "",
                    demoUrl: p.demo_url || "",
                    pptUrl: p.ppt_url || "",
                };
            });

            const assignedMentor = student.mentor_id
                ? { id: student.mentor_id, name: student.mentor_name, email: student.mentor_email, phone: student.mentor_phone || "" }
                : teams[0]?.mentor || null;

            return {
                student: {
                    ...safeUser(student),
                    mentor: assignedMentor,
                },
                mentor: assignedMentor,
                team: teams[0] || null,
                project: teams[0] || null,
                teams,
                projects: teams,
                tasks,
                taskProgress: {
                    total: totalTasks,
                    completed: completedTasks,
                    totalTasks,
                    completedTasks,
                    pending: Math.max(0, totalTasks - completedTasks),
                    todo: tasks.filter((t) => String(t.status || "").trim().toLowerCase() === "todo").length,
                    inProgress: tasks.filter((t) => String(t.status || "").trim().toLowerCase() === "in progress").length,
                    inReview: tasks.filter((t) => String(t.status || "").trim().toLowerCase() === "in review").length,
                    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
                },
                activityHistory: activitiesRes.rows.map(formatActivityRow),
                recentActivities: activitiesRes.rows.map(formatActivityRow),
            };
        });

        if (!detail) {
            return res.status(404).json({ success: false, message: "Student not found" });
        }

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
// 4. POST /api/admin/students
// ==========================================
export const createAdminStudent = async (req, res, next) => {
    try {
        const { name, email, roll_no, phone, mentor_id, password } = pickAllowedFields(req.body, [
            "name",
            "email",
            "roll_no",
            "phone",
            "mentor_id",
            "password",
        ]);

        if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
            return res.status(400).json({ success: false, message: "Name must contain 2 to 100 characters" });
        }

        if (typeof email !== "string" || email.trim().length > 254 || !EMAIL_PATTERN.test(email.trim().toLowerCase())) {
            return res.status(400).json({ success: false, message: "Please provide a valid email address" });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

        let cleanRollNo = null;
        if (roll_no !== undefined && roll_no !== null && String(roll_no).trim() !== "") {
            const r = String(roll_no).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
            if (r) {
                if (!/^[A-Z0-9]+$/.test(r)) {
                    return res.status(400).json({ success: false, message: "Roll number must be alphanumeric (uppercase letters and numbers only)" });
                }
                if (r.length > 50) {
                    return res.status(400).json({ success: false, message: "Roll number cannot exceed 50 characters" });
                }
                cleanRollNo = r;
            }
        }

        let cleanPhone = null;
        if (phone !== undefined && phone !== null && String(phone).trim() !== "") {
            const p = String(phone).trim();
            if (!PHONE_PATTERN.test(p)) {
                return res.status(400).json({ success: false, message: "Invalid phone number format" });
            }
            cleanPhone = p;
        }

        let assignedMentorId = null;
        if (mentor_id !== undefined && mentor_id !== null && mentor_id !== "") {
            assignedMentorId = parsePositiveInt(mentor_id);
            if (!assignedMentorId) {
                return res.status(400).json({ success: false, message: "Valid mentor_id is required" });
            }
            const mentorCheck = await pool.query(
                "SELECT id, role, is_active FROM users WHERE id = $1",
                [assignedMentorId]
            );
            if (
                mentorCheck.rows.length === 0 ||
                !mentorCheck.rows[0].is_active ||
                !isMentorRole(mentorCheck.rows[0].role)
            ) {
                return res.status(400).json({ success: false, message: "Assigned mentor must be an active mentor account" });
            }
        }

        const existsCheck = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [cleanEmail]);
        if (existsCheck.rows.length > 0) {
            return res.status(409).json({ success: false, message: "A user with this email already exists" });
        }

        let rawPassword;
        if (password !== undefined && password !== null && password !== "") {
            if (typeof password !== "string" || password.length < 6 || password.length > 128) {
                return res.status(400).json({ success: false, message: "Password must be between 6 and 128 characters" });
            }
            rawPassword = password;
        } else {
            rawPassword = crypto.randomBytes(18).toString("base64url");
        }

        const passwordHash = await bcrypt.hash(rawPassword, 12);

        const { rows } = await pool.query(
            `INSERT INTO users (name, email, password_hash, roll_no, phone, mentor_id, role, role_classified, is_verified, is_active, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'student', TRUE, TRUE, TRUE, NOW())
             RETURNING id, name, email, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at;`,
            [cleanName, cleanEmail, passwordHash, cleanRollNo, cleanPhone, assignedMentorId]
        );

        const created = rows[0];
        await logActivity({
            userId: req.user.id,
            action: "ADMIN_STUDENT_CREATED",
            description: `Admin ${req.user.name} created student account ${created.name} (${created.email})`,
            entityType: "User",
            entityId: created.id,
            metadata: { adminId: req.user.id, studentId: created.id, mentorId: assignedMentorId },
        });

        invalidateUserCache();

        return res.status(201).json({
            success: true,
            message: "Student created successfully",
            student: safeUser(created),
            data: safeUser(created),
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 5. PUT /api/admin/students/:id
// ==========================================
export const updateAdminStudent = async (req, res, next) => {
    try {
        const studentId = parsePositiveInt(req.params.id);
        if (!studentId) {
            return res.status(400).json({ success: false, message: "Valid student ID is required" });
        }

        const { name, email, roll_no, phone, mentor_id } = pickAllowedFields(req.body, [
            "name",
            "email",
            "roll_no",
            "phone",
            "mentor_id",
        ]);

        const { rows: existingRows } = await pool.query(
            "SELECT id, name, email, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at FROM users WHERE id = $1",
            [studentId]
        );
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: "Student not found" });
        }

        const existing = existingRows[0];
        if (isProtectedAccount(existing)) {
            return res.status(403).json({ success: false, message: "Cannot edit admin or director accounts via student endpoint" });
        }
        if (String(existing.role || "student").toLowerCase() !== "student") {
            return res.status(400).json({ success: false, message: "Target user is not a student account" });
        }

        let newName = existing.name;
        if (name !== undefined) {
            if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
                return res.status(400).json({ success: false, message: "Name must contain 2 to 100 characters" });
            }
            newName = name.trim();
        }

        let newEmail = existing.email;
        if (email !== undefined) {
            if (typeof email !== "string" || email.trim().length > 254 || !EMAIL_PATTERN.test(email.trim().toLowerCase())) {
                return res.status(400).json({ success: false, message: "Please provide a valid email address" });
            }
            const cleanEmail = email.trim().toLowerCase();
            if (cleanEmail !== String(existing.email).toLowerCase()) {
                const dupCheck = await pool.query(
                    "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2",
                    [cleanEmail, studentId]
                );
                if (dupCheck.rows.length > 0) {
                    return res.status(409).json({ success: false, message: "Email is already in use by another account" });
                }
            }
            newEmail = cleanEmail;
        }

        let newRollNo = existing.roll_no;
        if (roll_no !== undefined) {
            if (roll_no === null || String(roll_no).trim() === "") {
                newRollNo = null;
            } else {
                const r = String(roll_no).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
                if (r) {
                    if (!/^[A-Z0-9]+$/.test(r)) {
                        return res.status(400).json({ success: false, message: "Roll number must be alphanumeric (uppercase letters and numbers only)" });
                    }
                    if (r.length > 50) {
                        return res.status(400).json({ success: false, message: "Roll number cannot exceed 50 characters" });
                    }
                    newRollNo = r;
                } else {
                    newRollNo = null;
                }
            }
        }

        let newPhone = existing.phone;
        if (phone !== undefined) {
            if (phone === null || String(phone).trim() === "") {
                newPhone = null;
            } else {
                const p = String(phone).trim();
                if (!PHONE_PATTERN.test(p)) {
                    return res.status(400).json({ success: false, message: "Invalid phone number format" });
                }
                newPhone = p;
            }
        }

        let newMentorId = existing.mentor_id;
        if (mentor_id !== undefined) {
            if (mentor_id === null || mentor_id === "") {
                newMentorId = null;
            } else {
                const parsedMentorId = parsePositiveInt(mentor_id);
                if (!parsedMentorId) {
                    return res.status(400).json({ success: false, message: "Valid mentor_id is required" });
                }
                const mentorCheck = await pool.query(
                    "SELECT id, role, is_active FROM users WHERE id = $1",
                    [parsedMentorId]
                );
                if (
                    mentorCheck.rows.length === 0 ||
                    !mentorCheck.rows[0].is_active ||
                    !isMentorRole(mentorCheck.rows[0].role)
                ) {
                    return res.status(400).json({ success: false, message: "Assigned mentor must be an active mentor account" });
                }
                newMentorId = parsedMentorId;
            }
        }

        const { rows } = await pool.query(
            `UPDATE users
             SET name = $1, email = $2, roll_no = $3, phone = $4, mentor_id = $5
             WHERE id = $6
             RETURNING id, name, email, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at;`,
            [newName, newEmail, newRollNo, newPhone, newMentorId, studentId]
        );

        const updated = rows[0];
        await logActivity({
            userId: req.user.id,
            action: "ADMIN_STUDENT_UPDATED",
            description: `Admin ${req.user.name} updated student ${updated.name}`,
            entityType: "User",
            entityId: studentId,
            metadata: { adminId: req.user.id, studentId, previousMentorId: existing.mentor_id, newMentorId },
        });

        invalidateUserCache();

        return res.status(200).json({
            success: true,
            message: "Student updated successfully",
            student: safeUser(updated),
            data: safeUser(updated),
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 6. PATCH /api/admin/students/:id/status
// ==========================================
export const updateStudentStatus = async (req, res, next) => {
    try {
        const studentId = parsePositiveInt(req.params.id);
        if (!studentId) {
            return res.status(400).json({ success: false, message: "Valid student ID is required" });
        }

        const { is_active, isActive, status } = pickAllowedFields(req.body, [
            "is_active",
            "isActive",
            "status",
        ]);

        let nextActive;
        if (typeof is_active === "boolean") {
            nextActive = is_active;
        } else if (typeof isActive === "boolean") {
            nextActive = isActive;
        } else if (typeof status === "string") {
            const s = status.trim().toLowerCase();
            if (s === "active") nextActive = true;
            else if (s === "inactive" || s === "deactivated" || s === "disabled") nextActive = false;
        }

        if (typeof nextActive !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "Provide boolean is_active/isActive or status ('active' | 'inactive')",
            });
        }

        const { rows: existingRows } = await pool.query(
            "SELECT id, name, email, role, is_active FROM users WHERE id = $1",
            [studentId]
        );
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: "Student not found" });
        }

        const existing = existingRows[0];
        if (isProtectedAccount(existing)) {
            return res.status(403).json({ success: false, message: "Cannot change status of admin or director accounts" });
        }

        const { rows } = await pool.query(
            `UPDATE users
             SET is_active = $1,
                 refresh_token_hash = CASE WHEN $1 = FALSE THEN NULL ELSE refresh_token_hash END
             WHERE id = $2
             RETURNING id, name, email, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at;`,
            [nextActive, studentId]
        );

        const updated = rows[0];
        const io = req.app.get("io");

        if (!nextActive) {
            revokeUserTokens(studentId);
            if (io) {
                io.in(`user:${studentId}`).disconnectSockets(true);
            }
        }

        await logActivity({
            userId: req.user.id,
            action: nextActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
            description: `Admin ${req.user.name} ${nextActive ? "activated" : "deactivated"} account ${updated.name}`,
            entityType: "User",
            entityId: studentId,
            metadata: { adminId: req.user.id, targetUserId: studentId, isActive: nextActive, timestamp: new Date().toISOString() },
        });

        invalidateUserCache();

        return res.status(200).json({
            success: true,
            message: nextActive ? "Student account activated" : "Student account deactivated and sessions revoked",
            student: safeUser(updated),
            data: safeUser(updated),
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 7. PATCH /api/admin/students/:id/assign-mentor
// ==========================================
export const assignStudentMentor = async (req, res, next) => {
    try {
        const studentId = parsePositiveInt(req.params.id);
        if (!studentId) {
            return res.status(400).json({ success: false, message: "Valid student ID is required" });
        }

        const { mentor_id, mentorId } = pickAllowedFields(req.body, ["mentor_id", "mentorId"]);
        const rawMentor = mentor_id !== undefined ? mentor_id : mentorId;

        if (rawMentor === undefined) {
            return res.status(400).json({ success: false, message: "mentor_id is required (integer ID or null)" });
        }

        const { rows: studentRows } = await pool.query(
            "SELECT id, name, email, role, mentor_id FROM users WHERE id = $1",
            [studentId]
        );
        if (studentRows.length === 0) {
            return res.status(404).json({ success: false, message: "Student not found" });
        }

        const student = studentRows[0];
        if (isProtectedAccount(student) || String(student.role || "student").toLowerCase() !== "student") {
            return res.status(400).json({ success: false, message: "Mentors can only be assigned to student accounts" });
        }

        let targetMentor = null;
        let nextMentorId = null;
        if (rawMentor !== null && rawMentor !== "") {
            nextMentorId = parsePositiveInt(rawMentor);
            if (!nextMentorId) {
                return res.status(400).json({ success: false, message: "Valid mentor_id is required" });
            }
            const mentorRes = await pool.query(
                "SELECT id, name, email, role, is_active FROM users WHERE id = $1",
                [nextMentorId]
            );
            if (
                mentorRes.rows.length === 0 ||
                !mentorRes.rows[0].is_active ||
                !isMentorRole(mentorRes.rows[0].role) ||
                isProtectedAccount(mentorRes.rows[0])
            ) {
                return res.status(400).json({ success: false, message: "Target mentor must be an active mentor account" });
            }
            targetMentor = mentorRes.rows[0];
        }

        const previousMentorId = student.mentor_id;

        // Preserve all projects, tasks, and chat history untouched — update only users.mentor_id
        const { rows: updatedRows } = await pool.query(
            `UPDATE users
             SET mentor_id = $1
             WHERE id = $2
             RETURNING id, name, email, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at;`,
            [nextMentorId, studentId]
        );

        const updatedStudent = updatedRows[0];
        const io = req.app.get("io");
        const timestamp = new Date().toISOString();

        await logActivity({
            userId: req.user.id,
            action: "STUDENT_MENTOR_ASSIGNED",
            description: targetMentor
                ? `Admin ${req.user.name} assigned mentor ${targetMentor.name} to student ${student.name}`
                : `Admin ${req.user.name} unassigned mentor from student ${student.name}`,
            entityType: "User",
            entityId: studentId,
            metadata: {
                adminId: req.user.id,
                studentId,
                previousMentorId,
                newMentorId: nextMentorId,
                timestamp,
            },
        });

        // Notify affected users
        const notifPromises = [];
        notifPromises.push(
            createNotification({
                userId: studentId,
                title: "Mentor Assignment Updated",
                message: targetMentor
                    ? `${targetMentor.name} has been assigned as your mentor. All your projects, tasks, and chats remain preserved.`
                    : "Your mentor assignment has been updated by an administrator.",
                type: "mentor_assignment",
                io,
            })
        );

        if (targetMentor && Number(targetMentor.id) !== Number(previousMentorId)) {
            notifPromises.push(
                createNotification({
                    userId: targetMentor.id,
                    title: "New Student Assigned",
                    message: `Student ${student.name} (${student.email}) has been assigned to you.`,
                    type: "mentor_assignment",
                    io,
                })
            );
        }

        if (previousMentorId && Number(previousMentorId) !== Number(nextMentorId)) {
            notifPromises.push(
                createNotification({
                    userId: previousMentorId,
                    title: "Student Transferred",
                    message: `Student ${student.name} has been reassigned by an administrator.`,
                    type: "mentor_assignment",
                    io,
                })
            );
        }

        await Promise.all(notifPromises);
        invalidateUserCache();

        return res.status(200).json({
            success: true,
            message: targetMentor ? "Mentor assigned to student successfully" : "Mentor unassigned from student",
            student: {
                ...safeUser(updatedStudent),
                mentor: targetMentor ? { id: targetMentor.id, name: targetMentor.name, email: targetMentor.email } : null,
            },
            previousMentorId,
            newMentorId: nextMentorId,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 8. GET /api/admin/mentors
// ==========================================
export const getAdminMentors = async (req, res, next) => {
    try {
        const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
        const statusFilter = String(req.query.status || "all").toLowerCase().trim();
        const cacheKey = `admin:mentors:u:${req.user.id}:q:${search}:s:${statusFilter}`;

        const mentors = await readCache.getOrSet(cacheKey, async () => {
            const conditions = [
                "LOWER(m.role) IN ('mentor', 'faculty')",
            ];
            const params = [];

            if (search) {
                params.push(`%${escapeLikePattern(search)}%`);
                const idx = params.length;
                conditions.push(`(m.name ILIKE $${idx} ESCAPE '\\' OR m.email ILIKE $${idx} ESCAPE '\\' OR COALESCE(m.roll_no, '') ILIKE $${idx} ESCAPE '\\')`);
            }

            if (statusFilter === "active") {
                conditions.push("m.is_active = TRUE");
            } else if (statusFilter === "inactive") {
                conditions.push("m.is_active = FALSE");
            }

            const { rows } = await pool.query(
                `SELECT m.id, m.name, m.email, m.roll_no, m.role, m.phone, m.mentor_id, m.role_classified,
                        m.is_verified, m.is_active, m.created_at,
                        (
                            SELECT COUNT(DISTINCT sid)::int FROM (
                                SELECT s.id AS sid FROM users s WHERE s.mentor_id = m.id AND LOWER(COALESCE(s.role, 'student')) = 'student'
                                UNION
                                SELECT p.owner_id AS sid FROM projects p JOIN users s ON s.id = p.owner_id WHERE p.mentor_id = m.id AND LOWER(COALESCE(s.role, 'student')) = 'student'
                                UNION
                                SELECT pm.user_id AS sid FROM project_members pm JOIN projects p ON p.id = pm.project_id JOIN users s ON s.id = pm.user_id WHERE p.mentor_id = m.id AND LOWER(COALESCE(s.role, 'student')) = 'student'
                            ) stu
                        ) AS assigned_student_count,
                        (SELECT COUNT(*)::int FROM users s WHERE s.mentor_id = m.id AND LOWER(COALESCE(s.role, 'student')) = 'student') AS direct_student_count,
                        (SELECT COUNT(*)::int FROM projects p WHERE p.mentor_id = m.id) AS team_count,
                        (SELECT COUNT(*)::int FROM projects p WHERE p.mentor_id = m.id AND p.status != 'Completed') AS active_project_count,
                        (SELECT COUNT(*)::int FROM projects p WHERE p.mentor_id = m.id AND p.status = 'Completed') AS completed_project_count
                 FROM users m
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY team_count DESC, completed_project_count DESC, active_project_count DESC, m.name ASC
                 LIMIT 200;`,
                params
            );

            return rows.map((m) => ({
                ...safeUser(m),
                status: m.is_active ? "active" : "inactive",
                assignedStudentCount: Number(m.assigned_student_count || 0),
                directStudentCount: Number(m.direct_student_count || 0),
                teamCount: Number(m.team_count || 0),
                activeProjectCount: Number(m.active_project_count || 0),
                completedProjectCount: Number(m.completed_project_count || 0),
            }));
        });

        return res.status(200).json({
            success: true,
            count: mentors.length,
            mentors,
            data: mentors,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 9. GET /api/admin/mentors/:id
// ==========================================
export const getAdminMentorById = async (req, res, next) => {
    try {
        const mentorId = parsePositiveInt(req.params.id);
        if (!mentorId) {
            return res.status(400).json({ success: false, message: "Valid mentor ID is required" });
        }

        const cacheKey = `admin:mentor:u:${req.user.id}:mid:${mentorId}`;
        const detail = await readCache.getOrSet(cacheKey, async () => {
            const { rows } = await pool.query(
                `SELECT id, name, email, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at
                 FROM users
                 WHERE id = $1 AND LOWER(role) IN ('mentor', 'faculty');`,
                [mentorId]
            );
            if (rows.length === 0) return null;
            const mentor = rows[0];

            const [projectsRes, studentsRes] = await Promise.all([
                pool.query(
                    `SELECT p.*, o.name AS owner_name, o.email AS owner_email, o.roll_no AS owner_roll_no,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
                     FROM projects p
                     LEFT JOIN users o ON o.id = p.owner_id
                     WHERE p.mentor_id = $1
                     ORDER BY p.created_at DESC;`,
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
                     ORDER BY u.name ASC;`,
                    [mentorId]
                ),
            ]);

            const projectIds = projectsRes.rows.map((p) => p.id);
            const [membersRes, activitiesRes] = await Promise.all([
                projectIds.length > 0
                    ? pool.query(
                          `SELECT pm.project_id, pm.role, u.id, u.name, u.email, u.roll_no
                           FROM project_members pm
                           JOIN users u ON u.id = pm.user_id
                           WHERE pm.project_id = ANY($1);`,
                          [projectIds]
                      )
                    : Promise.resolve({ rows: [] }),
                pool.query(
                    `SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                            p.title AS project_title
                     FROM activities a
                     LEFT JOIN users u ON u.id = a.user_id
                     LEFT JOIN projects p ON p.id = a.project_id
                     WHERE a.user_id = $1
                        OR (a.entity_type = 'User' AND a.entity_id = $1)
                        OR ($2::int[] IS NOT NULL AND a.project_id = ANY($2))
                     ORDER BY a.created_at DESC
                     LIMIT 30;`,
                    [mentorId, projectIds.length > 0 ? projectIds : null]
                ),
            ]);

            const membersByProject = new Map();
            for (const m of membersRes.rows) {
                if (!membersByProject.has(m.project_id)) membersByProject.set(m.project_id, []);
                membersByProject.get(m.project_id).push({
                    id: m.id,
                    _id: m.id,
                    name: m.name,
                    email: m.email,
                    roll_no: m.roll_no || "",
                    role: m.role || "member",
                });
            }

            const teams = projectsRes.rows.map((p) => {
                const members = (membersByProject.get(p.id) || []).filter((m) => String(m.id) !== String(p.owner_id));
                const teamLeader = p.owner_id
                    ? { id: p.owner_id, _id: p.owner_id, name: p.owner_name || "Lead", email: p.owner_email || "", roll_no: p.owner_roll_no || "" }
                    : null;
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
                    description: p.description || "",
                    status,
                    priority: p.priority,
                    progress: taskProgressRate,
                    deadline: p.deadline,
                    teamLeader,
                    owner: teamLeader,
                    members,
                    memberCount: members.length + (teamLeader ? 1 : 0),
                    taskProgress: {
                        total: totalT,
                        completed: compT,
                        pending: totalT - compT,
                        completionRate: taskProgressRate,
                    },
                    deliverables: {
                        githubUrl: p.github_url || "",
                        demoUrl: p.demo_url || "",
                        pptUrl: p.ppt_url || "",
                    },
                    createdAt: p.created_at,
                };
            });

            const activeProjectCount = teams.filter((t) => t.status !== "Completed").length;
            const completedProjectCount = teams.filter((t) => t.status === "Completed").length;
            const avgProgress =
                teams.length > 0
                    ? Math.round(teams.reduce((sum, t) => sum + Number(t.progress || 0), 0) / teams.length)
                    : 0;

            return {
                mentor: {
                    ...safeUser(mentor),
                    status: mentor.is_active ? "active" : "inactive",
                },
                stats: {
                    assignedStudentCount: studentsRes.rows.length,
                    directStudentCount: studentsRes.rows.filter((s) => Number(s.mentor_id) === mentorId).length,
                    teamCount: teams.length,
                    activeProjectCount,
                    completedProjectCount,
                    avgProgress,
                },
                assignedStudents: studentsRes.rows.map(safeUser),
                students: studentsRes.rows.map(safeUser),
                teams,
                projects: teams,
                recentActivities: activitiesRes.rows.map(formatActivityRow),
            };
        });

        if (!detail) {
            return res.status(404).json({ success: false, message: "Mentor not found" });
        }

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
// 10. GET /api/admin/teams
// ==========================================
export const getAdminTeams = async (req, res, next) => {
    try {
        const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
        const mentorId = req.query.mentorId ? parsePositiveInt(req.query.mentorId) : null;
        const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : "";

        if (req.query.mentorId && !mentorId) {
            return res.status(400).json({ success: false, message: "Invalid mentorId filter" });
        }

        const cacheKey = `admin:teams:u:${req.user.id}:q:${search}:m:${mentorId || ""}:s:${statusFilter}`;
        const teams = await readCache.getOrSet(cacheKey, async () => {
            const conditions = ["1 = 1"];
            const params = [];

            if (search) {
                params.push(`%${escapeLikePattern(search)}%`);
                const idx = params.length;
                conditions.push(`(p.title ILIKE $${idx} ESCAPE '\\' OR COALESCE(p.description, '') ILIKE $${idx} ESCAPE '\\' OR COALESCE(o.name, '') ILIKE $${idx} ESCAPE '\\' OR COALESCE(m.name, '') ILIKE $${idx} ESCAPE '\\')`);
            }

            if (mentorId) {
                params.push(mentorId);
                conditions.push(`p.mentor_id = $${params.length}`);
            }

            if (statusFilter && statusFilter.toLowerCase() !== "all") {
                if (statusFilter.toLowerCase() === "completed") {
                    conditions.push(`(
                        LOWER(p.status) = 'completed'
                        AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                        AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                    )`);
                } else {
                    params.push(statusFilter);
                    conditions.push(`LOWER(p.status) = LOWER($${params.length})`);
                }
            }

            const { rows } = await pool.query(
                `SELECT p.*,
                        o.name AS owner_name, o.email AS owner_email, o.roll_no AS owner_roll_no,
                        m.name AS mentor_name, m.email AS mentor_email,
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
                 LEFT JOIN users m ON m.id = p.mentor_id
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY p.created_at DESC, p.id DESC
                 LIMIT 200;`,
                params
            );

            const now = Date.now();
            return rows.map((p) => {
                const totalT = Number(p.total_tasks || 0);
                const compT = Number(p.completed_tasks || 0);
                const taskProgressRate = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                const status = String(p.status).toLowerCase() === "completed" && (totalT === 0 || compT < totalT)
                    ? (compT > 0 ? "In Progress" : "Planning")
                    : p.status;
                const isOverdue = Boolean(p.deadline && new Date(p.deadline).getTime() < now && status !== "Completed");
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
                    isOverdue,
                    mentor: p.mentor_id ? { id: p.mentor_id, name: p.mentor_name, email: p.mentor_email } : null,
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
                    deliverables: {
                        githubUrl: p.github_url || "",
                        demoUrl: p.demo_url || "",
                        pptUrl: p.ppt_url || "",
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
// 11. GET /api/admin/teams/:projectId (Details only — NEVER chat)
// ==========================================
export const getAdminTeamById = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Valid project ID is required" });
        }

        const cacheKey = `admin:team:u:${req.user.id}:pid:${projectId}`;
        const detail = await readCache.getOrSet(cacheKey, async () => {
            const projRes = await pool.query(
                `SELECT p.*,
                        o.name AS owner_name, o.email AS owner_email, o.roll_no AS owner_roll_no,
                        m.name AS mentor_name, m.email AS mentor_email, m.phone AS mentor_phone
                 FROM projects p
                 LEFT JOIN users o ON o.id = p.owner_id
                 LEFT JOIN users m ON m.id = p.mentor_id
                 WHERE p.id = $1;`,
                [projectId]
            );
            if (projRes.rows.length === 0) return null;
            const p = projRes.rows[0];

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

            const teamLeader = p.owner_id
                ? {
                      id: p.owner_id,
                      _id: p.owner_id,
                      name: p.owner_name || "Lead",
                      email: p.owner_email || "",
                      roll_no: p.owner_roll_no || "",
                      role: "lead",
                  }
                : null;

            const members = membersRes.rows
                .filter((m) => String(m.id) !== String(p.owner_id))
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

            const deliverables = {
                githubUrl: p.github_url || "",
                demoUrl: p.demo_url || "",
                pptUrl: p.ppt_url || "",
            };

            const taskProgressRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            const status = String(p.status).toLowerCase() === "completed" && (totalTasks === 0 || completedTasks < totalTasks)
                ? (completedTasks > 0 ? "In Progress" : "Planning")
                : p.status;

            const team = {
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
                mentor: p.mentor_id
                    ? { id: p.mentor_id, name: p.mentor_name, email: p.mentor_email, phone: p.mentor_phone || "" }
                    : null,
                teamLeader,
                owner: teamLeader,
                members,
                memberCount: members.length + (teamLeader ? 1 : 0),
                deliverables,
                resources: deliverables,
                taskProgress: {
                    total: totalTasks,
                    completed: completedTasks,
                    pending: totalTasks - completedTasks,
                    completionRate: taskProgressRate,
                },
                mentorReview: p.mentor_review || null,
                reviewedAt: p.reviewed_at || null,
                createdAt: p.created_at,
                updatedAt: p.updated_at,
            };

            return {
                team,
                project: team,
                deliverables,
                resources: deliverables,
                tasks: formattedTasks,
                recentActivities: activitiesRes.rows.map(formatActivityRow),
                mentorReview: p.mentor_review || null,
                reviewedAt: p.reviewed_at || null,
            };
        });

        if (!detail) {
            return res.status(404).json({ success: false, message: "Team/Project not found" });
        }

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
// 12. PATCH /api/admin/projects/:projectId/reassign-mentor
// ==========================================
export const reassignProjectMentor = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Valid project ID is required" });
        }

        const { mentor_id, mentorId } = pickAllowedFields(req.body, ["mentor_id", "mentorId"]);
        const rawMentor = mentor_id !== undefined ? mentor_id : mentorId;
        if (rawMentor === undefined) {
            return res.status(400).json({ success: false, message: "mentor_id is required (integer ID or null)" });
        }

        const projRes = await pool.query(
            "SELECT id, title, owner_id, mentor_id FROM projects WHERE id = $1",
            [projectId]
        );
        if (projRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const project = projRes.rows[0];
        let newMentor = null;
        let nextMentorId = null;

        if (rawMentor !== null && rawMentor !== "") {
            nextMentorId = parsePositiveInt(rawMentor);
            if (!nextMentorId) {
                return res.status(400).json({ success: false, message: "Valid mentor_id is required" });
            }
            const mentorRes = await pool.query(
                "SELECT id, name, email, role, is_active FROM users WHERE id = $1",
                [nextMentorId]
            );
            if (
                mentorRes.rows.length === 0 ||
                !mentorRes.rows[0].is_active ||
                !isMentorRole(mentorRes.rows[0].role) ||
                isProtectedAccount(mentorRes.rows[0])
            ) {
                return res.status(400).json({ success: false, message: "Target mentor must be an active mentor account" });
            }
            newMentor = mentorRes.rows[0];
        }

        const previousMentorId = project.mentor_id;

        // Preserve project_id, tasks, chats, project_members, and resources completely intact
        const { rows } = await pool.query(
            "UPDATE projects SET mentor_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *;",
            [nextMentorId, projectId]
        );
        const updatedProject = rows[0];
        const io = req.app.get("io");

        // Evict previous mentor from project official chat room if changed and unassign project tasks
        if (previousMentorId && Number(previousMentorId) !== Number(nextMentorId)) {
            await pool.query(
                "UPDATE tasks SET assigned_to = NULL, updated_at = NOW() WHERE project_id = $1 AND assigned_to = $2;",
                [projectId, previousMentorId]
            );
            if (io) {
                io.in(`user:${previousMentorId}`).socketsLeave([
                    `project_${projectId}_official`,
                    `project_${projectId}_unofficial`,
                ]);
            }
        }

        const timestamp = new Date().toISOString();
        await logActivity({
            projectId,
            userId: req.user.id,
            action: "PROJECT_MENTOR_REASSIGNED",
            description: newMentor
                ? `Admin ${req.user.name} reassigned project "${project.title}" to mentor ${newMentor.name}`
                : `Admin ${req.user.name} unassigned mentor from project "${project.title}"`,
            entityType: "Project",
            entityId: projectId,
            metadata: {
                adminId: req.user.id,
                projectId,
                previousMentorId,
                newMentorId: nextMentorId,
                timestamp,
            },
        });

        const notifications = [];
        if (newMentor && Number(newMentor.id) !== Number(previousMentorId)) {
            notifications.push(
                createNotification({
                    userId: newMentor.id,
                    title: "Project Mentor Assigned",
                    message: `You have been assigned as mentor for project "${project.title}".`,
                    type: "project_mentor",
                    io,
                })
            );
        }
        if (previousMentorId && Number(previousMentorId) !== Number(nextMentorId)) {
            notifications.push(
                createNotification({
                    userId: previousMentorId,
                    title: "Project Reassigned",
                    message: `Project "${project.title}" has been reassigned to another mentor.`,
                    type: "project_mentor",
                    io,
                })
            );
        }
        if (project.owner_id) {
            notifications.push(
                createNotification({
                    userId: project.owner_id,
                    title: "Project Mentor Updated",
                    message: newMentor
                        ? `${newMentor.name} is now the mentor for "${project.title}". All tasks, chats, and resources remain intact.`
                        : `Mentor assignment for "${project.title}" was updated by an administrator.`,
                    type: "project_mentor",
                    io,
                })
            );
        }

        await Promise.all(notifications);
        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: newMentor ? "Project mentor reassigned successfully" : "Project mentor unassigned",
            project: {
                id: updatedProject.id,
                _id: updatedProject.id,
                title: updatedProject.title,
                mentor_id: updatedProject.mentor_id,
                mentor: newMentor ? { id: newMentor.id, name: newMentor.name, email: newMentor.email } : null,
            },
            previousMentorId,
            newMentorId: nextMentorId,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 13. PATCH /api/admin/users/:id/role
// ==========================================
export const transitionUserRole = async (req, res, next) => {
    const client = await pool.connect();
    let inTransaction = false;
    try {
        const targetUserId = parsePositiveInt(req.params.id);
        if (!targetUserId) {
            return res.status(400).json({ success: false, message: "Valid user ID is required" });
        }

        const {
            role,
            newRole,
            reassignedToMentorId,
            reassignToMentorId,
            approve,
            unassignMentorship,
        } = pickAllowedFields(req.body, [
            "role",
            "newRole",
            "reassignedToMentorId",
            "reassignToMentorId",
            "approve",
            "unassignMentorship",
        ]);

        const requestedRole = String(role ?? newRole ?? "").trim().toLowerCase();
        if (requestedRole !== "student" && requestedRole !== "mentor") {
            return res.status(400).json({
                success: false,
                message: "Role transition is restricted to 'student' or 'mentor'",
            });
        }

        if (Number(targetUserId) === Number(req.user.id)) {
            return res.status(403).json({
                success: false,
                message: "Administrators cannot modify their own role",
            });
        }

        await client.query("BEGIN");
        inTransaction = true;

        const targetRes = await client.query(
            `SELECT id, name, email, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at
             FROM users
             WHERE id = $1
             FOR UPDATE;`,
            [targetUserId]
        );

        if (targetRes.rows.length === 0) {
            await client.query("ROLLBACK");
            inTransaction = false;
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const targetUser = targetRes.rows[0];
        if (isProtectedAccount(targetUser)) {
            await client.query("ROLLBACK");
            inTransaction = false;
            return res.status(403).json({
                success: false,
                message: "Modifying admin or director account roles is strictly prohibited",
            });
        }

        const previousRole = String(targetUser.role || "student").toLowerCase().trim();
        let replacementMentor = null;
        let reassignmentCounts = null;
        const affectedProjectNotifications = [];
        const demotedFromMentor = isMentorRole(previousRole) && requestedRole === "student";

        // Demoting mentor -> student: gather affected projects/students and reassign or unassign atomically
        if (demotedFromMentor) {
            const depRes = await client.query(
                `SELECT
                    (SELECT COUNT(*)::int FROM users WHERE mentor_id = $1) AS assigned_students,
                    (SELECT COUNT(*)::int FROM projects WHERE mentor_id = $1) AS active_teams,
                    (SELECT COUNT(*)::int FROM projects WHERE mentor_id = $1 AND status != 'Completed') AS active_projects;`,
                [targetUserId]
            );

            const assignedStudents = Number(depRes.rows[0]?.assigned_students || 0);
            const activeTeams = Number(depRes.rows[0]?.active_teams || 0);
            const activeProjects = Number(depRes.rows[0]?.active_projects || 0);

            if (assignedStudents > 0 || activeTeams > 0 || activeProjects > 0) {
                const rawReplacement = reassignedToMentorId ?? reassignToMentorId;
                const shouldUnassign = unassignMentorship === true;

                if (!shouldUnassign && (rawReplacement === undefined || rawReplacement === null || rawReplacement === "")) {
                    await client.query("ROLLBACK");
                    inTransaction = false;
                    return res.status(400).json({
                        success: false,
                        code: "MENTOR_HAS_ASSIGNMENTS",
                        message:
                            "Cannot demote mentor with active assignments. Provide reassignedToMentorId to transfer them or set unassignMentorship: true to unassign them.",
                        counts: {
                            assignedStudents,
                            activeTeams,
                            activeProjects,
                        },
                    });
                }

                // Collect every affected student (project owners, project members, and directly assigned students) BEFORE updating
                const [projMembersRes, directStudentsRes] = await Promise.all([
                    client.query(
                        `SELECT DISTINCT p.id AS project_id, p.title AS project_title, uid AS student_id
                         FROM projects p
                         CROSS JOIN LATERAL (
                             SELECT p.owner_id AS uid WHERE p.owner_id IS NOT NULL
                             UNION
                             SELECT pm.user_id AS uid FROM project_members pm WHERE pm.project_id = p.id
                         ) members
                         WHERE p.mentor_id = $1 AND uid IS NOT NULL AND uid != $1;`,
                        [targetUserId]
                    ),
                    client.query(
                        "SELECT id AS student_id FROM users WHERE mentor_id = $1 AND id != $1;",
                        [targetUserId]
                    ),
                ]);

                let replacementId = null;
                if (!shouldUnassign) {
                    replacementId = parsePositiveInt(rawReplacement);
                    if (!replacementId || replacementId === targetUserId) {
                        await client.query("ROLLBACK");
                        inTransaction = false;
                        return res.status(400).json({
                            success: false,
                            message: "reassignedToMentorId must be a valid different mentor ID",
                        });
                    }

                    const repRes = await client.query(
                        "SELECT id, name, email, role, is_active FROM users WHERE id = $1 FOR UPDATE;",
                        [replacementId]
                    );
                    if (
                        repRes.rows.length === 0 ||
                        !repRes.rows[0].is_active ||
                        !isMentorRole(repRes.rows[0].role) ||
                        isProtectedAccount(repRes.rows[0])
                    ) {
                        await client.query("ROLLBACK");
                        inTransaction = false;
                        return res.status(400).json({
                            success: false,
                            message: "reassignedToMentorId must reference an active mentor account",
                        });
                    }

                    replacementMentor = repRes.rows[0];
                }

                // Atomically transfer or unassign all students and projects
                await client.query("UPDATE users SET mentor_id = $1 WHERE mentor_id = $2;", [
                    replacementId,
                    targetUserId,
                ]);
                await client.query("UPDATE projects SET mentor_id = $1, updated_at = NOW() WHERE mentor_id = $2;", [
                    replacementId,
                    targetUserId,
                ]);

                // Build per-student notifications so every team member is notified about mentor removal/reassignment
                const notifiedStudentIds = new Set();
                for (const row of projMembersRes.rows) {
                    const sid = Number(row.student_id);
                    notifiedStudentIds.add(sid);
                    affectedProjectNotifications.push({
                        userId: sid,
                        title: replacementMentor ? "Project Mentor Changed" : "Project Mentor Unassigned",
                        message: replacementMentor
                            ? `Your previous mentor ${targetUser.name} has been unassigned from "${row.project_title}" (role changed to student). ${replacementMentor.name} is now your project mentor.`
                            : `Your project mentor ${targetUser.name} has been unassigned/removed from "${row.project_title}". You can invite a new mentor from your Team page.`,
                        type: "mentor_unassigned",
                    });
                }

                for (const row of directStudentsRes.rows) {
                    const sid = Number(row.student_id);
                    if (notifiedStudentIds.has(sid)) continue;
                    notifiedStudentIds.add(sid);
                    affectedProjectNotifications.push({
                        userId: sid,
                        title: replacementMentor ? "Mentor Assignment Updated" : "Mentor Unassigned",
                        message: replacementMentor
                            ? `Your previous mentor ${targetUser.name} has been unassigned. ${replacementMentor.name} is now assigned as your mentor.`
                            : `Your mentor ${targetUser.name} has been unassigned/removed by an administrator.`,
                        type: "mentor_unassigned",
                    });
                }

                reassignmentCounts = {
                    assignedStudents,
                    activeTeams,
                    activeProjects,
                    reassignedToMentorId: replacementId,
                    unassigned: shouldUnassign,
                    notifiedStudentsCount: affectedProjectNotifications.length,
                };
            }
        }

        const wasPendingApproval =
            targetUser.role_classified === false ||
            (approve === true && targetUser.is_active === false);
        const shouldActivate = Boolean(wasPendingApproval || approve === true);

        // Update role, mark role_classified = TRUE, activate pending account atomically, clear refresh_token_hash
        const updateRes = await client.query(
            `UPDATE users
             SET role = $1,
                 role_classified = TRUE,
                 is_active = CASE WHEN $3::boolean = TRUE THEN TRUE ELSE is_active END,
                 refresh_token_hash = NULL
             WHERE id = $2
             RETURNING id, name, email, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at;`,
            [requestedRole, targetUserId, shouldActivate]
        );
        const updatedUser = updateRes.rows[0];
        const timestamp = new Date().toISOString();

        await logActivity({
            projectId: null,
            userId: req.user.id,
            action: wasPendingApproval ? "USER_APPROVED_AND_CLASSIFIED" : "USER_ROLE_CHANGED",
            description: wasPendingApproval
                ? `Admin ${req.user.name} approved and classified ${updatedUser.name} as ${requestedRole}`
                : `Admin ${req.user.name} changed ${updatedUser.name}'s role from ${previousRole} to ${requestedRole}`,
            entityType: "User",
            entityId: targetUserId,
            metadata: {
                admin: { id: req.user.id, name: req.user.name, email: req.user.email },
                targetUser: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email },
                previousRole,
                newRole: requestedRole,
                approved: wasPendingApproval,
                isActive: updatedUser.is_active,
                reassignment: reassignmentCounts,
                timestamp,
            },
            client,
        });

        const io = req.app.get("io");
        await createNotification({
            userId: targetUserId,
            title: wasPendingApproval ? "Account Approved & Activated" : "Account Role Updated",
            message: wasPendingApproval
                ? `Your CollabX account has been approved and classified as ${requestedRole} by ${req.user.name}. You can now log in.`
                : `Your account role was updated from ${previousRole} to ${requestedRole} by ${req.user.name}. Please log in again for updated portal access.`,
            type: wasPendingApproval ? "account_approved" : "role_change",
            client,
        });

        if (replacementMentor) {
            await createNotification({
                userId: replacementMentor.id,
                title: "Students & Teams Reassigned",
                message: `Students and projects previously mentored by ${targetUser.name} have been reassigned to you.`,
                type: "mentor_assignment",
                client,
            });
        }

        const createdStudentNotifs = [];
        for (const notif of affectedProjectNotifications) {
            const created = await createNotification({
                userId: notif.userId,
                title: notif.title,
                message: notif.message,
                type: notif.type,
                client,
            });
            if (created) createdStudentNotifs.push(created);
        }

        await client.query("COMMIT");
        inTransaction = false;

        // Immediately revoke target user's tokens & purge cached auth/project entries
        revokeUserTokens(targetUserId);
        invalidateUserCache();

        // Non-blocking account approval email notification
        if (wasPendingApproval && updatedUser?.email) {
            sendAccountApprovalEmail({
                to: updatedUser.email,
                name: updatedUser.name,
                role: requestedRole,
            }).then((mailRes) => {
                if (!mailRes?.sent) {
                    console.warn("[Admin User Approval Email Notice]", mailRes?.reason);
                }
            }).catch((mailErr) => {
                console.warn("[Admin User Approval Email Notice]", mailErr.message);
            });
        }

        if (io) {
            io.in(`user:${targetUserId}`).disconnectSockets(true);
            for (const n of createdStudentNotifs) {
                io.to(`user:${n.user_id}`).emit("notification:new", {
                    id: n.id,
                    _id: n.id,
                    title: n.title,
                    message: n.message,
                    type: n.type,
                    isRead: false,
                    createdAt: n.created_at,
                });
            }
        }

        return res.status(200).json({
            success: true,
            message: wasPendingApproval
                ? `${updatedUser.name} approved and classified as ${requestedRole}`
                : `User role updated from ${previousRole} to ${requestedRole}`,
            approved: wasPendingApproval,
            user: safeUser(updatedUser),
            data: safeUser(updatedUser),
            previousRole,
            newRole: requestedRole,
            reassignment: reassignmentCounts,
        });
    } catch (error) {
        if (inTransaction) {
            try {
                await client.query("ROLLBACK");
            } catch {
                // ignore rollback failure
            }
        }
        next(error);
    } finally {
        client.release();
    }
};

// ==========================================
// 14. ANNOUNCEMENTS MANAGEMENT (/api/admin/announcements)
// ==========================================
export const getAdminAnnouncements = async (req, res, next) => {
    try {
        const targetRole = String(req.query.targetRole || req.query.target_role || "all_filter").toLowerCase().trim();
        const scope = String(req.query.scope || "all").toLowerCase().trim();
        const cacheKey = `admin:announcements:u:${req.user.id}:tr:${targetRole}:sc:${scope}`;

        const announcements = await readCache.getOrSet(cacheKey, async () => {
            const conditions = ["1 = 1"];
            const params = [];

            if (ALLOWED_ANNOUNCEMENT_ROLES.has(targetRole)) {
                params.push(targetRole);
                conditions.push(`a.target_role = $${params.length}`);
            }

            if (scope === "institute") {
                conditions.push("a.project_id IS NULL");
            } else if (scope === "team") {
                conditions.push("a.project_id IS NOT NULL");
            }

            const { rows } = await pool.query(
                `SELECT a.*, u.name AS creator_name, u.email AS creator_email, u.role AS creator_role,
                        p.title AS project_title
                 FROM announcements a
                 LEFT JOIN users u ON u.id = a.created_by
                 LEFT JOIN projects p ON p.id = a.project_id
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY a.created_at DESC
                 LIMIT 100;`,
                params
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

export const createAdminAnnouncement = async (req, res, next) => {
    try {
        const { title, content, target_role, targetRole, project_id, projectId } = pickAllowedFields(req.body, [
            "title",
            "content",
            "target_role",
            "targetRole",
            "project_id",
            "projectId",
        ]);

        if (typeof title !== "string" || title.trim().length < 2 || title.trim().length > 200) {
            return res.status(400).json({ success: false, message: "Announcement title must be 2 to 200 characters" });
        }

        if (typeof content !== "string" || content.trim().length < 2 || content.trim().length > 5000) {
            return res.status(400).json({ success: false, message: "Announcement content must be 2 to 5000 characters" });
        }

        const rawTargetRole = String(target_role ?? targetRole ?? "all").trim().toLowerCase();
        if (!ALLOWED_ANNOUNCEMENT_ROLES.has(rawTargetRole)) {
            return res.status(400).json({
                success: false,
                message: "target_role must be one of: 'all', 'student', 'mentor'",
            });
        }

        let parsedProjectId = null;
        const rawProjectId = project_id !== undefined ? project_id : projectId;
        if (rawProjectId !== undefined && rawProjectId !== null && rawProjectId !== "") {
            parsedProjectId = parsePositiveInt(rawProjectId);
            if (!parsedProjectId) {
                return res.status(400).json({ success: false, message: "Valid project_id is required" });
            }
            const projCheck = await pool.query("SELECT id FROM projects WHERE id = $1", [parsedProjectId]);
            if (projCheck.rows.length === 0) {
                return res.status(404).json({ success: false, message: "Target project not found" });
            }
        }

        const { rows } = await pool.query(
            `INSERT INTO announcements (title, content, target_role, project_id, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING *;`,
            [title.trim(), content.trim(), rawTargetRole, parsedProjectId, req.user.id]
        );

        const inserted = rows[0];
        await logActivity({
            projectId: parsedProjectId,
            userId: req.user.id,
            action: "ANNOUNCEMENT_CREATED",
            description: `Admin ${req.user.name} published announcement "${inserted.title}" (${rawTargetRole})`,
            entityType: "Announcement",
            entityId: inserted.id,
            metadata: { targetRole: rawTargetRole, projectId: parsedProjectId },
        });

        invalidateAllCaches();

        // Non-blocking announcement email dispatch to target recipients
        (async () => {
            try {
                let recQuery = "";
                let queryParams = [];

                if (parsedProjectId) {
                    recQuery = `
                        SELECT DISTINCT u.email FROM users u
                        WHERE u.is_active = TRUE AND u.email IS NOT NULL AND (
                            u.id IN (SELECT owner_id FROM projects WHERE id = $1 AND owner_id IS NOT NULL)
                            OR u.id IN (SELECT user_id FROM project_members WHERE project_id = $1)
                        )
                        LIMIT 500;
                    `;
                    queryParams = [parsedProjectId];
                } else if (rawTargetRole === "student") {
                    recQuery = "SELECT email FROM users WHERE is_active = TRUE AND role = 'student' AND email IS NOT NULL LIMIT 500;";
                } else if (rawTargetRole === "mentor") {
                    recQuery = "SELECT email FROM users WHERE is_active = TRUE AND role IN ('mentor', 'senior_mentor', 'faculty_mentor') AND email IS NOT NULL LIMIT 500;";
                } else {
                    recQuery = "SELECT email FROM users WHERE is_active = TRUE AND email IS NOT NULL LIMIT 500;";
                }

                const recRes = await pool.query(recQuery, queryParams);
                const emails = recRes.rows.map((r) => r.email).filter(Boolean);

                if (emails.length > 0) {
                    const mailRes = await sendAnnouncementEmail({
                        to: emails,
                        title: inserted.title,
                        content: inserted.content,
                        authorName: req.user.name,
                        authorRole: req.user.role || "Administrator",
                    });
                    if (!mailRes?.sent) {
                        console.warn("[Admin Announcement Email Notice]", mailRes?.reason);
                    }
                }
            } catch (mailErr) {
                console.warn("[Admin Announcement Email Notice]", mailErr.message);
            }
        })();

        const formatted = formatAnnouncementRow({
            ...inserted,
            creator_name: req.user.name,
            creator_email: req.user.email,
            creator_role: req.user.role,
        });

        return res.status(201).json({
            success: true,
            message: "Announcement published successfully",
            announcement: formatted,
            data: formatted,
        });
    } catch (error) {
        next(error);
    }
};

export const deleteAdminAnnouncement = async (req, res, next) => {
    try {
        const announcementId = parsePositiveInt(req.params.id);
        if (!announcementId) {
            return res.status(400).json({ success: false, message: "Valid announcement ID is required" });
        }

        const { rows } = await pool.query(
            "DELETE FROM announcements WHERE id = $1 RETURNING id, title, project_id;",
            [announcementId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Announcement not found" });
        }

        await logActivity({
            projectId: rows[0].project_id,
            userId: req.user.id,
            action: "ANNOUNCEMENT_DELETED",
            description: `Admin ${req.user.name} deleted announcement "${rows[0].title}"`,
            entityType: "Announcement",
            entityId: announcementId,
        });

        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: "Announcement deleted successfully",
            id: announcementId,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/admin/users
 * Directory of all users across roles (Student, Mentor, Director, Coordinator, Admin).
 */
export const getAdminUsers = async (req, res, next) => {
    try {
        const { role, search, status, limit = 100, page = 1 } = req.query;
        const parsedLimit = Math.min(200, Math.max(1, parsePositiveInt(limit) || 50));
        const parsedPage = Math.max(1, parsePositiveInt(page) || 1);
        const offset = (parsedPage - 1) * parsedLimit;

        let query = `
            SELECT id, name, email, roll_no, role, phone, mentor_id,
                   role_classified, is_verified, is_active, created_at
            FROM users
            WHERE 1=1
        `;
        const params = [];
        let paramIdx = 1;

        if (role && role !== "all") {
            query += ` AND LOWER(role) = LOWER($${paramIdx})`;
            params.push(role.trim());
            paramIdx++;
        }

        if (status && status !== "all") {
            const isActive = status === "active";
            query += ` AND is_active = $${paramIdx}`;
            params.push(isActive);
            paramIdx++;
        }

        if (search && search.trim()) {
            const pattern = `%${escapeLikePattern(search.trim())}%`;
            query += ` AND (name ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR roll_no ILIKE $${paramIdx})`;
            params.push(pattern);
            paramIdx++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1};`;
        params.push(parsedLimit, offset);

        const { rows: users } = await pool.query(query, params);

        return res.status(200).json({
            success: true,
            count: users.length,
            users: users.map(safeUser),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /api/admin/users/:id
 * Hardened Admin User Deletion (Students, Mentors, Directors, etc.)
 * Strictly transactional with foreign key cleanup, self-lockout prevention, and audit logging.
 */
export const deleteAdminUser = async (req, res, next) => {
    const client = await pool.connect();
    try {
        const targetUserId = parsePositiveInt(req.params.id);
        if (!targetUserId) {
            return res.status(400).json({
                success: false,
                message: "Valid target user ID is required",
            });
        }

        const adminId = Number(req.user.id);

        // Security Guard: Prevent accidental self-lockout
        if (targetUserId === adminId) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete your own administrator account. Accidental self-lockout prevented.",
            });
        }

        // Fetch target user with row locking
        const { rows: userRows } = await client.query(
            "SELECT id, name, email, role, roll_no, is_active FROM users WHERE id = $1 FOR UPDATE;",
            [targetUserId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Target user not found or has already been deleted.",
            });
        }

        const targetUser = userRows[0];

        await client.query("BEGIN");

        // 1. Reassign or archive projects owned by target user
        const { rows: ownedProjects } = await client.query(
            "SELECT id, title FROM projects WHERE owner_id = $1;",
            [targetUserId]
        );

        for (const proj of ownedProjects) {
            const { rows: candidateMembers } = await client.query(
                "SELECT user_id FROM project_members WHERE project_id = $1 AND user_id != $2 ORDER BY user_id ASC LIMIT 1;",
                [proj.id, targetUserId]
            );

            if (candidateMembers.length > 0) {
                const newOwnerId = candidateMembers[0].user_id;
                await client.query(
                    "UPDATE projects SET owner_id = $1, updated_at = NOW() WHERE id = $2;",
                    [newOwnerId, proj.id]
                );
                await client.query(
                    "UPDATE project_members SET role = 'leader' WHERE project_id = $1 AND user_id = $2;",
                    [proj.id, newOwnerId]
                );
            } else {
                await client.query(
                    "UPDATE projects SET status = 'Archived', owner_id = NULL, is_on_leaderboard = FALSE, leaderboard_submitted_at = NULL, updated_at = NOW() WHERE id = $1;",
                    [proj.id]
                );
                await client.query("DELETE FROM project_stars WHERE project_id = $1;", [proj.id]);
            }
        }

        // 2. Clear mentor assignments from projects and students
        await client.query(
            "UPDATE projects SET mentor_id = NULL, updated_at = NOW() WHERE mentor_id = $1;",
            [targetUserId]
        );
        await client.query(
            "UPDATE users SET mentor_id = NULL WHERE mentor_id = $1;",
            [targetUserId]
        );

        // 3. Unassign tasks assigned to or created by target user
        await client.query(
            "UPDATE tasks SET assigned_to = NULL, updated_at = NOW() WHERE assigned_to = $1;",
            [targetUserId]
        );
        await client.query(
            "UPDATE tasks SET created_by = NULL, updated_at = NOW() WHERE created_by = $1;",
            [targetUserId]
        );

        // 4. Clean invitations referencing target user
        await client.query(
            "DELETE FROM invitations WHERE recipient_id = $1 OR sender_id = $1 OR recipient_email = $2;",
            [targetUserId, targetUser.email]
        );

        // 5. Clean team memberships, stars, notifications, messages, announcements
        await client.query("DELETE FROM project_members WHERE user_id = $1;", [targetUserId]);
        await client.query(`
            UPDATE projects
            SET status = 'Archived', is_on_leaderboard = FALSE, leaderboard_submitted_at = NULL, updated_at = NOW()
            WHERE owner_id IS NULL
              AND status != 'Archived'
              AND id NOT IN (SELECT project_id FROM project_members);
        `);
        await client.query(`
            DELETE FROM project_stars
            WHERE project_id IN (
                SELECT id FROM projects WHERE status = 'Archived' OR is_on_leaderboard = FALSE
            );
        `);
        await client.query("DELETE FROM project_stars WHERE user_id = $1;", [targetUserId]);
        await client.query("DELETE FROM notifications WHERE user_id = $1;", [targetUserId]);
        await client.query("DELETE FROM messages WHERE sender_id = $1;", [targetUserId]);
        await client.query("UPDATE announcements SET created_by = NULL WHERE created_by = $1;", [targetUserId]);

        // 6. Delete the user record
        await client.query("DELETE FROM users WHERE id = $1;", [targetUserId]);

        // 7. Structured audit logging (zero sensitive secrets logged)
        await logActivity({
            projectId: null,
            userId: adminId,
            action: "ADMIN_USER_DELETED",
            description: `Administrator ${req.user.name} deleted user "${targetUser.name}" (${targetUser.email}, Role: ${targetUser.role}, ID: ${targetUserId})`,
            entityType: "User",
            entityId: targetUserId,
            metadata: {
                adminId,
                targetUserId,
                targetRole: targetUser.role,
                targetEmail: targetUser.email,
                targetName: targetUser.name,
                deletedAt: new Date().toISOString(),
            },
            client,
        });

        await client.query("COMMIT");

        // Revoke tokens and wipe micro-caches
        invalidateUserCache(targetUserId);
        revokeUserTokens(targetUserId);
        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: `User "${targetUser.name}" (${targetUser.role || "student"}) deleted successfully.`,
            id: targetUserId,
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        next(error);
    } finally {
        client.release();
    }
};

/**
 * POST /api/admin/teams/:projectId/members
 * Admin Direct Team Member Enrollment (No Invite Required).
 */
export const addAdminTeamMember = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        const { userId, user_id, role = "member" } = req.body;
        const targetUserId = parsePositiveInt(userId ?? user_id);

        if (!projectId || !targetUserId) {
            return res.status(400).json({
                success: false,
                message: "Valid projectId and userId are required.",
            });
        }

        const projRes = await pool.query(
            "SELECT id, title, owner_id FROM projects WHERE id = $1;",
            [projectId]
        );
        if (projRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }
        const project = projRes.rows[0];

        if (Number(project.owner_id) === targetUserId) {
            return res.status(400).json({
                success: false,
                message: "User is already the Team Leader of this project.",
            });
        }

        const userRes = await pool.query(
            "SELECT id, name, email, role, is_active FROM users WHERE id = $1;",
            [targetUserId]
        );
        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Target user not found." });
        }
        const targetUser = userRes.rows[0];
        if (!targetUser.is_active) {
            return res.status(400).json({ success: false, message: "Cannot add an inactive user to a project team." });
        }

        // Check if user is already a squad member
        const existingMember = await pool.query(
            "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2;",
            [projectId, targetUserId]
        );
        if (existingMember.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: `"${targetUser.name}" is already a member of this team.`,
            });
        }

        // Direct enrollment without token/invite flow
        await pool.query(
            `INSERT INTO project_members (project_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (project_id, user_id) DO NOTHING;`,
            [projectId, targetUserId, String(role || "member").toLowerCase().trim()]
        );

        // Mark any pending invitations for this project and user as accepted
        await pool.query(
            `UPDATE invitations
             SET status = 'Accepted', updated_at = NOW()
             WHERE project_id = $1 AND (recipient_id = $2 OR recipient_email = $3) AND status = 'Pending';`,
            [projectId, targetUserId, targetUser.email]
        ).catch(() => {});

        // Notification to newly added member
        await createNotification({
            userId: targetUserId,
            title: "Added to Team",
            message: `Administrator ${req.user.name} added you directly to "${project.title}".`,
            type: "team",
            io: req.app.get("io"),
        });

        // Structured audit log
        await logActivity({
            projectId,
            userId: req.user.id,
            action: "ADMIN_MEMBER_ADDED",
            description: `Admin ${req.user.name} directly added "${targetUser.name}" (${targetUser.email}) to "${project.title}"`,
            entityType: "ProjectMember",
            entityId: targetUserId,
            metadata: { adminId: req.user.id, projectId, targetUserId },
        });

        invalidateAllCaches();

        return res.status(201).json({
            success: true,
            message: `"${targetUser.name}" added to team successfully.`,
            member: {
                id: targetUser.id,
                name: targetUser.name,
                email: targetUser.email,
                role: role || "member",
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /api/admin/teams/:projectId/members/:memberId
 * Admin Direct Team Member Removal.
 */
export const removeAdminTeamMember = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        const memberId = parsePositiveInt(req.params.memberId);

        if (!projectId || !memberId) {
            return res.status(400).json({
                success: false,
                message: "Valid projectId and memberId are required.",
            });
        }

        const projRes = await pool.query(
            "SELECT id, title, owner_id FROM projects WHERE id = $1;",
            [projectId]
        );
        if (projRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }
        const project = projRes.rows[0];

        if (Number(project.owner_id) === memberId) {
            return res.status(400).json({
                success: false,
                message: "Cannot remove the Team Leader from the project. Transfer ownership first.",
            });
        }

        const userRes = await pool.query(
            "SELECT id, name, email FROM users WHERE id = $1;",
            [memberId]
        );
        const memberName = userRes.rows[0]?.name || `User #${memberId}`;

        const client = await pool.connect();
        try {
            await client.query("BEGIN;");

            const delRes = await client.query(
                "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 RETURNING user_id;",
                [projectId, memberId]
            );

            if (delRes.rowCount === 0) {
                await client.query("ROLLBACK;");
                return res.status(404).json({
                    success: false,
                    message: "User is not a member of this project.",
                });
            }

            // Unassign active project tasks for this member inside same transaction
            await client.query(
                "UPDATE tasks SET assigned_to = NULL, updated_at = NOW() WHERE project_id = $1 AND assigned_to = $2;",
                [projectId, memberId]
            );

            await client.query("COMMIT;");
        } catch (txErr) {
            await client.query("ROLLBACK;");
            throw txErr;
        } finally {
            client.release();
        }

        // Audit log
        await logActivity({
            projectId,
            userId: req.user.id,
            action: "ADMIN_MEMBER_REMOVED",
            description: `Admin ${req.user.name} removed "${memberName}" from "${project.title}"`,
            entityType: "ProjectMember",
            entityId: memberId,
            metadata: { adminId: req.user.id, projectId, memberId },
        });

        invalidateAllCaches();

        const io = req.app.get("io");
        if (io) {
            io.to(`user:${memberId}`).emit("collabx_tasks_updated", { projectId, memberId, action: "removed" });
            io.to(`user:${memberId}`).emit("collabx_projects_updated", { projectId, memberId, action: "removed" });
            io.to(`user:${memberId}`).emit("collabx_team_updated", { projectId, memberId, action: "removed" });
            io.to(`project_${projectId}_official`).emit("collabx_tasks_updated", { projectId, memberId, action: "unassigned" });
            io.to(`project_${projectId}_official`).emit("collabx_team_updated", { projectId, memberId });
            io.in(`user:${memberId}`).socketsLeave([
                `project_${projectId}_official`,
                `project_${projectId}_unofficial`,
            ]);
        }

        return res.status(200).json({
            success: true,
            message: `"${memberName}" removed from team successfully.`,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * 20. DELETE /api/admin/teams/:projectId or /api/admin/projects/:projectId
 * Full transactional cleanup of project and all dependent records (tasks, members, invites)
 */
export const deleteAdminProject = async (req, res, next) => {
    try {
        const rawId = req.params.projectId ?? req.params.id;
        const projectId = parsePositiveInt(rawId);
        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID is required",
            });
        }

        const io = req.app.get("io");
        const result = await purgeProjectAndDependents({
            projectId,
            user: req.user,
            io,
            bypassOwnerCheck: true, // Caller is guaranteed admin by admin.routes.js RBAC
        });

        if (!result.success) {
            return res.status(result.status || 400).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: `Project "${result.project?.title}" and all associated tasks, squad members, and invitations permanently deleted`,
            project: result.project,
        });
    } catch (error) {
        next(error);
    }
};
