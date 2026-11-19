import pool from "../config/db.js";
import { formatTask, parsePositiveInt, pickAllowedFields } from "../utils/formatters.js";
import { readCache, invalidateAllCaches } from "../utils/microCache.js";

const VALID_STATUSES = ["Todo", "In Progress", "In Review", "Completed"];
const VALID_PRIORITIES = ["Low", "Medium", "High"];
const MAX_TITLE_LEN = 150;
const MAX_DESC_LEN = 2000;

const hasTaskAccess = async (task, user) => {
    const userId = Number(user.id);
    const role = String(user.role || "").toLowerCase();
    const isAdmin = role === "admin" || role === "coordinator";
    if (isAdmin) return true;
    if (
        Number(task.assigned_to) === userId ||
        Number(task.created_by) === userId ||
        Number(task.project_owner_id) === userId ||
        Number(task.project_mentor_id) === userId
    ) {
        return true;
    }
    const memberCheck = await pool.query(
        "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
        [task.project_id, userId]
    );
    return memberCheck.rows.length > 0;
};

const normalizeStatus = (status) => {
    if (!status) return "Todo";
    const s = String(status).trim().toLowerCase();
    if (s === "todo" || s === "to do") return "Todo";
    if (s === "in_progress" || s === "in progress") return "In Progress";
    if (s === "in_review" || s === "in review") return "In Review";
    if (s === "completed" || s === "done") return "Completed";
    return VALID_STATUSES.includes(status) ? status : "Todo";
};

const normalizePriority = (priority) => {
    if (!priority) return "Medium";
    const p = String(priority).trim().toLowerCase();
    if (p === "low") return "Low";
    if (p === "medium") return "Medium";
    if (p === "high") return "High";
    return VALID_PRIORITIES.includes(priority) ? priority : "Medium";
};

// 1. CREATE TASK
export const createTask = async (req, res, next) => {
    try {
        // Strict field allowlist: ignores injected created_by, owner_id, role, id, etc.
        const {
            title,
            description,
            projectId,
            assignedTo,
            status,
            priority,
            dueDate,
        } = pickAllowedFields(req.body, [
            "title",
            "description",
            "projectId",
            "assignedTo",
            "status",
            "priority",
            "dueDate",
        ]);

        if (!title || typeof title !== "string" || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: "Task title is required",
            });
        }

        if (title.trim().length > MAX_TITLE_LEN) {
            return res.status(400).json({
                success: false,
                message: `Task title cannot exceed ${MAX_TITLE_LEN} characters`,
            });
        }

        let cleanDescription = "";
        if (description !== undefined && description !== null) {
            if (typeof description !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "Task description must be a string",
                });
            }
            cleanDescription = description.trim();
            if (cleanDescription.length > MAX_DESC_LEN) {
                return res.status(400).json({
                    success: false,
                    message: `Task description cannot exceed ${MAX_DESC_LEN} characters`,
                });
            }
        }

        const projId = parsePositiveInt(projectId);
        if (!projId) {
            return res.status(400).json({
                success: false,
                message: "Valid projectId is required",
            });
        }

        let assigneeId = null;
        if (assignedTo !== undefined && assignedTo !== null && assignedTo !== "") {
            assigneeId = parsePositiveInt(assignedTo);
            if (!assigneeId) {
                return res.status(400).json({
                    success: false,
                    message: "Valid assignedTo user ID is required",
                });
            }
        }

        let parsedDueDate = null;
        if (dueDate !== undefined && dueDate !== null && dueDate !== "") {
            const d = new Date(dueDate);
            if (Number.isNaN(d.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid dueDate format",
                });
            }
            parsedDueDate = d;
        }

        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";

        // Check project access
        const projRes = await pool.query(
            "SELECT id, title, owner_id, mentor_id FROM projects WHERE id = $1",
            [projId]
        );
        if (projRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const project = projRes.rows[0];
        const isOwner = Number(project.owner_id) === Number(userId);
        const isMentor = Number(project.mentor_id) === Number(userId);

        if (!isAdmin && !isOwner && !isMentor) {
            const memberCheck = await pool.query(
                "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
                [projId, userId]
            );
            if (memberCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "You do not have permission to add tasks to this project",
                });
            }
        }

        if (assigneeId) {
            const assigneeCheck = await pool.query(
                "SELECT id FROM users WHERE id = $1 AND is_active = TRUE",
                [assigneeId]
            );
            if (assigneeCheck.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Assigned user does not exist or is inactive",
                });
            }
        }

        const taskStatus = normalizeStatus(status);
        const taskPriority = normalizePriority(priority);
        const completedAt = taskStatus === "Completed" ? new Date() : null;

        const insertRes = await pool.query(`
            INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, created_by, due_date, completed_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING *;
        `, [
            projId,
            title.trim(),
            cleanDescription,
            taskStatus,
            taskPriority,
            assigneeId,
            userId,
            parsedDueDate,
            completedAt,
        ]);

        const task = insertRes.rows[0];
        invalidateAllCaches();

        // Fetch user info for response
        let assigneeObj = null;
        if (assigneeId) {
            const uRes = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [assigneeId]);
            if (uRes.rows.length > 0) {
                assigneeObj = { id: uRes.rows[0].id, _id: uRes.rows[0].id, name: uRes.rows[0].name, email: uRes.rows[0].email };
            }
        }

        return res.status(201).json({
            success: true,
            message: "Task created successfully",
            task: formatTask(task, { id: project.id, _id: project.id, name: project.title, title: project.title }, assigneeObj, {
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

// 2. GET TASKS (Strict Isolation + Bounded 3s Micro Cache)
export const getTasks = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = String(req.user.role || "student").toLowerCase().trim();
        const isAdmin = role === "admin" || role === "coordinator";
        const { projectId, status } = req.query;

        let parsedProjectId = null;
        if (projectId !== undefined && projectId !== "") {
            parsedProjectId = parsePositiveInt(projectId);
            if (!parsedProjectId) {
                return res.status(400).json({
                    success: false,
                    message: "Valid projectId filter is required",
                });
            }
        }

        const normalizedStatus = status ? normalizeStatus(status) : "";
        const cacheKey = `tasks:u:${userId}:r:${role}:p:${parsedProjectId || "all"}:s:${normalizedStatus || "all"}`;

        const formattedTasks = await readCache.getOrSet(cacheKey, async () => {
            let query = `
                SELECT t.*, p.title as project_title,
                       u_assignee.name as assignee_name, u_assignee.email as assignee_email,
                       u_creator.name as creator_name, u_creator.email as creator_email
                FROM tasks t
                LEFT JOIN projects p ON t.project_id = p.id
                LEFT JOIN users u_assignee ON t.assigned_to = u_assignee.id
                LEFT JOIN users u_creator ON t.created_by = u_creator.id
                WHERE (
                    $1::boolean = TRUE OR
                    t.assigned_to = $2 OR
                    t.created_by = $2 OR
                    p.owner_id = $2 OR
                    p.mentor_id = $2 OR
                    p.id IN (SELECT project_id FROM project_members WHERE user_id = $2)
                )
            `;
            const params = [isAdmin, userId];
            let paramIdx = 3;

            if (parsedProjectId) {
                query += ` AND t.project_id = $${paramIdx}`;
                params.push(parsedProjectId);
                paramIdx++;
            }

            if (normalizedStatus) {
                query += ` AND t.status = $${paramIdx}`;
                params.push(normalizedStatus);
                paramIdx++;
            }

            query += " ORDER BY t.created_at DESC;";

            const { rows: tasks } = await pool.query(query, params);
            return tasks.map((t) => formatTask(t));
        });

        return res.status(200).json({
            success: true,
            count: formattedTasks.length,
            tasks: formattedTasks,
            data: formattedTasks,
        });
    } catch (error) {
        next(error);
    }
};

// 3. GET TASK BY ID (Strict Squad/Project Isolation)
export const getTaskById = async (req, res, next) => {
    try {
        const taskId = parsePositiveInt(req.params.id);
        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: "Valid task ID is required",
            });
        }

        const { rows } = await pool.query(`
            SELECT t.*, p.title as project_title, p.owner_id as project_owner_id, p.mentor_id as project_mentor_id,
                   u_assignee.name as assignee_name, u_assignee.email as assignee_email,
                   u_creator.name as creator_name, u_creator.email as creator_email
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u_assignee ON t.assigned_to = u_assignee.id
            LEFT JOIN users u_creator ON t.created_by = u_creator.id
            WHERE t.id = $1;
        `, [taskId]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        const task = rows[0];
        const allowed = await hasTaskAccess(task, req.user);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view this task",
            });
        }

        return res.status(200).json({
            success: true,
            task: formatTask(task),
        });
    } catch (error) {
        next(error);
    }
};

// 4. UPDATE TASK (Strict Squad/Project Authorization - Prevents IDOR)
export const updateTask = async (req, res, next) => {
    try {
        const taskId = parsePositiveInt(req.params.id);
        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: "Valid task ID is required",
            });
        }

        const { rows: taskRows } = await pool.query(`
            SELECT t.*, p.owner_id as project_owner_id, p.mentor_id as project_mentor_id
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.id = $1;
        `, [taskId]);

        if (taskRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        const existingTask = taskRows[0];
        const allowed = await hasTaskAccess(existingTask, req.user);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to update this task",
            });
        }

        // Strict field allowlist: ignores injected created_by, project_id, owner_id, role, id, etc.
        const {
            title,
            description,
            status,
            priority,
            assignedTo,
            dueDate,
        } = pickAllowedFields(req.body, [
            "title",
            "description",
            "status",
            "priority",
            "assignedTo",
            "dueDate",
        ]);

        let newTitle = existingTask.title;
        if (title !== undefined) {
            if (typeof title !== "string" || !title.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Task title cannot be empty",
                });
            }
            if (title.trim().length > MAX_TITLE_LEN) {
                return res.status(400).json({
                    success: false,
                    message: `Task title cannot exceed ${MAX_TITLE_LEN} characters`,
                });
            }
            newTitle = title.trim();
        }

        let newDescription = existingTask.description;
        if (description !== undefined) {
            const cleanDesc = description === null ? "" : String(description).trim();
            if (cleanDesc.length > MAX_DESC_LEN) {
                return res.status(400).json({
                    success: false,
                    message: `Task description cannot exceed ${MAX_DESC_LEN} characters`,
                });
            }
            newDescription = cleanDesc;
        }

        const newStatus = status !== undefined ? normalizeStatus(status) : existingTask.status;
        const newPriority = priority !== undefined ? normalizePriority(priority) : existingTask.priority;

        let newAssignedTo = existingTask.assigned_to;
        if (assignedTo !== undefined) {
            if (assignedTo === null || assignedTo === "") {
                newAssignedTo = null;
            } else {
                const parsedAssignee = parsePositiveInt(assignedTo);
                if (!parsedAssignee) {
                    return res.status(400).json({
                        success: false,
                        message: "Valid assignedTo user ID is required",
                    });
                }
                const assigneeCheck = await pool.query(
                    "SELECT id FROM users WHERE id = $1 AND is_active = TRUE",
                    [parsedAssignee]
                );
                if (assigneeCheck.rows.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Assigned user does not exist or is inactive",
                    });
                }
                newAssignedTo = parsedAssignee;
            }
        }

        let newDueDate = existingTask.due_date;
        if (dueDate !== undefined) {
            if (dueDate === null || dueDate === "") {
                newDueDate = null;
            } else {
                const d = new Date(dueDate);
                if (Number.isNaN(d.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid dueDate format",
                    });
                }
                newDueDate = d;
            }
        }

        const completedAt = newStatus === "Completed" ? (existingTask.completed_at || new Date()) : (newStatus !== "Completed" ? null : existingTask.completed_at);

        const updateRes = await pool.query(`
            UPDATE tasks
            SET title = $1,
                description = $2,
                status = $3,
                priority = $4,
                assigned_to = $5,
                due_date = $6,
                completed_at = $7,
                updated_at = NOW()
            WHERE id = $8
            RETURNING *;
        `, [
            newTitle,
            newDescription,
            newStatus,
            newPriority,
            newAssignedTo,
            newDueDate,
            completedAt,
            taskId,
        ]);

        const updated = updateRes.rows[0];
        invalidateAllCaches();

        // Fetch join info
        const joinRes = await pool.query(`
            SELECT p.title as project_title,
                   u_assignee.name as assignee_name, u_assignee.email as assignee_email
            FROM projects p
            LEFT JOIN users u_assignee ON u_assignee.id = $2
            WHERE p.id = $1;
        `, [updated.project_id, updated.assigned_to]);

        const extra = joinRes.rows[0] || {};
        const populated = { ...updated, ...extra };

        return res.status(200).json({
            success: true,
            message: "Task updated successfully",
            task: formatTask(populated),
        });
    } catch (error) {
        next(error);
    }
};

// 5. DELETE TASK (Strict Squad/Project Authorization - Prevents IDOR)
export const deleteTask = async (req, res, next) => {
    try {
        const taskId = parsePositiveInt(req.params.id);
        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: "Valid task ID is required",
            });
        }

        const { rows } = await pool.query(`
            SELECT t.*, p.owner_id as project_owner_id, p.mentor_id as project_mentor_id
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.id = $1;
        `, [taskId]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        const existingTask = rows[0];
        const allowed = await hasTaskAccess(existingTask, req.user);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to delete this task",
            });
        }

        await pool.query("DELETE FROM tasks WHERE id = $1", [taskId]);
        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: "Task deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};
