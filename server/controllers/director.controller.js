import pool from "../config/db.js";
import { parsePositiveInt, escapeLikePattern } from "../utils/formatters.js";
import { readCache, aggregateCache } from "../utils/microCache.js";

const parseCohortFromEmail = (email) => {
    const local = String(email || "").split("@")[0].toLowerCase();
    const match = local.match(/^(\d{2})etc([a-z]{2})/i);
    if (!match) {
        return { key: "general", batchYear: "General", department: "General", label: "General / Other" };
    }
    const batchYear = `20${match[1]}`;
    const deptCode = match[2].toUpperCase();
    const deptMap = {
        CS: "Computer Science (CS)",
        AD: "AI & Data Science (AD)",
        AI: "Artificial Intelligence (AI)",
        IT: "Information Technology (IT)",
        EC: "Electronics & Comm. (EC)",
        EE: "Electrical Engg. (EE)",
        ME: "Mechanical Engg. (ME)",
        CE: "Civil Engg. (CE)",
    };
    const department = deptMap[deptCode] || deptCode;
    return {
        key: `${batchYear}-${deptCode}`,
        batchYear,
        department,
        label: `${batchYear} - ${department}`,
    };
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
            role: a.user_role || "student",
        }
        : null,
    action: a.action,
    description: a.description,
    entityType: a.entity_type,
    entityId: a.entity_id,
    createdAt: a.created_at,
});

const buildCohortProgress = (studentsRows, projectMemberRows, taskRows) => {
    const studentCohort = new Map();
    const cohortMap = new Map();

    const ensureBucket = (cohortInfo) => {
        if (!cohortMap.has(cohortInfo.key)) {
            cohortMap.set(cohortInfo.key, {
                cohortKey: cohortInfo.key,
                batchYear: cohortInfo.batchYear,
                department: cohortInfo.department,
                label: cohortInfo.label,
                studentCount: 0,
                activeStudents: 0,
                projectIds: new Set(),
                projectProgressSum: 0,
                projectProgressCount: 0,
                completedProjects: 0,
                totalTasks: 0,
                completedTasks: 0,
            });
        }
        return cohortMap.get(cohortInfo.key);
    };

    for (const s of studentsRows) {
        const info = parseCohortFromEmail(s.email);
        studentCohort.set(s.id, info);
        const bucket = ensureBucket(info);
        bucket.studentCount += 1;
        if (s.is_active !== false) bucket.activeStudents += 1;
    }

    const countedProjectPerCohort = new Set();
    for (const pm of projectMemberRows) {
        const info = studentCohort.get(pm.student_id);
        if (!info) continue;
        const bucket = ensureBucket(info);
        const dedupeKey = `${info.key}:${pm.project_id}`;
        if (!countedProjectPerCohort.has(dedupeKey)) {
            countedProjectPerCohort.add(dedupeKey);
            bucket.projectIds.add(pm.project_id);
            bucket.projectProgressSum += Number(pm.progress || 0);
            bucket.projectProgressCount += 1;
            if (pm.status === "Completed") bucket.completedProjects += 1;
        }
    }

    for (const t of taskRows) {
        const info = studentCohort.get(t.assigned_to);
        if (!info) continue;
        const bucket = ensureBucket(info);
        bucket.totalTasks += Number(t.total_tasks || 0);
        bucket.completedTasks += Number(t.completed_tasks || 0);
    }

    return Array.from(cohortMap.values())
        .map((b) => {
            const teamCount = b.projectIds.size;
            return {
                cohortKey: b.cohortKey,
                batchYear: b.batchYear,
                department: b.department,
                label: b.label,
                studentCount: b.studentCount,
                activeStudents: b.activeStudents,
                teamCount,
                completedProjects: b.completedProjects,
                avgProgress:
                    b.projectProgressCount > 0 ? Math.round(b.projectProgressSum / b.projectProgressCount) : 0,
                totalTasks: b.totalTasks,
                completedTasks: b.completedTasks,
                taskCompletionRate: b.totalTasks > 0 ? Math.round((b.completedTasks / b.totalTasks) * 100) : 0,
            };
        })
        .sort((a, b) => b.studentCount - a.studentCount || a.label.localeCompare(b.label));
};

// ==========================================
// 1. GET /api/director/overview
// ==========================================
export const getDirectorOverview = async (req, res, next) => {
    try {
        const cacheKey = `director:overview:u:${req.user.id}`;
        const overview = await aggregateCache.getOrSet(cacheKey, async () => {
            const [
                kpiRes,
                mentorWorkloadRes,
                projectsRes,
                studentsRes,
                studentProjectsRes,
                studentTasksRes,
                activitiesRes,
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
                            WHERE NOT (
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
                        (
                            SELECT COALESCE(
                                ROUND(
                                    AVG(
                                        CASE
                                            WHEN (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) > 0
                                            THEN ROUND(((SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed')::numeric / (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)::numeric) * 100)
                                            ELSE 0
                                        END
                                    )::numeric, 1
                                ), 0
                            )
                            FROM projects p
                        ) AS avg_project_progress,
                        (SELECT COUNT(*)::int FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE p.status != 'Archived' OR p.status IS NULL) AS total_tasks,
                        (SELECT COUNT(*)::int FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE LOWER(TRIM(t.status)) IN ('completed', 'done') AND (p.status != 'Archived' OR p.status IS NULL)) AS completed_tasks,
                        (SELECT COUNT(*)::int FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE LOWER(TRIM(COALESCE(t.status, ''))) NOT IN ('completed', 'done') AND (p.status != 'Archived' OR p.status IS NULL)) AS pending_tasks
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
                           (SELECT COUNT(*)::int FROM projects p WHERE p.mentor_id = m.id) AS team_count,
                           (
                               SELECT COUNT(*)::int FROM projects p
                               WHERE p.mentor_id = m.id
                                 AND NOT (
                                     p.status = 'Completed'
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                                 )
                           ) AS active_projects,
                           (
                               SELECT COUNT(*)::int FROM projects p
                               WHERE p.mentor_id = m.id
                                 AND p.status = 'Completed'
                                 AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                                 AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                           ) AS completed_projects,
                           (
                               SELECT COUNT(*)::int FROM projects p
                               WHERE p.mentor_id = m.id
                                 AND p.deadline IS NOT NULL AND p.deadline < NOW()
                                 AND NOT (
                                     p.status = 'Completed'
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                                 )
                           ) AS overdue_projects,
                           (
                               SELECT COALESCE(
                                   ROUND(
                                       AVG(
                                           CASE
                                               WHEN (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) > 0
                                               THEN ROUND(((SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed')::numeric / (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)::numeric) * 100)
                                               ELSE 0
                                           END
                                       )::numeric, 1
                                   ), 0
                               )
                               FROM projects p
                               WHERE p.mentor_id = m.id
                           ) AS avg_progress
                    FROM users m
                    WHERE LOWER(m.role) IN ('mentor', 'faculty')
                    ORDER BY team_count DESC, student_count DESC, m.name ASC
                    LIMIT 100;
                `),
                pool.query(`
                    SELECT p.id, p.title, p.status, p.priority, p.progress, p.deadline,
                           o.id AS owner_id, o.name AS owner_name,
                           m.id AS mentor_id, m.name AS mentor_name,
                           (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                           (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
                    FROM projects p
                    LEFT JOIN users o ON o.id = p.owner_id
                    LEFT JOIN users m ON m.id = p.mentor_id
                    WHERE NOT (
                        p.status = 'Completed'
                        AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                        AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                    )
                    ORDER BY p.deadline ASC NULLS LAST, p.progress ASC
                    LIMIT 200;
                `),
                pool.query(`
                    SELECT id, email, is_active
                    FROM users
                    WHERE LOWER(COALESCE(role, 'student')) = 'student';
                `),
                pool.query(`
                    SELECT DISTINCT s.sid AS student_id, p.id AS project_id, p.progress, p.status
                    FROM (
                        SELECT owner_id AS sid, id AS pid FROM projects WHERE owner_id IS NOT NULL
                        UNION
                        SELECT user_id AS sid, project_id AS pid FROM project_members
                    ) s
                    JOIN projects p ON p.id = s.pid;
                `),
                pool.query(`
                    SELECT t.assigned_to,
                           COUNT(*)::int AS total_tasks,
                           COUNT(*) FILTER (WHERE LOWER(TRIM(t.status)) IN ('completed', 'done'))::int AS completed_tasks
                    FROM tasks t
                    LEFT JOIN projects p ON p.id = t.project_id
                    WHERE t.assigned_to IS NOT NULL AND (p.status != 'Archived' OR p.status IS NULL)
                    GROUP BY t.assigned_to;
                `),
                pool.query(`
                    SELECT a.id, a.project_id, a.user_id, a.action, a.description, a.entity_type, a.entity_id, a.created_at,
                           u.name AS user_name, u.role AS user_role,
                           p.title AS project_title
                    FROM activities a
                    LEFT JOIN users u ON u.id = a.user_id
                    LEFT JOIN projects p ON p.id = a.project_id
                    ORDER BY a.created_at DESC
                    LIMIT 25;
                `),
            ]);

            const k = kpiRes.rows[0] || {};
            const totalTeams = Number(k.total_teams || 0);
            const completedProjects = Number(k.completed_projects || 0);
            const totalTasks = Number(k.total_tasks || 0);
            const completedTasks = Number(k.completed_tasks || 0);

            const now = Date.now();
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const overdueProjects = [];
            const atRiskProjects = [];

            for (const p of projectsRes.rows) {
                const deadlineMs = p.deadline ? new Date(p.deadline).getTime() : null;
                const totalT = Number(p.total_tasks || 0);
                const compT = Number(p.completed_tasks || 0);
                const progress = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                const status = String(p.status).toLowerCase() === "completed" && (totalT === 0 || compT < totalT)
                    ? (compT > 0 ? "In Progress" : "Planning")
                    : p.status;
                const isOverdue = Boolean(deadlineMs && deadlineMs < now);
                const isNearDeadlineLowProgress = Boolean(
                    deadlineMs && deadlineMs >= now && deadlineMs - now <= sevenDaysMs && progress < 70
                );
                const isOnHold = status === "On Hold";

                const baseItem = {
                    id: p.id,
                    projectId: p.id,
                    title: p.title,
                    status,
                    priority: p.priority,
                    progress,
                    deadline: p.deadline,
                    teamLeader: p.owner_id ? { id: p.owner_id, name: p.owner_name } : null,
                    mentor: p.mentor_id ? { id: p.mentor_id, name: p.mentor_name } : null,
                    taskProgress: {
                        total: totalT,
                        completed: compT,
                        pending: totalT - compT,
                        completionRate: progress,
                    },
                };

                if (isOverdue) {
                    overdueProjects.push({ ...baseItem, riskReason: "Overdue deadline" });
                    atRiskProjects.push({ ...baseItem, riskReason: "Overdue deadline" });
                } else if (isNearDeadlineLowProgress) {
                    atRiskProjects.push({ ...baseItem, riskReason: "Deadline within 7 days & progress below 70%" });
                } else if (isOnHold) {
                    atRiskProjects.push({ ...baseItem, riskReason: "Project On Hold" });
                }
            }

            const cohortProgress = buildCohortProgress(
                studentsRes.rows,
                studentProjectsRes.rows,
                studentTasksRes.rows
            );

            const summary = {
                totalStudents: Number(k.total_students || 0),
                activeStudents: Number(k.active_students || 0),
                totalMentors: Number(k.total_mentors || 0),
                activeMentors: Number(k.active_mentors || 0),
                totalTeams,
                activeProjects: Number(k.active_projects || 0),
                completedProjects,
                projectCompletionRate:
                    totalTeams > 0 ? Number(((completedProjects / totalTeams) * 100).toFixed(1)) : 0,
                avgProjectProgress: Number(k.avg_project_progress || 0),
                totalTasks,
                completedTasks,
                pendingTasks: Number(k.pending_tasks || 0),
                taskCompletionRate:
                    totalTasks > 0 ? Number(((completedTasks / totalTasks) * 100).toFixed(1)) : 0,
                overdueProjectsCount: overdueProjects.length,
                atRiskProjectsCount: atRiskProjects.length,
            };

            const mentorWorkload = mentorWorkloadRes.rows.map((mw) => ({
                mentorId: mw.id,
                id: mw.id,
                name: mw.name,
                email: mw.email,
                isActive: Boolean(mw.is_active),
                studentCount: Number(mw.student_count || 0),
                teamCount: Number(mw.team_count || 0),
                activeProjects: Number(mw.active_projects || 0),
                completedProjects: Number(mw.completed_projects || 0),
                overdueProjects: Number(mw.overdue_projects || 0),
                avgProgress: Number(mw.avg_progress || 0),
            }));

            return {
                ...summary,
                summary,
                mentorWorkload,
                mentorWorkloadDistribution: mentorWorkload,
                overdueProjects: overdueProjects.slice(0, 20),
                atRiskProjects: atRiskProjects.slice(0, 25),
                cohortProgress,
                departmentCohortProgress: cohortProgress,
                instituteActivityFeed: activitiesRes.rows.map(formatActivityRow),
                recentActivities: activitiesRes.rows.map(formatActivityRow),
            };
        });

        return res.status(200).json({
            success: true,
            readOnly: true,
            ...overview,
            data: overview,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 2. GET /api/director/reports
// ==========================================
export const getDirectorReports = async (req, res, next) => {
    try {
        const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : "";
        const mentorId = req.query.mentorId ? parsePositiveInt(req.query.mentorId) : null;

        if (req.query.mentorId && !mentorId) {
            return res.status(400).json({ success: false, message: "Valid mentorId filter is required" });
        }

        const cacheKey = `director:reports:u:${req.user.id}:s:${statusFilter}:m:${mentorId || ""}`;
        const report = await readCache.getOrSet(cacheKey, async () => {
            const projConditions = ["1 = 1"];
            const projParams = [];
            if (statusFilter && statusFilter.toLowerCase() !== "all") {
                if (statusFilter.toLowerCase() === "completed") {
                    projConditions.push(`(
                        LOWER(p.status) = 'completed'
                        AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                        AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                    )`);
                } else {
                    projParams.push(statusFilter);
                    projConditions.push(`LOWER(p.status) = LOWER($${projParams.length})`);
                }
            }
            if (mentorId) {
                projParams.push(mentorId);
                projConditions.push(`p.mentor_id = $${projParams.length}`);
            }

            const [
                projectBreakdownRes,
                projectDualStatsRes,
                taskBreakdownRes,
                mentorDistributionRes,
                filteredProjectsRes,
                studentsRes,
                studentProjectsRes,
                studentTasksRes,
                announcementsRes,
                activitiesRes,
            ] = await Promise.all([
                pool.query(`
                    SELECT status,
                           COUNT(*)::int AS count,
                           COALESCE(ROUND(AVG(COALESCE(progress, 0))::numeric, 1), 0) AS avg_progress
                    FROM projects
                    GROUP BY status
                    ORDER BY count DESC;
                `),
                pool.query(`
                    SELECT
                        COUNT(*)::int AS total_projects,
                        COUNT(*) FILTER (
                            WHERE p.status = 'Completed'
                              AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                              AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                        )::int AS completed_projects,
                        COUNT(*) FILTER (
                            WHERE NOT (
                                p.status = 'Completed'
                                AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                                AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                            )
                        )::int AS active_projects
                    FROM projects p;
                `),
                pool.query(`
                    SELECT status, COUNT(*)::int AS count
                    FROM tasks
                    GROUP BY status
                    ORDER BY count DESC;
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
                           (SELECT COUNT(*)::int FROM projects p WHERE p.mentor_id = m.id) AS team_count,
                           (
                               SELECT COUNT(*)::int FROM projects p
                               WHERE p.mentor_id = m.id
                                 AND p.status = 'Completed'
                                 AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                                 AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                           ) AS completed_projects,
                           (
                               SELECT COUNT(*)::int FROM projects p
                               WHERE p.mentor_id = m.id
                                 AND NOT (
                                     p.status = 'Completed'
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                                 )
                           ) AS active_projects,
                           (
                               SELECT COUNT(*)::int FROM projects p
                               WHERE p.mentor_id = m.id
                                 AND p.deadline IS NOT NULL AND p.deadline < NOW()
                                 AND NOT (
                                     p.status = 'Completed'
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) >= 1
                                     AND (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') = (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)
                                 )
                           ) AS overdue_projects,
                           (
                               SELECT COALESCE(
                                   ROUND(
                                       AVG(
                                           CASE
                                               WHEN (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) > 0
                                               THEN ROUND(((SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed')::numeric / (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)::numeric) * 100)
                                               ELSE 0
                                           END
                                       )::numeric, 1
                                   ), 0
                               )
                               FROM projects p
                               WHERE p.mentor_id = m.id
                           ) AS avg_progress
                    FROM users m
                    WHERE LOWER(m.role) IN ('mentor', 'faculty')
                    ORDER BY team_count DESC, student_count DESC, m.name ASC
                    LIMIT 100;
                `),
                pool.query(
                    `SELECT p.id, p.title, p.status, p.priority, p.progress, p.deadline, p.created_at,
                            o.id AS owner_id, o.name AS owner_name,
                            m.id AS mentor_id, m.name AS mentor_name,
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
                     WHERE ${projConditions.join(" AND ")}
                     ORDER BY p.deadline ASC NULLS LAST, p.progress ASC
                     LIMIT 200;`,
                    projParams
                ),
                pool.query(`
                    SELECT id, email, is_active
                    FROM users
                    WHERE LOWER(COALESCE(role, 'student')) = 'student';
                `),
                pool.query(`
                    SELECT DISTINCT s.sid AS student_id, p.id AS project_id, p.progress, p.status
                    FROM (
                        SELECT owner_id AS sid, id AS pid FROM projects WHERE owner_id IS NOT NULL
                        UNION
                        SELECT user_id AS sid, project_id AS pid FROM project_members
                    ) s
                    JOIN projects p ON p.id = s.pid;
                `),
                pool.query(`
                    SELECT t.assigned_to,
                           COUNT(*)::int AS total_tasks,
                           COUNT(*) FILTER (WHERE LOWER(TRIM(t.status)) IN ('completed', 'done'))::int AS completed_tasks
                    FROM tasks t
                    LEFT JOIN projects p ON p.id = t.project_id
                    WHERE t.assigned_to IS NOT NULL AND (p.status != 'Archived' OR p.status IS NULL)
                    GROUP BY t.assigned_to;
                `),
                pool.query(`
                    SELECT a.id, a.title, a.content, a.target_role, a.created_at, u.name AS creator_name
                    FROM announcements a
                    LEFT JOIN users u ON u.id = a.created_by
                    WHERE a.project_id IS NULL
                    ORDER BY a.created_at DESC
                    LIMIT 10;
                `),
                pool.query(`
                    SELECT a.id, a.project_id, a.user_id, a.action, a.description, a.entity_type, a.entity_id, a.created_at,
                           u.name AS user_name, u.role AS user_role,
                           p.title AS project_title
                    FROM activities a
                    LEFT JOIN users u ON u.id = a.user_id
                    LEFT JOIN projects p ON p.id = a.project_id
                    ORDER BY a.created_at DESC
                    LIMIT 30;
                `),
            ]);

            const now = Date.now();
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const overdueAndAtRiskProjects = [];

            const projectSummaries = filteredProjectsRes.rows.map((p) => {
                const deadlineMs = p.deadline ? new Date(p.deadline).getTime() : null;
                const totalT = Number(p.total_tasks || 0);
                const compT = Number(p.completed_tasks || 0);
                const progress = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                const status = String(p.status).toLowerCase() === "completed" && (totalT === 0 || compT < totalT)
                    ? (compT > 0 ? "In Progress" : "Planning")
                    : p.status;

                let riskReason = null;
                if (status !== "Completed") {
                    if (deadlineMs && deadlineMs < now) {
                        riskReason = "Overdue deadline";
                    } else if (deadlineMs && deadlineMs - now <= sevenDaysMs && progress < 70) {
                        riskReason = "Deadline within 7 days & progress below 70%";
                    } else if (status === "On Hold") {
                        riskReason = "Project On Hold";
                    }
                }

                const entry = {
                    id: p.id,
                    projectId: p.id,
                    title: p.title,
                    status,
                    priority: p.priority,
                    progress,
                    deadline: p.deadline,
                    memberCount: Number(p.member_count || 0),
                    teamLeader: p.owner_id ? { id: p.owner_id, name: p.owner_name } : null,
                    mentor: p.mentor_id ? { id: p.mentor_id, name: p.mentor_name } : null,
                    taskProgress: {
                        total: totalT,
                        completed: compT,
                        pending: totalT - compT,
                        completionRate: progress,
                    },
                    riskReason,
                };

                if (riskReason) overdueAndAtRiskProjects.push(entry);
                return entry;
            });

            const dualStats = projectDualStatsRes.rows[0] || {};
            const totalProjectsAll = Number(dualStats.total_projects || 0);
            const completedProjectsAll = Number(dualStats.completed_projects || 0);
            const activeProjectsAll = Number(dualStats.active_projects || 0);
            const totalTasksAll = taskBreakdownRes.rows.reduce((s, r) => s + Number(r.count || 0), 0);
            const completedTasksAll = Number(
                taskBreakdownRes.rows.find((r) => r.status === "Completed")?.count || 0
            );

            const mentorWorkloadDistribution = mentorDistributionRes.rows.map((mw) => {
                const teamCount = Number(mw.team_count || 0);
                const completedP = Number(mw.completed_projects || 0);
                return {
                    mentorId: mw.id,
                    id: mw.id,
                    name: mw.name,
                    email: mw.email,
                    isActive: Boolean(mw.is_active),
                    studentCount: Number(mw.student_count || 0),
                    teamCount,
                    activeProjects: Number(mw.active_projects || 0),
                    completedProjects: completedP,
                    overdueProjects: Number(mw.overdue_projects || 0),
                    completionRate: teamCount > 0 ? Number(((completedP / teamCount) * 100).toFixed(1)) : 0,
                    avgProgress: Number(mw.avg_progress || 0),
                };
            });

            const departmentCohortProgress = buildCohortProgress(
                studentsRes.rows,
                studentProjectsRes.rows,
                studentTasksRes.rows
            );

            return {
                generatedAt: new Date().toISOString(),
                executiveSummary: {
                    totalStudents: studentsRes.rows.length,
                    totalMentors: mentorWorkloadDistribution.length,
                    totalTeams: totalProjectsAll,
                    activeProjects: activeProjectsAll,
                    completedProjects: completedProjectsAll,
                    projectCompletionRate:
                        totalProjectsAll > 0
                            ? Number(((completedProjectsAll / totalProjectsAll) * 100).toFixed(1))
                            : 0,
                    totalTasks: totalTasksAll,
                    completedTasks: completedTasksAll,
                    taskCompletionRate:
                        totalTasksAll > 0 ? Number(((completedTasksAll / totalTasksAll) * 100).toFixed(1)) : 0,
                    atRiskCount: overdueAndAtRiskProjects.length,
                    projectStatusBreakdown: projectBreakdownRes.rows.map((r) => ({
                        status: r.status,
                        count: Number(r.count || 0),
                        avgProgress: Number(r.avg_progress || 0),
                    })),
                    taskStatusBreakdown: taskBreakdownRes.rows.map((r) => ({
                        status: r.status,
                        count: Number(r.count || 0),
                    })),
                },
                mentorWorkloadDistribution,
                overdueAndAtRiskProjects,
                projects: projectSummaries,
                departmentCohortProgress,
                recentAnnouncements: announcementsRes.rows.map((a) => ({
                    id: a.id,
                    title: a.title,
                    content: a.content,
                    targetRole: a.target_role,
                    createdBy: a.creator_name || "Admin",
                    createdAt: a.created_at,
                })),
                instituteActivityFeed: activitiesRes.rows.map(formatActivityRow),
            };
        });

        return res.status(200).json({
            success: true,
            readOnly: true,
            ...report,
            data: report,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 3. GET /api/director/projects/:id (Read-Only Inspection)
// ==========================================
export const getDirectorProjectById = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.id);
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Valid project ID is required" });
        }

        const cacheKey = `director:project:u:${req.user.id}:pid:${projectId}`;
        const detail = await readCache.getOrSet(cacheKey, async () => {
            const projectRes = await pool.query(
                `SELECT p.id, p.title, p.description, p.status, p.priority, p.deadline, p.created_at,
                        p.ppt_url, p.demo_url, p.github_url,
                        o.id AS owner_id, o.name AS owner_name, o.email AS owner_email, o.roll_no AS owner_roll_no,
                        m.id AS mentor_id, m.name AS mentor_name, m.email AS mentor_email,
                        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks
                 FROM projects p
                 LEFT JOIN users o ON o.id = p.owner_id
                 LEFT JOIN users m ON m.id = p.mentor_id
                 WHERE p.id = $1;`,
                [projectId]
            );

            if (projectRes.rows.length === 0) return null;
            const p = projectRes.rows[0];

            const membersRes = await pool.query(
                `SELECT u.id, u.name, u.email, u.roll_no, pm.role
                 FROM project_members pm
                 JOIN users u ON u.id = pm.user_id
                 WHERE pm.project_id = $1
                 ORDER BY u.name ASC;`,
                [projectId]
            );

            const totalT = Number(p.total_tasks || 0);
            const compT = Number(p.completed_tasks || 0);
            const progress = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
            const status = String(p.status).toLowerCase() === "completed" && (totalT === 0 || compT < totalT)
                ? (compT > 0 ? "In Progress" : "Planning")
                : p.status;

            const teamLeader = p.owner_id
                ? {
                    id: p.owner_id,
                    name: p.owner_name || "Team Leader",
                    email: p.owner_email || "",
                    roll_no: p.owner_roll_no || "",
                }
                : null;

            const mentor = p.mentor_id
                ? {
                    id: p.mentor_id,
                    name: p.mentor_name || "Mentor",
                    email: p.mentor_email || "",
                }
                : null;

            const members = membersRes.rows
                .filter((m) => String(m.id) !== String(p.owner_id))
                .map((m) => ({
                    id: m.id,
                    name: m.name,
                    email: m.email,
                    roll_no: m.roll_no || "",
                    role: m.role || "Member",
                }));

            return {
                id: p.id,
                title: p.title,
                description: p.description || "",
                status,
                priority: p.priority || "Medium",
                progress,
                deadline: p.deadline,
                createdAt: p.created_at,
                deliverables: {
                    pptUrl: p.ppt_url || "",
                    demoUrl: p.demo_url || "",
                    githubUrl: p.github_url || "",
                },
                teamLeader,
                mentor,
                members,
                memberCount: members.length + (teamLeader ? 1 : 0),
            };
        });

        if (!detail) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        return res.status(200).json({
            success: true,
            readOnly: true,
            project: detail,
            data: detail,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 4. GET /api/director/mentors/:id (Read-Only Inspection)
// ==========================================
export const getDirectorMentorById = async (req, res, next) => {
    try {
        const mentorId = parsePositiveInt(req.params.id);
        if (!mentorId) {
            return res.status(400).json({ success: false, message: "Valid mentor ID is required" });
        }

        const cacheKey = `director:mentor:u:${req.user.id}:mid:${mentorId}`;
        const detail = await readCache.getOrSet(cacheKey, async () => {
            const mentorRes = await pool.query(
                `SELECT id, name, email, is_active, created_at
                 FROM users
                 WHERE id = $1 AND LOWER(role) IN ('mentor', 'faculty');`,
                [mentorId]
            );

            if (mentorRes.rows.length === 0) return null;
            const m = mentorRes.rows[0];

            const projectsRes = await pool.query(
                `SELECT p.id, p.title, p.description, p.status, p.priority, p.deadline, p.created_at,
                        p.ppt_url, p.demo_url, p.github_url,
                        o.id AS owner_id, o.name AS owner_name, o.email AS owner_email, o.roll_no AS owner_roll_no,
                        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_tasks,
                        (SELECT COUNT(DISTINCT uid)::int FROM (
                            SELECT pm.user_id AS uid FROM project_members pm WHERE pm.project_id = p.id
                            UNION
                            SELECT p.owner_id AS uid WHERE p.owner_id IS NOT NULL
                        ) sub) AS member_count
                 FROM projects p
                 LEFT JOIN users o ON o.id = p.owner_id
                 WHERE p.mentor_id = $1
                 ORDER BY p.deadline ASC NULLS LAST, p.id DESC;`,
                [mentorId]
            );

            const projects = projectsRes.rows.map((p) => {
                const totalT = Number(p.total_tasks || 0);
                const compT = Number(p.completed_tasks || 0);
                const progress = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                const status = String(p.status).toLowerCase() === "completed" && (totalT === 0 || compT < totalT)
                    ? (compT > 0 ? "In Progress" : "Planning")
                    : p.status;
                return {
                    id: p.id,
                    title: p.title,
                    description: p.description || "",
                    status,
                    priority: p.priority,
                    progress,
                    deadline: p.deadline,
                    deliverables: {
                        pptUrl: p.ppt_url || "",
                        demoUrl: p.demo_url || "",
                        githubUrl: p.github_url || "",
                    },
                    teamLeader: p.owner_id
                        ? {
                            id: p.owner_id,
                            name: p.owner_name || "Team Leader",
                            email: p.owner_email || "",
                            roll_no: p.owner_roll_no || "",
                        }
                        : null,
                    memberCount: Number(p.member_count || 0),
                };
            });

            const teamCount = projects.length;
            const completedProjects = projects.filter((p) => p.status === "Completed").length;
            const activeProjects = teamCount - completedProjects;
            const avgProgress = teamCount > 0
                ? Math.round(projects.reduce((acc, p) => acc + p.progress, 0) / teamCount)
                : 0;

            return {
                id: m.id,
                name: m.name,
                email: m.email,
                isActive: Boolean(m.is_active),
                teamCount,
                activeProjects,
                completedProjects,
                avgProgress,
                projects,
            };
        });

        if (!detail) {
            return res.status(404).json({ success: false, message: "Faculty Mentor not found" });
        }

        return res.status(200).json({
            success: true,
            readOnly: true,
            mentor: detail,
            data: detail,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 5. GET /api/director/students/:id (Read-Only Inspection)
// ==========================================
export const getDirectorStudentById = async (req, res, next) => {
    try {
        const studentId = parsePositiveInt(req.params.id);
        if (!studentId) {
            return res.status(400).json({ success: false, message: "Valid student ID is required" });
        }

        const cacheKey = `director:student:u:${req.user.id}:sid:${studentId}`;
        const detail = await readCache.getOrSet(cacheKey, async () => {
            const studentRes = await pool.query(
                `SELECT u.id, u.name, u.email, u.role, u.phone, u.roll_no,
                        u.is_active, u.created_at, u.mentor_id,
                        m.name AS mentor_name, m.email AS mentor_email, m.phone AS mentor_phone
                 FROM users u
                 LEFT JOIN users m ON m.id = u.mentor_id
                 WHERE u.id = $1 AND LOWER(COALESCE(u.role, 'student')) = 'student';`,
                [studentId]
            );

            if (studentRes.rows.length === 0) return null;
            const student = studentRes.rows[0];

            const [projectsRes, tasksRes, statsRes] = await Promise.all([
                pool.query(
                    `SELECT DISTINCT p.*,
                            o.name AS owner_name, o.email AS owner_email,
                            m.name AS mentor_name, m.email AS mentor_email,
                            (p.owner_id = $1 OR EXISTS (
                                SELECT 1 FROM project_members pm_leader
                                WHERE pm_leader.project_id = p.id
                                  AND pm_leader.user_id = $1
                                  AND LOWER(TRIM(pm_leader.role)) = 'leader'
                            )) AS is_leader,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                            (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND LOWER(TRIM(t.status)) IN ('completed', 'done')) AS completed_tasks
                     FROM projects p
                     LEFT JOIN project_members pm ON pm.project_id = p.id
                     LEFT JOIN users o ON o.id = p.owner_id
                     LEFT JOIN users m ON m.id = p.mentor_id
                     WHERE (p.owner_id = $1 OR pm.user_id = $1)
                       AND (p.status IS NULL OR LOWER(TRIM(p.status)) != 'archived')
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
                     WHERE t.assigned_to = $1 AND (p.status IS NULL OR LOWER(TRIM(p.status)) != 'archived')
                     ORDER BY t.created_at DESC
                     LIMIT 100;`,
                    [studentId]
                ),
                pool.query(
                    `SELECT
                        COUNT(*)::int AS total_tasks,
                        COUNT(CASE WHEN LOWER(TRIM(t.status)) IN ('completed', 'done') THEN 1 END)::int AS completed_tasks,
                        COUNT(CASE WHEN LOWER(TRIM(t.status)) = 'in progress' THEN 1 END)::int AS in_progress_tasks,
                        COUNT(CASE WHEN LOWER(TRIM(t.status)) = 'todo' THEN 1 END)::int AS todo_tasks
                     FROM tasks t
                     LEFT JOIN projects p ON p.id = t.project_id
                     WHERE t.assigned_to = $1 AND (p.status IS NULL OR LOWER(TRIM(p.status)) != 'archived');`,
                    [studentId]
                ),
            ]);

            const seenProjectIds = new Set();
            const uniqueProjects = [];
            for (const p of projectsRes.rows) {
                if (!seenProjectIds.has(p.id)) {
                    seenProjectIds.add(p.id);
                    uniqueProjects.push(p);
                }
            }

            const projectIds = uniqueProjects.map((p) => p.id);
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

            const tasks = tasksRes.rows.map((t) => ({
                id: t.id,
                _id: t.id,
                title: t.title,
                description: t.description || "",
                status: t.status,
                priority: t.priority,
                deadline: t.deadline,
                dueDate: t.deadline,
                projectId: t.project_id,
                projectTitle: t.project_title || "",
                assignedTo: t.assigned_to ? { id: t.assigned_to, name: t.assignee_name, email: t.assignee_email } : null,
                createdBy: t.created_by ? { id: t.created_by, name: t.creator_name, email: t.creator_email } : null,
                createdAt: t.created_at,
                updatedAt: t.updated_at,
            }));

            const taskStats = statsRes.rows[0] || { total_tasks: 0, completed_tasks: 0 };
            const totalTasks = Number(taskStats.total_tasks || 0);
            const completedTasks = Number(taskStats.completed_tasks || 0);
            const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            const teams = uniqueProjects.map((p) => {
                const totalT = Number(p.total_tasks || 0);
                const compT = Number(p.completed_tasks || 0);
                const taskProgressRate = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;
                const isLeader = Boolean(p.is_leader) || Number(p.owner_id) === studentId;
                const status = String(p.status).toLowerCase() === "completed" && (totalT === 0 || compT < totalT)
                    ? (compT > 0 ? "In Progress" : "Planning")
                    : p.status;
                return {
                    id: p.id,
                    _id: p.id,
                    title: p.title,
                    name: p.title,
                    status,
                    progress: taskProgressRate,
                    deadline: p.deadline,
                    isLeader,
                    mentor: p.mentor_id ? { id: p.mentor_id, name: p.mentor_name, email: p.mentor_email } : null,
                    taskProgress: {
                        total: totalT,
                        completed: compT,
                        pending: Math.max(0, totalT - compT),
                        completionRate: taskProgressRate,
                    },
                };
            });

            const isLeader = teams.some((t) => t.isLeader);
            const leaderProjectsCount = teams.filter((t) => t.isLeader).length;
            const projectCount = teams.length;
            const teamCount = teams.length;

            const assignedMentor = student.mentor_id
                ? { id: student.mentor_id, name: student.mentor_name, email: student.mentor_email, phone: student.mentor_phone || "" }
                : teams[0]?.mentor || null;

            return {
                id: student.id,
                student: {
                    id: student.id,
                    name: student.name,
                    email: student.email,
                    role: student.role || "student",
                    department: parseCohortFromEmail(student.email).department,
                    cohort: parseCohortFromEmail(student.email),
                    phone: student.phone || "",
                    roll_no: student.roll_no || "",
                    rollNumber: student.roll_no || "",
                    avatar: null,
                    isActive: Boolean(student.is_active),
                    is_active: Boolean(student.is_active),
                    createdAt: student.created_at,
                    mentor: assignedMentor,
                    isLeader,
                    projectCount,
                    teamCount,
                    leaderProjectsCount,
                },
                mentor: assignedMentor,
                team: teams[0] || null,
                project: teams[0] || null,
                teams,
                projects: teams,
                tasks,
                projectCount,
                teamCount,
                leaderProjectsCount,
                isLeader,
                taskProgress: {
                    total: totalTasks,
                    completed: completedTasks,
                    totalTasks,
                    completedTasks,
                    pending: Math.max(0, totalTasks - completedTasks),
                    todo: Number(taskStats.todo_tasks || 0),
                    inProgress: Number(taskStats.in_progress_tasks || 0),
                    completionRate,
                },
                recentActivities: activitiesRes.rows.map(formatActivityRow),
                activityHistory: activitiesRes.rows.map(formatActivityRow),
            };
        });

        if (!detail) {
            return res.status(404).json({ success: false, message: "Student not found" });
        }

        return res.status(200).json({
            success: true,
            readOnly: true,
            student: detail.student,
            data: detail,
            ...detail,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 6. GET /api/director/students (Directory with Projects, Tasks, and Search)
// ==========================================
export const getDirectorStudents = async (req, res, next) => {
    try {
        const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
        const statusFilter = String(req.query.status || "all").toLowerCase().trim();
        const page = Math.min(1000, Math.max(1, parseInt(req.query.page, 10) || 1));
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const offset = (page - 1) * limit;

        const cacheKey = `director:students:u:${req.user.id}:q:${search}:s:${statusFilter}:p:${page}:l:${limit}`;
        const result = await readCache.getOrSet(cacheKey, async () => {
            const conditions = ["LOWER(COALESCE(u.role, 'student')) = 'student'"];
            const params = [];

            if (search) {
                params.push(`%${escapeLikePattern(search)}%`);
                const idx = params.length;
                conditions.push(`(u.name ILIKE $${idx} ESCAPE '\\' OR u.email ILIKE $${idx} ESCAPE '\\' OR COALESCE(u.roll_no, '') ILIKE $${idx} ESCAPE '\\')`);
            }

            if (statusFilter === "active") {
                conditions.push("u.is_active = TRUE");
            } else if (statusFilter === "inactive") {
                conditions.push("u.is_active = FALSE");
            }

            const whereClause = conditions.join(" AND ");

            const countRes = await pool.query(
                `SELECT COUNT(*)::int AS total FROM users u WHERE ${whereClause}`,
                params
            );
            const total = Number(countRes.rows[0]?.total || 0);

            const listParams = [...params, limit, offset];
            const { rows: students } = await pool.query(
                `SELECT u.id, u.name, u.email, u.roll_no, u.role, u.phone, u.mentor_id,
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
                return { students: [], total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
            }

            const studentIds = students.map((s) => s.id);
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
            for (const row of projectsRes.rows) {
                if (!projectsByStudent.has(row.student_id)) {
                    projectsByStudent.set(row.student_id, []);
                }
                projectsByStudent.get(row.student_id).push({
                    id: row.id,
                    _id: row.id,
                    title: row.title,
                    status: row.status,
                    progress: Number(row.progress || 0),
                    deadline: row.deadline,
                    isLeader: Boolean(row.is_leader),
                    mentorName: row.mentor_name,
                    mentorEmail: row.mentor_email,
                });
            }

            const tasksByStudent = new Map();
            for (const row of tasksRes.rows) {
                tasksByStudent.set(row.student_id, {
                    totalTasks: Number(row.total_tasks || 0),
                    completedTasks: Number(row.completed_tasks || 0),
                    pendingTasks: Number(row.pending_tasks || 0),
                });
            }

            const formatted = students.map((s) => {
                const sProjects = projectsByStudent.get(s.id) || [];
                const sTasks = tasksByStudent.get(s.id) || { totalTasks: 0, completedTasks: 0, pendingTasks: 0 };
                const isLeader = sProjects.some((p) => p.isLeader);

                return {
                    id: s.id,
                    _id: s.id,
                    name: s.name,
                    email: s.email,
                    roll_no: s.roll_no || "",
                    rollNumber: s.roll_no || "",
                    role: s.role || "student",
                    department: parseCohortFromEmail(s.email).department,
                    cohort: parseCohortFromEmail(s.email),
                    phone: s.phone || "",
                    isActive: Boolean(s.is_active),
                    is_active: Boolean(s.is_active),
                    createdAt: s.created_at,
                    mentor: s.mentor_id
                        ? { id: s.mentor_id, name: s.mentor_name, email: s.mentor_email }
                        : null,
                    projectCount: sProjects.length,
                    teamCount: sProjects.length,
                    projects: sProjects,
                    teams: sProjects,
                    isLeader,
                    totalTasks: sTasks.totalTasks,
                    completedTasks: sTasks.completedTasks,
                    pendingTasks: sTasks.pendingTasks,
                    taskCompletionRate: sTasks.totalTasks > 0 ? Math.round((sTasks.completedTasks / sTasks.totalTasks) * 100) : 0,
                };
            });

            return {
                students: formatted,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit) || 1,
            };
        });

        return res.status(200).json({
            success: true,
            readOnly: true,
            students: result.students,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages,
            },
        });
    } catch (error) {
        next(error);
    }
};
