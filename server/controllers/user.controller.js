import pool from "../config/db.js";
import { safeUser, escapeLikePattern, pickAllowedFields } from "../utils/formatters.js";
import { invalidateUserCache } from "../utils/microCache.js";
import { isDirector } from "../middleware/directorGuard.js";

// GET USER PROFILE & ROLE-SCOPED WORKSPACE OVERVIEW METRICS
export const getUserProfile = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const { rows } = await pool.query(
            "SELECT id, name, email, roll_no, role, is_verified, is_active, created_at FROM users WHERE id = $1",
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const profileUser = rows[0];
        const role = String(profileUser.role || "student").toLowerCase().trim();
        const hasOversight =
            role === "director" ||
            isDirector(profileUser) ||
            role === "admin" ||
            role === "coordinator";

        const scopeWhere = hasOversight
            ? "1 = 1"
            : `(
                p.owner_id = $1
                OR p.mentor_id = $1
                OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1)
               ) AND (p.status != 'Archived' OR p.status IS NULL)`;
        const scopeParams = hasOversight ? [] : [userId];

        const [projectSummaryRes, taskSummaryRes] = await Promise.all([
            pool.query(
                `SELECT
                    COUNT(*)::int AS total_projects,
                    COUNT(*) FILTER (
                        WHERE LOWER(TRIM(COALESCE(p.status, ''))) IN ('completed', 'done')
                          AND (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) >= 1
                          AND (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND LOWER(TRIM(COALESCE(t.status, ''))) NOT IN ('completed', 'done')) = 0
                    )::int AS completed_projects
                 FROM projects p
                 WHERE ${scopeWhere};`,
                scopeParams
            ),
            pool.query(
                `SELECT
                    COUNT(*)::int AS total_tasks,
                    COUNT(*) FILTER (
                        WHERE LOWER(TRIM(COALESCE(t.status, ''))) IN ('completed', 'done')
                    )::int AS completed_tasks
                 FROM tasks t
                 INNER JOIN projects p ON p.id = t.project_id
                 WHERE ${scopeWhere};`,
                scopeParams
            ),
        ]);

        const totalProjects = Number(projectSummaryRes.rows[0]?.total_projects || 0);
        const completedProjects = Number(projectSummaryRes.rows[0]?.completed_projects || 0);
        const activeProjects = Math.max(0, totalProjects - completedProjects);

        const totalTasks = Number(taskSummaryRes.rows[0]?.total_tasks || 0);
        const completedTasks = Number(taskSummaryRes.rows[0]?.completed_tasks || 0);
        const activeTasks = Math.max(0, totalTasks - completedTasks);
        const rawRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const taskCompletionPercent = Math.min(100, Math.max(0, Number.isFinite(rawRate) ? rawRate : 0));

        const workspaceSummary = {
            totalProjects,
            completedProjects,
            activeProjects,
            totalTasks,
            completedTasks,
            activeTasks,
            taskCompletionPercent,
            completionPercentage: taskCompletionPercent,
            taskCompletionRate: taskCompletionPercent,
        };

        return res.status(200).json({
            success: true,
            user: safeUser(profileUser),
            data: safeUser(profileUser),
            workspaceSummary,
        });
    } catch (error) {
        next(error);
    }
};

// UPDATE USER PROFILE
export const updateUserProfile = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        // Strict field allowlist: ignore any injected role, is_verified, is_active, email, password_hash, etc.
        const { name, roll_no } = pickAllowedFields(req.body, ["name", "roll_no"]);

        const { rows: currentRows } = await pool.query(
            "SELECT id, name, email, roll_no, role, is_verified, is_active, created_at FROM users WHERE id = $1",
            [userId]
        );

        if (currentRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const current = currentRows[0];

        let newName = current.name;
        if (name !== undefined) {
            if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Name must contain 2 to 100 characters",
                });
            }
            newName = name.trim();
        }

        const userRole = String(current.role || "").toLowerCase().trim();
        const isStudentOrMentor = userRole === "student" || userRole === "mentor" || userRole === "faculty";
        const isMentorUser = userRole === "mentor" || userRole === "faculty";

        let newRollNo = current.roll_no;
        if (roll_no !== undefined && isStudentOrMentor) {
            if (roll_no === null || roll_no === "") {
                newRollNo = null;
            } else {
                const cleanRoll = String(roll_no).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
                if (cleanRoll) {
                    if (!/^[A-Z0-9]+$/.test(cleanRoll)) {
                        return res.status(400).json({
                            success: false,
                            message: isMentorUser
                                ? "Enrollment number must be alphanumeric (uppercase letters and numbers only)"
                                : "Roll number must be alphanumeric (uppercase letters and numbers only)",
                        });
                    }
                    if (cleanRoll.length < 3 || cleanRoll.length > 50) {
                        return res.status(400).json({
                            success: false,
                            message: isMentorUser
                                ? "Enrollment number must be 3 to 50 alphanumeric characters"
                                : "Roll number must be 3 to 50 alphanumeric characters",
                        });
                    }
                    const rollCheck = await pool.query(
                        `SELECT id FROM users
                         WHERE UPPER(roll_no) = UPPER($1)
                           AND id != $2
                           AND (is_verified = TRUE OR is_active = TRUE)
                         LIMIT 1;`,
                        [cleanRoll, userId]
                    );
                    if (rollCheck.rows.length > 0) {
                        return res.status(409).json({
                            success: false,
                            code: "ROLL_NO_EXISTS",
                            message: "This Roll Number / Enrollment ID is already registered to another account.",
                        });
                    }
                    newRollNo = cleanRoll;
                } else {
                    newRollNo = null;
                }
            }
        }

        const updateRes = await pool.query(`
            UPDATE users
            SET name = $1,
                roll_no = $2
            WHERE id = $3
            RETURNING id, name, email, roll_no, role, is_verified, is_active, created_at;
        `, [newName, newRollNo, userId]);

        const updated = updateRes.rows[0];
        invalidateUserCache();

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: safeUser(updated),
            data: safeUser(updated),
        });
    } catch (error) {
        next(error);
    }
};

// GET ALL USERS (for team member & mentor selection)
export const getUsers = async (req, res, next) => {
    try {
        const { search, role } = req.query;
        const conditions = [
            "is_active = TRUE",
            "COALESCE(is_verified, TRUE) = TRUE",
            "LOWER(COALESCE(role, '')) != 'director'",
        ];
        const params = [];

        if (typeof role === "string" && role.trim()) {
            const normalizedRole = role.trim().toLowerCase();
            if (normalizedRole === "mentor" || normalizedRole === "faculty") {
                conditions.push("LOWER(COALESCE(role, '')) IN ('mentor', 'faculty')");
            } else if (normalizedRole === "student") {
                conditions.push("LOWER(COALESCE(role, 'student')) = 'student'");
            }
        }

        if (typeof search === "string" && search.trim()) {
            const safeSearch = escapeLikePattern(search.trim().slice(0, 100));
            params.push(`%${safeSearch}%`);
            const idx = params.length;
            conditions.push(`(name ILIKE $${idx} ESCAPE '\\' OR email ILIKE $${idx} ESCAPE '\\' OR COALESCE(roll_no, '') ILIKE $${idx} ESCAPE '\\')`);
        }

        const query = `SELECT id, name, email, roll_no, role FROM users WHERE ${conditions.join(" AND ")} ORDER BY name ASC LIMIT 250;`;

        const { rows } = await pool.query(query, params);
        const formatted = rows.map((u) => ({
            id: u.id,
            _id: u.id,
            name: u.name,
            email: u.email,
            roll_no: u.roll_no || "",
            role: u.role || "student",
        }));

        return res.status(200).json({
            success: true,
            count: formatted.length,
            users: formatted,
            data: formatted,
        });
    } catch (error) {
        next(error);
    }
};
