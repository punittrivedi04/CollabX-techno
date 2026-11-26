import pool from "../config/db.js";
import { isDirector } from "../middleware/directorGuard.js";
import { parsePositiveInt } from "../utils/formatters.js";
import { readCache, projectAccessCache, invalidateAllCaches } from "../utils/microCache.js";

const MAX_MESSAGE_LEN = 2000;

const normalizeChannel = (ch) => {
    const s = String(ch || "").trim().toLowerCase();
    return s === "unofficial" ? "unofficial" : "official";
};

// 1. GET CHAT MESSAGES
export const getChatMessages = async (req, res, next) => {
    try {
        if (isDirector(req.user)) {
            return res.status(403).json({
                success: false,
                message: "Director account does not have access to project chat channels",
            });
        }

        const projectId = parsePositiveInt(req.params.projectId);
        const channel = normalizeChannel(req.query.channel || req.body?.channel);
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";
        const isMentorRole = role === "mentor" || role === "faculty";

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID is required",
            });
        }

        // Strict access check for unofficial channel:
        // Mentors, Admins, and Directors CANNOT access unofficial channel
        if (channel === "unofficial") {
            if (isAdmin || isMentorRole || isDirector(req.user)) {
                return res.status(403).json({
                    success: false,
                    message: "Unofficial chat is strictly private to student team members",
                });
            }
        }

        // Check project access (cached via bounded 3s micro cache, auto-invalidated on writes)
        const project = await projectAccessCache.getOrSet(`proj:${projectId}`, async () => {
            const projRes = await pool.query(
                "SELECT id, owner_id, mentor_id, status FROM projects WHERE id = $1",
                [projectId]
            );
            return projRes.rows[0] || null;
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const isOwner = Number(project.owner_id) === Number(userId);
        const isAssignedMentor = Number(project.mentor_id) === Number(userId);

        const checkIsMember = () =>
            projectAccessCache.getOrSet(`pm:${projectId}:${userId}`, async () => {
                const memberCheck = await pool.query(
                    "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
                    [projectId, userId]
                );
                return memberCheck.rows.length > 0;
            });

        if (channel === "unofficial") {
            if (!isOwner && !(await checkIsMember())) {
                return res.status(403).json({
                    success: false,
                    message: "You do not have access to this project chat",
                });
            }
        } else {
            if (!isAdmin && !isOwner && !isAssignedMentor && !(await checkIsMember())) {
                return res.status(403).json({
                    success: false,
                    message: "You do not have access to this project chat",
                });
            }
        }

        if (!isAdmin && project.status === "Archived") {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const chatCacheKey = `chat:u:${userId}:r:${role}:p:${projectId}:c:${channel}`;
        const formatted = await readCache.getOrSet(chatCacheKey, async () => {
            const { rows: messages } = await pool.query(`
                SELECT m.id, m.project_id, m.sender_id, m.channel, m.content, m.created_at,
                       u.name as sender_name, u.email as sender_email, u.role as sender_role
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.project_id = $1 AND (m.channel = $2 OR (m.channel IS NULL AND $2 = 'official'))
                ORDER BY m.created_at ASC
                LIMIT 200;
            `, [projectId, channel]);

            return messages.map((m) => ({
                id: m.id,
                _id: m.id,
                project: m.project_id,
                projectId: m.project_id,
                channel: m.channel || "official",
                sender: {
                    id: m.sender_id,
                    _id: m.sender_id,
                    name: m.sender_name,
                    email: m.sender_email,
                    role: m.sender_role,
                },
                content: m.content,
                message: m.content,
                createdAt: m.created_at,
            }));
        });

        return res.status(200).json({
            success: true,
            channel,
            count: formatted.length,
            messages: formatted,
            data: formatted,
        });
    } catch (error) {
        next(error);
    }
};

// 2. SEND CHAT MESSAGE
export const sendChatMessage = async (req, res, next) => {
    try {
        if (isDirector(req.user)) {
            return res.status(403).json({
                success: false,
                message: "Director account does not have access to project chat channels",
            });
        }

        const projectId = parsePositiveInt(req.params.projectId);
        const channel = normalizeChannel(req.body?.channel || req.query?.channel);
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";
        const isMentorRole = role === "mentor" || role === "faculty";
        const { content, message } = req.body || {};
        const rawText = typeof content === "string" ? content : typeof message === "string" ? message : "";
        const textContent = rawText.trim();

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID is required",
            });
        }

        if (!textContent) {
            return res.status(400).json({
                success: false,
                message: "Message content cannot be empty",
            });
        }

        if (textContent.length > MAX_MESSAGE_LEN) {
            return res.status(400).json({
                success: false,
                message: `Message cannot exceed ${MAX_MESSAGE_LEN} characters`,
            });
        }

        // Strict role check for unofficial channel
        if (channel === "unofficial") {
            if (isAdmin || isMentorRole || isDirector(req.user)) {
                return res.status(403).json({
                    success: false,
                    message: "Unofficial chat is strictly private to student team members",
                });
            }
        }

        // Check project access
        const projRes = await pool.query(
            "SELECT id, owner_id, mentor_id, status FROM projects WHERE id = $1",
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
        const isAssignedMentor = Number(project.mentor_id) === Number(userId);

        if (channel === "unofficial") {
            if (!isOwner) {
                const memberCheck = await pool.query(
                    "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
                    [projectId, userId]
                );
                if (memberCheck.rows.length === 0) {
                    return res.status(403).json({
                        success: false,
                        message: "You do not have access to send messages in this project",
                    });
                }
            }
        } else {
            if (!isAdmin && !isOwner && !isAssignedMentor) {
                const memberCheck = await pool.query(
                    "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
                    [projectId, userId]
                );
                if (memberCheck.rows.length === 0) {
                    return res.status(403).json({
                        success: false,
                        message: "You do not have access to send messages in this project",
                    });
                }
            }
        }

        if (!isAdmin && project.status === "Archived") {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const insertRes = await pool.query(`
            INSERT INTO messages (project_id, sender_id, channel, content, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id, project_id, sender_id, channel, content, created_at;
        `, [projectId, userId, channel, textContent]);

        const inserted = insertRes.rows[0];
        invalidateAllCaches();

        const formatted = {
            id: inserted.id,
            _id: inserted.id,
            project: inserted.project_id,
            projectId: inserted.project_id,
            channel: inserted.channel,
            sender: {
                id: req.user.id,
                _id: req.user.id,
                name: req.user.name,
                email: req.user.email,
                role: req.user.role,
            },
            content: inserted.content,
            message: inserted.content,
            createdAt: inserted.created_at,
        };

        // Broadcast strictly to project_${projectId}_${channel}
        const io = req.app.get("io");
        if (io) {
            const roomName = `project_${projectId}_${channel}`;
            io.to(roomName).emit("chat:message:new", formatted);
            io.to(roomName).emit("chat_message_received", {
                message: formatted,
            });
        }

        return res.status(201).json({
            success: true,
            message: "Message sent",
            data: formatted,
            messageData: formatted,
        });
    } catch (error) {
        next(error);
    }
};

// 3. EDIT CHAT MESSAGE (Strict Sender Ownership)
export const editChatMessage = async (req, res, next) => {
    try {
        if (isDirector(req.user)) {
            return res.status(403).json({
                success: false,
                message: "Director account does not have access to project chat channels",
            });
        }

        const projectId = parsePositiveInt(req.params.projectId);
        const messageId = parsePositiveInt(req.params.messageId || req.params.id);
        const userId = req.user.id;
        const { content, message } = req.body || {};
        const rawText = typeof content === "string" ? content : typeof message === "string" ? message : "";
        const textContent = rawText.trim();

        if (!projectId || !messageId || !textContent) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID, message ID, and content are required",
            });
        }

        if (textContent.length > MAX_MESSAGE_LEN) {
            return res.status(400).json({
                success: false,
                message: `Message cannot exceed ${MAX_MESSAGE_LEN} characters`,
            });
        }

        const { rows } = await pool.query(
            "SELECT id, project_id, channel, sender_id FROM messages WHERE id = $1 AND project_id = $2",
            [messageId, projectId]
        );
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Message not found",
            });
        }

        const existingMsg = rows[0];

        // Strict Sender Ownership Check: ONLY the original author can edit
        if (String(existingMsg.sender_id) !== String(userId)) {
            return res.status(403).json({
                success: false,
                message: "You can only edit your own messages",
            });
        }

        const updateRes = await pool.query(`
            UPDATE messages
            SET content = $1
            WHERE id = $2 AND sender_id = $3
            RETURNING *;
        `, [textContent, messageId, Number(userId)]);

        const updated = updateRes.rows[0];
        invalidateAllCaches();

        const senderRes = await pool.query(
            "SELECT id, name, email, role FROM users WHERE id = $1",
            [updated.sender_id]
        );
        const sender = senderRes.rows[0] || req.user;

        const formatted = {
            id: updated.id,
            _id: updated.id,
            project: updated.project_id,
            projectId: updated.project_id,
            channel: updated.channel || "official",
            sender: {
                id: sender.id,
                _id: sender.id,
                name: sender.name,
                email: sender.email,
                role: sender.role,
            },
            content: updated.content,
            message: updated.content,
            createdAt: updated.created_at,
        };

        const io = req.app.get("io");
        if (io) {
            const roomName = `project_${updated.project_id}_${updated.channel || "official"}`;
            io.to(roomName).emit("chat:message:updated", formatted);
        }

        return res.status(200).json({
            success: true,
            message: "Message updated",
            data: formatted,
        });
    } catch (error) {
        next(error);
    }
};

// 4. DELETE CHAT MESSAGE ("Delete for Everyone" - Strict Sender Ownership)
export const deleteChatMessage = async (req, res, next) => {
    try {
        if (isDirector(req.user)) {
            return res.status(403).json({
                success: false,
                message: "Director account does not have access to project chat channels",
            });
        }

        const projectId = parsePositiveInt(req.params.projectId);
        const messageId = parsePositiveInt(req.params.messageId || req.params.id);
        const userId = req.user.id;

        if (!projectId || !messageId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID and message ID are required",
            });
        }

        const { rows } = await pool.query(
            "SELECT id, project_id, channel, sender_id FROM messages WHERE id = $1 AND project_id = $2",
            [messageId, projectId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Message not found",
            });
        }

        const existingMsg = rows[0];

        // Strict Sender Ownership Check: ONLY the original sender can delete (no admin/mentor/owner bypass)
        if (String(existingMsg.sender_id) !== String(userId)) {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own messages",
            });
        }

        await pool.query(
            "DELETE FROM messages WHERE id = $1 AND sender_id = $2",
            [messageId, Number(userId)]
        );
        invalidateAllCaches();

        const channel = existingMsg.channel || "official";
        const io = req.app.get("io");
        if (io) {
            const roomName = `project_${existingMsg.project_id}_${channel}`;
            const payload = {
                messageId,
                id: messageId,
                _id: messageId,
                project: existingMsg.project_id,
                projectId: existingMsg.project_id,
                channel,
            };
            io.to(roomName).emit("chat:message:deleted", payload);
            io.to(roomName).emit("message_deleted", payload);
        }

        return res.status(200).json({
            success: true,
            message: "Message deleted successfully",
            data: {
                id: messageId,
                _id: messageId,
                messageId,
                projectId: existingMsg.project_id,
                channel,
            },
        });
    } catch (error) {
        next(error);
    }
};
