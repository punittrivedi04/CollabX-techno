import pool from "../config/db.js";
import { parsePositiveInt } from "../utils/formatters.js";
import { isDirector } from "../middleware/directorGuard.js";

// GET PROJECT ACTIVITIES
export const getProjectActivities = async (req, res) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator" || isDirector(req.user);

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID is required",
            });
        }

        // Verify project exists
        const projRes = await pool.query(
            "SELECT id, owner_id, mentor_id FROM projects WHERE id = $1",
            [projectId]
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

        // Verify user access
        if (!isAdmin && !isOwner && !isMentor) {
            const memberCheck = await pool.query(
                "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
                [projectId, userId]
            );
            if (memberCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "You do not have access to this project",
                });
            }
        }

        // Pagination (strictly bounded to prevent PostgreSQL integer overflow / huge OFFSET DoS)
        const page = Math.min(1000, Math.max(1, parseInt(req.query.page, 10) || 1));
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;

        const countRes = await pool.query(
            "SELECT COUNT(*) AS total FROM activities WHERE project_id = $1",
            [projectId]
        );
        const total = Number(countRes.rows[0]?.total || 0);

        const { rows: activities } = await pool.query(`
            SELECT a.*, u.name as user_name, u.email as user_email
            FROM activities a
            JOIN users u ON a.user_id = u.id
            WHERE a.project_id = $1
            ORDER BY a.created_at DESC
            LIMIT $2 OFFSET $3;
        `, [projectId, limit, offset]);

        const formatted = activities.map((a) => ({
            id: a.id,
            _id: a.id,
            project: a.project_id,
            projectId: a.project_id,
            user: {
                id: a.user_id,
                _id: a.user_id,
                name: a.user_name,
                email: a.user_email,
            },
            action: a.action,
            description: a.description,
            entityType: a.entity_type,
            entityId: a.entity_id,
            metadata: a.metadata,
            createdAt: a.created_at,
        }));

        return res.status(200).json({
            success: true,
            activities: formatted,
            data: formatted,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPreviousPage: page > 1,
            },
        });
    } catch (error) {
        console.error("Activity Controller Error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch project activities",
        });
    }
};
