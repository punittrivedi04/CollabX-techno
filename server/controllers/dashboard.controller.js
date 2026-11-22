import pool from "../config/db.js";
import { formatProject, formatTask } from "../utils/formatters.js";
import { isDirector } from "../middleware/directorGuard.js";
import { readCache } from "../utils/microCache.js";

export const getDashboard = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = String(req.user.role || "student").toLowerCase().trim();
        const isDirectorUser = role === "director" || isDirector(req.user);
        const isAdmin = role === "admin" || role === "coordinator";
        const hasArchivedOversight = isAdmin || isDirectorUser;

        // Strictly isolate cache key per userId + role + director flag (prevents cross-admin myTasks leakage)
        const cacheKey = `dashboard:u:${userId}:r:${role}:d:${isDirectorUser ? 1 : 0}`;

        const dashboardData = await readCache.getOrSet(cacheKey, async () => {
            let projectsQuery;
            let queryParams;

            if (hasArchivedOversight) {
                projectsQuery = `
                    SELECT p.*, u.name as owner_name, u.email as owner_email
                    FROM projects p
                    LEFT JOIN users u ON p.owner_id = u.id
                    ORDER BY p.created_at DESC;
                `;
                queryParams = [];
            } else {
                projectsQuery = `
                    SELECT DISTINCT p.*, u.name as owner_name, u.email as owner_email
                    FROM projects p
                    LEFT JOIN users u ON p.owner_id = u.id
                    WHERE (
                        p.owner_id = $1 
                        OR p.mentor_id = $1 
                        OR p.id IN (SELECT project_id FROM project_members WHERE user_id = $1)
                    )
                    AND (p.status != 'Archived' OR p.status IS NULL)
                    ORDER BY p.created_at DESC;
                `;
                queryParams = [userId];
            }

            const { rows: projects } = await pool.query(projectsQuery, queryParams);
            const projectIds = projects.map((p) => p.id);

            let totalTasks = 0;
            let todoTasks = 0;
            let inProgressTasks = 0;
            let reviewTasks = 0;
            let completedTasks = 0;
            let myTasks = 0;
            let highPriorityTasks = 0;
            let recentTasks = [];
            let upcomingTasks = [];

            if (projectIds.length > 0) {
                const [statsRes, recentRes, upcomingRes] = await Promise.all([
                    pool.query(`
                        SELECT
                            COUNT(*) AS total_tasks,
                            COUNT(*) FILTER (WHERE status = 'Todo') AS todo_tasks,
                            COUNT(*) FILTER (WHERE status = 'In Progress') AS in_progress_tasks,
                            COUNT(*) FILTER (WHERE status = 'In Review') AS review_tasks,
                            COUNT(*) FILTER (WHERE status = 'Completed') AS completed_tasks,
                            COUNT(*) FILTER (WHERE assigned_to = $2) AS my_tasks,
                            COUNT(*) FILTER (WHERE priority = 'High' AND status != 'Completed') AS high_priority_tasks
                        FROM tasks
                        WHERE project_id = ANY($1);
                    `, [projectIds, userId]),
                    pool.query(`
                        SELECT t.*, p.title as project_title,
                               u_assignee.name as assignee_name, u_assignee.email as assignee_email
                        FROM tasks t
                        LEFT JOIN projects p ON t.project_id = p.id
                        LEFT JOIN users u_assignee ON t.assigned_to = u_assignee.id
                        WHERE t.project_id = ANY($1)
                        ORDER BY t.created_at DESC
                        LIMIT 5;
                    `, [projectIds]),
                    pool.query(`
                        SELECT t.*, p.title as project_title,
                               u_assignee.name as assignee_name, u_assignee.email as assignee_email
                        FROM tasks t
                        LEFT JOIN projects p ON t.project_id = p.id
                        LEFT JOIN users u_assignee ON t.assigned_to = u_assignee.id
                        WHERE t.project_id = ANY($1)
                          AND t.due_date >= NOW()
                          AND t.status != 'Completed'
                        ORDER BY t.due_date ASC
                        LIMIT 5;
                    `, [projectIds]),
                ]);

                const row = statsRes.rows[0];
                totalTasks = Number(row.total_tasks || 0);
                todoTasks = Number(row.todo_tasks || 0);
                inProgressTasks = Number(row.in_progress_tasks || 0);
                reviewTasks = Number(row.review_tasks || 0);
                completedTasks = Number(row.completed_tasks || 0);
                myTasks = Number(row.my_tasks || 0);
                highPriorityTasks = Number(row.high_priority_tasks || 0);

                recentTasks = recentRes.rows.map(formatTask);
                upcomingTasks = upcomingRes.rows.map(formatTask);
            }

            const formattedProjects = projects.map((p) => formatProject(p));

            return {
                stats: {
                    totalProjects: formattedProjects.length,
                    totalTasks,
                    todoTasks,
                    inProgressTasks,
                    reviewTasks,
                    completedTasks,
                    myTasks,
                    highPriorityTasks,
                },
                projects: formattedProjects,
                recentTasks,
                upcomingTasks,
            };
        });

        return res.status(200).json({
            success: true,
            dashboard: dashboardData,
            stats: dashboardData.stats,
        });
    } catch (error) {
        console.error("Dashboard Error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load dashboard",
        });
    }
};
