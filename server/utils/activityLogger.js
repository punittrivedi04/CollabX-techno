import pool from "../config/db.js";

const logActivity = async ({
    project = null,
    projectId = null,
    user,
    userId,
    action,
    description,
    entityType,
    entityId = null,
    metadata = {},
    client = null,
}) => {
    try {
        const rawProjectId = projectId ?? project;
        const pId = rawProjectId !== null && rawProjectId !== undefined && rawProjectId !== "" ? Number(rawProjectId) : null;
        const uId = Number(userId || user);
        if (!uId || Number.isNaN(uId)) return null;

        const executor = client || pool;
        const { rows } = await executor.query(`
            INSERT INTO activities (project_id, user_id, action, description, entity_type, entity_id, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING *;
        `, [
            pId && !Number.isNaN(pId) ? pId : null,
            uId,
            action,
            description,
            entityType || (pId ? "Project" : "System"),
            entityId !== null && entityId !== undefined && !Number.isNaN(Number(entityId)) ? Number(entityId) : null,
            JSON.stringify(metadata || {}),
        ]);
        return rows[0];
    } catch (error) {
        console.error("Activity Logger Error:", error.message);
        return null;
    }
};

export default logActivity;
