import pool from "../config/db.js";
import logActivity from "./activityLogger.js";
import { invalidateAllCaches, invalidateUserCache } from "./microCache.js";
import { parsePositiveInt } from "./formatters.js";

/**
 * Shared, transactional project deletion routine.
 * Enforces atomic cleanup across both Student/Team Leader and Admin flows.
 * Guaranteed to remove all dependent records (tasks, project_members, invitations,
 * messages, stars, announcements, and activities) without leaving orphaned rows.
 *
 * @param {Object} options
 * @param {number|string} options.projectId - The ID of the project to delete
 * @param {Object} options.user - The requesting authenticated user (req.user)
 * @param {Object} [options.io] - Socket.IO server instance for real-time room eviction
 * @param {boolean} [options.bypassOwnerCheck=false] - If caller has already verified admin rights
 * @returns {Promise<{success: boolean, project?: Object, status: number, message: string}>}
 */
export const purgeProjectAndDependents = async ({
    projectId,
    user,
    io = null,
    bypassOwnerCheck = false,
}) => {
    const parsedId = parsePositiveInt(projectId);
    if (!parsedId) {
        return {
            success: false,
            status: 400,
            message: "Valid project ID is required",
        };
    }

    if (!user || !user.id) {
        return {
            success: false,
            status: 401,
            message: "Authentication required",
        };
    }

    const client = await pool.connect();
    let inTransaction = false;

    try {
        await client.query("BEGIN;");
        inTransaction = true;

        // 1. Fetch project with row-level lock
        const { rows: projRows } = await client.query(
            "SELECT id, title, description, owner_id, mentor_id FROM projects WHERE id = $1 FOR UPDATE;",
            [parsedId]
        );

        if (projRows.length === 0) {
            await client.query("ROLLBACK;");
            inTransaction = false;
            return {
                success: false,
                status: 404,
                message: "Project not found",
            };
        }

        const project = projRows[0];
        const userId = Number(user.id);
        const role = String(user.role || "").toLowerCase().trim();
        const isAdmin = role === "admin" || role === "coordinator";
        const isOwner = Number(project.owner_id) === userId;

        let isLeader = isOwner;
        if (!isLeader && !isAdmin) {
            const leaderCheck = await client.query(
                "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2 AND LOWER(role) = 'leader';",
                [parsedId, userId]
            );
            isLeader = leaderCheck.rows.length > 0;
        }

        // 2. Authorization check
        if (!bypassOwnerCheck && !isAdmin && !isLeader) {
            await client.query("ROLLBACK;");
            inTransaction = false;
            return {
                success: false,
                status: 403,
                message: "Only the project leader/owner or an administrator can delete this project",
            };
        }

        // 3. Collect all related user IDs (owner, mentor, squad members) for real-time socket events
        const { rows: memberRows } = await client.query(`
            SELECT DISTINCT uid FROM (
                SELECT owner_id AS uid FROM projects WHERE id = $1 AND owner_id IS NOT NULL
                UNION
                SELECT mentor_id AS uid FROM projects WHERE id = $1 AND mentor_id IS NOT NULL
                UNION
                SELECT user_id AS uid FROM project_members WHERE project_id = $1
            ) t WHERE uid IS NOT NULL;
        `, [parsedId]);

        const affectedUserIds = memberRows.map((r) => Number(r.uid)).filter(Boolean);

        // 4. Cleanly delete all dependent/child records in explicit dependency order
        // This guarantees zero foreign-key constraint violations and zero orphaned records,
        // even if database constraints were established without ON DELETE CASCADE.

        // a. Project stars (Leaderboard voting)
        await client.query("DELETE FROM project_stars WHERE project_id = $1;", [parsedId]);

        // b. Project-scoped announcements
        await client.query("DELETE FROM announcements WHERE project_id = $1;", [parsedId]);

        // c. Pending and accepted squad invitations
        await client.query("DELETE FROM invitations WHERE project_id = $1;", [parsedId]);

        // d. Real-time chat messages (official and unofficial channels)
        await client.query("DELETE FROM messages WHERE project_id = $1;", [parsedId]);

        // e. Tasks assigned to or created for this project
        await client.query("DELETE FROM tasks WHERE project_id = $1;", [parsedId]);

        // f. Project squad memberships
        await client.query("DELETE FROM project_members WHERE project_id = $1;", [parsedId]);

        // g. Audit logs & activities directly referencing this project
        await client.query("DELETE FROM activities WHERE project_id = $1;", [parsedId]);

        // h. Finally, delete the project record itself
        await client.query("DELETE FROM projects WHERE id = $1;", [parsedId]);

        // 5. Log audit activity (with projectId: null to prevent foreign key issues)
        await logActivity({
            projectId: null,
            userId,
            action: isAdmin ? "ADMIN_PROJECT_DELETED" : "PROJECT_DELETED",
            description: `${isAdmin ? "Administrator" : "Team Leader"} ${user.name} deleted project "${project.title}" (ID: ${parsedId}) and all associated tasks, squad memberships, and invitations`,
            entityType: "Project",
            entityId: parsedId,
            metadata: {
                deletedByAdmin: isAdmin,
                deletedByUserId: userId,
                deletedByUserName: user.name,
                projectTitle: project.title,
                affectedMembersCount: affectedUserIds.length,
            },
            client,
        });

        await client.query("COMMIT;");
        inTransaction = false;

        // 6. Micro-cache invalidation across all layers
        invalidateAllCaches();
        invalidateUserCache();

        // 7. Real-time Socket.IO room eviction & client notifications
        if (io) {
            try {
                const officialRoom = `project_${parsedId}_official`;
                const unofficialRoom = `project_${parsedId}_unofficial`;

                io.to(officialRoom).emit("project:deleted", {
                    projectId: parsedId,
                    projectTitle: project.title,
                    deletedBy: user.name,
                });
                io.to(unofficialRoom).emit("project:deleted", {
                    projectId: parsedId,
                    projectTitle: project.title,
                    deletedBy: user.name,
                });

                // Evict connected sockets from project channels
                io.in(officialRoom).socketsLeave([officialRoom, unofficialRoom]);
                io.in(unofficialRoom).socketsLeave([officialRoom, unofficialRoom]);

                // Notify all affected team members to refresh their projects and teams
                for (const uid of affectedUserIds) {
                    io.to(`user:${uid}`).emit("collabx_projects_updated", {
                        action: "delete",
                        projectId: parsedId,
                    });
                    io.to(`user:${uid}`).emit("collabx_team_updated", {
                        action: "delete",
                        projectId: parsedId,
                    });
                }
            } catch (socketErr) {
                console.warn("[Project Deletion Socket Eviction Notice]", socketErr.message);
            }
        }

        return {
            success: true,
            status: 200,
            message: "Project and all associated records deleted successfully",
            project,
        };
    } catch (error) {
        if (inTransaction) {
            try {
                await client.query("ROLLBACK;");
            } catch (rbErr) {
                console.warn("[Project Deletion Rollback Notice]", rbErr.message);
            }
        }
        throw error;
    } finally {
        client.release();
    }
};

export default purgeProjectAndDependents;
