import crypto from "crypto";
import pool from "../config/db.js";
import { parsePositiveInt, pickAllowedFields } from "../utils/formatters.js";
import { isDirector } from "../middleware/directorGuard.js";
import { invalidateAllCaches } from "../utils/microCache.js";
import logActivity from "../utils/activityLogger.js";
import { sendInvitationEmail } from "../utils/sendEmail.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_MEMBER_ROLES = new Set(["member"]);
const MENTOR_ROLES = new Set(["mentor", "faculty"]);

const getBaseClientUrl = (req) => {
    const raw = process.env.CLIENT_URL || req?.get("origin") || "http://localhost:5173";
    return String(raw).split(",")[0].trim().replace(/\/+$/, "");
};

const evictUserFromProjectRooms = (req, projectId, targetUserId) => {
    const io = req.app.get("io");
    if (!io || !projectId || !targetUserId) return;
    io.in(`user:${targetUserId}`).socketsLeave([
        `project_${projectId}_official`,
        `project_${projectId}_unofficial`,
    ]);
};

// 1. GET PROJECT TEAM
export const getProjectTeam = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";
        const isDirectorUser = role === "director" || isDirector(req.user);
        const hasOversight = isAdmin || isDirectorUser;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID is required",
            });
        }

        const projRes = await pool.query(`
            SELECT p.*, u.name as owner_name, u.email as owner_email, u.roll_no as owner_roll_no,
                   m.name as mentor_name, m.email as mentor_email
            FROM projects p
            LEFT JOIN users u ON p.owner_id = u.id
            LEFT JOIN users m ON p.mentor_id = m.id
            WHERE p.id = $1;
        `, [projectId]);

        if (projRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const project = projRes.rows[0];

        // Check project access
        const memberCheck = await pool.query(
            "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
            [projectId, userId]
        );
        const isMember = memberCheck.rows.length > 0;
        const isOwner = Number(project.owner_id) === Number(userId);
        const isMentor = Number(project.mentor_id) === Number(userId);

        if (!hasOversight && !isOwner && !isMember && !isMentor) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to view this project team",
            });
        }

        if (!hasOversight && project.status === "Archived") {
            return res.status(404).json({
                success: false,
                message: "Project team not found",
            });
        }

        const membersRes = await pool.query(`
            SELECT pm.role, u.id, u.name, u.email, u.roll_no, u.created_at
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = $1;
        `, [projectId]);

        const rawMembers = membersRes.rows.map((m) => ({
            id: m.id,
            _id: m.id,
            name: m.name,
            email: m.email,
            role: m.role || "member",
            roll_no: m.roll_no || "",
            createdAt: m.created_at,
        }));

        // Zero duplicate owner entries in members
        const cleanMembers = rawMembers.filter((m) => String(m.id) !== String(project.owner_id));

        const ownerObj = project.owner_id ? {
            id: project.owner_id,
            _id: project.owner_id,
            name: project.owner_name || "Lead",
            email: project.owner_email || "",
            roll_no: project.owner_roll_no || "",
            role: "lead",
        } : null;

        const totalTeamSize = cleanMembers.length + (ownerObj ? 1 : 0);

        const invitesRes = await pool.query(`
            SELECT i.*, u.name as sender_name, u.email as sender_email,
                   r.name as recipient_name, r.email as recipient_user_email, r.roll_no as recipient_roll_no
            FROM invitations i
            LEFT JOIN users u ON i.sender_id = u.id
            LEFT JOIN users r ON i.recipient_id = r.id
            WHERE i.project_id = $1 AND i.status IN ('Pending', 'Expired')
            ORDER BY i.created_at DESC;
        `, [projectId]);

        const cleanBaseUrl = getBaseClientUrl(req);

        const canManageInvites = isAdmin || isOwner;

        const formattedInvites = await Promise.all(
            invitesRes.rows.map(async (i) => {
                let token = i.token;
                if (canManageInvites && !token) {
                    token = crypto.randomBytes(32).toString("hex");
                    await pool.query("UPDATE invitations SET token = $1 WHERE id = $2", [token, i.id]).catch(() => {});
                }

                const expiresAt = i.expires_at || new Date(new Date(i.created_at).getTime() + 48 * 60 * 60 * 1000).toISOString();
                const isExpired = i.status === "Expired" || (expiresAt && new Date(expiresAt) <= new Date());
                const effectiveStatus = isExpired ? "Expired" : (i.status || "Pending");

                if (isExpired && i.status === "Pending") {
                    pool.query("UPDATE invitations SET status = 'Expired' WHERE id = $1", [i.id]).catch(() => {});
                }

                const invitationUrl = canManageInvites && token ? `${cleanBaseUrl}/team?invite=${token}` : undefined;

                return {
                    id: i.id,
                    _id: i.id,
                    recipientEmail: i.recipient_email,
                    recipient: {
                        id: i.recipient_id || null,
                        _id: i.recipient_id || null,
                        name: i.recipient_name || i.recipient_email,
                        email: i.recipient_user_email || i.recipient_email,
                        roll_no: i.recipient_roll_no || "",
                    },
                    role: i.role || "member",
                    status: effectiveStatus,
                    isExpired,
                    ...(canManageInvites ? { token, invitationUrl } : {}),
                    expiresAt,
                    sender: {
                        id: i.sender_id,
                        _id: i.sender_id,
                        name: i.sender_name,
                        email: i.sender_email,
                    },
                    createdAt: i.created_at,
                };
            })
        );

        const mentorObj = project.mentor_id
            ? {
                  id: project.mentor_id,
                  _id: project.mentor_id,
                  name: project.mentor_name || "Mentor",
                  email: project.mentor_email || "",
              }
            : null;

        const teamData = {
            project: {
                id: project.id,
                _id: project.id,
                name: project.title,
                title: project.title,
                status: project.status,
                description: project.description || "",
                mentorReview: project.mentor_review || null,
                reviewedAt: project.reviewed_at || null,
                pptUrl: project.ppt_url || "",
                demoUrl: project.demo_url || "",
                githubUrl: project.github_url || "",
            },
            owner: ownerObj,
            mentor: mentorObj,
            members: cleanMembers,
            teamMembers: cleanMembers,
            totalMembers: totalTeamSize,
            memberCount: totalTeamSize,
            mentorReview: project.mentor_review || null,
            reviewedAt: project.reviewed_at || null,
        };

        return res.status(200).json({
            success: true,
            team: teamData,
            ...teamData,
            pendingInvitations: formattedInvites,
            invitations: formattedInvites,
        });
    } catch (error) {
        next(error);
    }
};

// 2. SEND INVITATION (Supports both Student Team Member & Faculty Mentor Invitations)
export const sendInvitation = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";
        const {
            email,
            role: requestedInviteRole,
            mentorId,
            mentor_id,
        } = pickAllowedFields(req.body, ["email", "role", "mentorId", "mentor_id"]);

        const inviteType =
            String(requestedInviteRole || "").trim().toLowerCase() === "mentor" ||
            mentorId !== undefined ||
            mentor_id !== undefined
                ? "mentor"
                : "member";

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID is required",
            });
        }

        const projRes = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
        if (projRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const project = projRes.rows[0];
        let isLeader = Number(project.owner_id) === Number(userId);
        if (!isLeader && !isAdmin) {
            const leaderCheck = await pool.query(
                "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2 AND LOWER(role) = 'leader';",
                [projectId, userId]
            );
            isLeader = leaderCheck.rows.length > 0;
        }

        if (role === "mentor" || role === "faculty" || (!isAdmin && !isLeader)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden. Only the current Team Leader or an Administrator can add or invite squad members.",
            });
        }

        // Branch A: Student-driven Mentor Invitation (mentor must accept before assignment)
        if (inviteType === "mentor") {
            let mentorRow = null;
            const parsedMentorId = parsePositiveInt(mentorId ?? mentor_id);
            if (parsedMentorId) {
                const mRes = await pool.query(
                    "SELECT id, name, email, role, is_active FROM users WHERE id = $1",
                    [parsedMentorId]
                );
                mentorRow = mRes.rows[0] || null;
            } else if (typeof email === "string" && email.trim()) {
                const cleanEmail = email.trim().toLowerCase();
                if (cleanEmail.length > 254 || !EMAIL_PATTERN.test(cleanEmail)) {
                    return res.status(400).json({
                        success: false,
                        message: "Please provide a valid mentor email address",
                    });
                }
                const mRes = await pool.query(
                    "SELECT id, name, email, role, is_active FROM users WHERE LOWER(email) = LOWER($1)",
                    [cleanEmail]
                );
                mentorRow = mRes.rows[0] || null;
            } else {
                return res.status(400).json({
                    success: false,
                    message: "Please select a mentor or provide a mentor email",
                });
            }

            if (
                !mentorRow ||
                !mentorRow.is_active ||
                !MENTOR_ROLES.has(String(mentorRow.role || "").toLowerCase()) ||
                isDirector(mentorRow)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Selected user must be an active registered Faculty Mentor",
                });
            }

            if (Number(project.mentor_id) === Number(mentorRow.id)) {
                return res.status(400).json({
                    success: false,
                    message: `${mentorRow.name} is already the assigned mentor for this project`,
                });
            }

            const pendingMentorCheck = await pool.query(
                `SELECT id FROM invitations
                 WHERE project_id = $1 AND recipient_id = $2 AND role = 'mentor' AND status = 'Pending'`,
                [projectId, mentorRow.id]
            );
            if (pendingMentorCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `A mentor invitation is already pending for ${mentorRow.name}`,
                });
            }

            const token = crypto.randomBytes(32).toString("hex");
            const insertRes = await pool.query(
                `INSERT INTO invitations (project_id, recipient_email, recipient_id, sender_id, role, status, token, expires_at, created_at)
                 VALUES ($1, $2, $3, $4, 'mentor', 'Pending', $5, NOW() + INTERVAL '48 hours', NOW())
                 RETURNING *;`,
                [projectId, mentorRow.email.toLowerCase(), mentorRow.id, userId, token]
            );

            const notifRes = await pool.query(
                `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                 VALUES ($1, 'Mentor Invitation', $2, 'mentor_invitation', FALSE, NOW())
                 RETURNING id, title, message, type, is_read, created_at;`,
                [
                    mentorRow.id,
                    `${req.user.name} invited you to mentor project "${project.title}". Accept or decline from your Mentor Portal within 48 hours.`,
                ]
            );

            const io = req.app.get("io");
            if (io && notifRes.rows[0]) {
                io.to(`user:${mentorRow.id}`).emit("notification:new", {
                    id: notifRes.rows[0].id,
                    _id: notifRes.rows[0].id,
                    title: notifRes.rows[0].title,
                    message: notifRes.rows[0].message,
                    type: notifRes.rows[0].type,
                    project: projectId,
                    isRead: false,
                    createdAt: notifRes.rows[0].created_at,
                });
            }

            await logActivity({
                projectId,
                userId,
                action: "MENTOR_INVITED",
                description: `${req.user.name} sent a mentor invitation to ${mentorRow.name} for "${project.title}" (valid for 48 hours)`,
                entityType: "Invitation",
                entityId: insertRes.rows[0].id,
                metadata: { mentorId: mentorRow.id, mentorName: mentorRow.name },
            });

            invalidateAllCaches();

            const cleanBaseUrl = getBaseClientUrl(req);
            const invitationUrl = `${cleanBaseUrl}/team?invite=${token}`;

            // Non-blocking mentor invitation email delivery
            if (mentorRow?.email) {
                sendInvitationEmail({
                    to: mentorRow.email,
                    inviterName: req.user.name,
                    projectName: project.title,
                    invitationUrl,
                    role: "mentor",
                }).then((mailRes) => {
                    if (!mailRes?.sent) {
                        console.warn("[Mentor Invite Email Failure]", mailRes?.reason);
                    }
                }).catch((mailErr) => {
                    console.warn("[Mentor Invite Email Notice]", mailErr.message);
                });
            }

            return res.status(201).json({
                success: true,
                message: `Mentor invitation sent to ${mentorRow.name}. They will be assigned once they accept (valid for 48 hours).`,
                invitation: {
                    ...insertRes.rows[0],
                    token,
                    invitationUrl,
                    expiresAt: insertRes.rows[0].expires_at,
                    isExpired: false,
                    recipient: { id: mentorRow.id, name: mentorRow.name, email: mentorRow.email },
                },
            });
        }

        // Branch B: Standard Student Team Member Invitation
        if (!email || typeof email !== "string") {
            return res.status(400).json({
                success: false,
                message: "Project ID and valid email are required",
            });
        }

        const cleanEmail = email.trim().toLowerCase();
        if (cleanEmail.length > 254 || !EMAIL_PATTERN.test(cleanEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address",
            });
        }

        // Check if user already exists
        const userRes = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [cleanEmail]);
        const recipientUser = userRes.rows[0];

        if (recipientUser) {
            // Check if already in project
            if (Number(recipientUser.id) === Number(project.owner_id)) {
                return res.status(400).json({
                    success: false,
                    message: "User is already the project owner",
                });
            }

            const memberCheck = await pool.query(
                "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
                [projectId, recipientUser.id]
            );
            if (memberCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "User is already a member of this project",
                });
            }
        }

        // Check existing pending / expired invitation
        const existingCheck = await pool.query(
            "SELECT id, status, expires_at FROM invitations WHERE project_id = $1 AND LOWER(recipient_email) = LOWER($2) AND status IN ('Pending', 'Expired')",
            [projectId, cleanEmail]
        );

        const token = crypto.randomBytes(32).toString("hex");
        let savedInvite = null;

        if (existingCheck.rows.length > 0) {
            const existing = existingCheck.rows[0];
            const isExistingExpired = existing.status === "Expired" || (existing.expires_at && new Date(existing.expires_at) <= new Date());
            if (!isExistingExpired) {
                return res.status(400).json({
                    success: false,
                    message: "An active invitation is already pending for this email address (valid for 48 hours). You can re-send or copy the existing invite link.",
                });
            }

            // Existing invitation has expired -> renew it in place with a fresh token and 48-hour window
            const renewRes = await pool.query(`
                UPDATE invitations
                SET token = $1, status = 'Pending', expires_at = NOW() + INTERVAL '48 hours', created_at = NOW()
                WHERE id = $2
                RETURNING *;
            `, [token, existing.id]);
            savedInvite = renewRes.rows[0];
        } else {
            const insertRes = await pool.query(`
                INSERT INTO invitations (project_id, recipient_email, recipient_id, sender_id, role, status, token, expires_at, created_at)
                VALUES ($1, $2, $3, $4, 'member', 'Pending', $5, NOW() + INTERVAL '48 hours', NOW())
                RETURNING *;
            `, [projectId, cleanEmail, recipientUser ? recipientUser.id : null, userId, token]);
            savedInvite = insertRes.rows[0];
        }

        // If recipient user exists, create notification
        if (recipientUser) {
            await pool.query(`
                INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                VALUES ($1, 'Team Invitation', $2, 'invitation', FALSE, NOW())
            `, [recipientUser.id, `You have been invited to join project "${project.title}" (invitation valid for 48 hours).`]);
        }

        await logActivity({
            projectId,
            userId,
            action: "MEMBER_INVITED",
            description: `${req.user.name} sent an invitation to ${cleanEmail} for "${project.title}" (valid for 48 hours)`,
            entityType: "Invitation",
            entityId: savedInvite.id,
        });

        invalidateAllCaches();

        const cleanBaseUrl = getBaseClientUrl(req);
        const invitationUrl = `${cleanBaseUrl}/team?invite=${token}`;

        // Non-blocking squad member invitation email delivery
        if (cleanEmail) {
            sendInvitationEmail({
                to: cleanEmail,
                inviterName: req.user.name,
                projectName: project.title,
                invitationUrl,
                role: "member",
            }).then((mailRes) => {
                if (!mailRes?.sent) {
                    console.warn("[Squad Member Invite Email Failure]", mailRes?.reason);
                }
            }).catch((mailErr) => {
                console.warn("[Squad Member Invite Email Notice]", mailErr.message);
            });
        }

        return res.status(201).json({
            success: true,
            message: "Invitation sent successfully (valid for 48 hours)",
            invitation: {
                ...savedInvite,
                token,
                invitationUrl,
                expiresAt: savedInvite.expires_at,
                isExpired: false,
            },
        });
    } catch (error) {
        next(error);
    }
};

// 3. CANCEL INVITATION (Strict Owner/Sender/Admin Authorization - Prevents IDOR)
export const cancelInvitation = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        const invitationId = parsePositiveInt(req.params.invitationId);
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";

        if (!projectId || !invitationId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID and invitation ID are required",
            });
        }

        const { rows } = await pool.query(`
            SELECT i.id, i.project_id, i.sender_id, p.owner_id
            FROM invitations i
            JOIN projects p ON i.project_id = p.id
            WHERE i.id = $1 AND i.project_id = $2;
        `, [invitationId, projectId]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Invitation not found",
            });
        }

        const inv = rows[0];
        const isProjectOwner = Number(inv.owner_id) === Number(userId);
        const isSender = Number(inv.sender_id) === Number(userId);

        if (!isAdmin && !isProjectOwner && !isSender) {
            return res.status(403).json({
                success: false,
                message: "Only the project owner or invitation sender can cancel this invitation",
            });
        }

        await pool.query("DELETE FROM invitations WHERE id = $1 AND project_id = $2", [invitationId, projectId]);
        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: "Invitation removed successfully",
        });
    } catch (error) {
        next(error);
    }
};

// 3b. RE-SEND / RE-INVITE INVITATION (Resets token & 48-hour expiration window)
export const resendInvitation = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        const invitationId = parsePositiveInt(req.params.invitationId);
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";

        if (!projectId || !invitationId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID and invitation ID are required",
            });
        }

        const { rows } = await pool.query(`
            SELECT i.id, i.project_id, i.recipient_email, i.recipient_id, i.role, p.owner_id, p.title as project_title
            FROM invitations i
            JOIN projects p ON i.project_id = p.id
            WHERE i.id = $1 AND i.project_id = $2;
        `, [invitationId, projectId]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Invitation not found",
            });
        }

        const inv = rows[0];
        const isProjectOwner = Number(inv.owner_id) === Number(userId);

        if (!isAdmin && !isProjectOwner) {
            return res.status(403).json({
                success: false,
                message: "Only the project leader or an administrator can re-send invitations",
            });
        }

        const token = crypto.randomBytes(32).toString("hex");

        const updateRes = await pool.query(`
            UPDATE invitations
            SET token = $1,
                status = 'Pending',
                expires_at = NOW() + INTERVAL '48 hours',
                created_at = NOW()
            WHERE id = $2 AND project_id = $3
            RETURNING *;
        `, [token, invitationId, projectId]);

        const updated = updateRes.rows[0];

        if (inv.recipient_id) {
            await pool.query(`
                INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                VALUES ($1, 'Team Invitation Renewed', $2, 'invitation', FALSE, NOW());
            `, [inv.recipient_id, `Your invitation to join project "${inv.project_title}" has been renewed with a fresh 48-hour link.`]);
        }

        await logActivity({
            projectId,
            userId,
            action: "INVITATION_RESENT",
            description: `${req.user.name} renewed the invitation for ${inv.recipient_email} to join "${inv.project_title}" (fresh 48-hour window)`,
            entityType: "Invitation",
            entityId: invitationId,
        });

        invalidateAllCaches();

        const cleanBaseUrl = getBaseClientUrl(req);
        const invitationUrl = `${cleanBaseUrl}/team?invite=${token}`;

        return res.status(200).json({
            success: true,
            message: "Invitation renewed! A fresh 48-hour link has been generated.",
            invitation: {
                ...updated,
                token,
                invitationUrl,
                expiresAt: updated.expires_at,
                status: "Pending",
                isExpired: false,
            },
        });
    } catch (error) {
        next(error);
    }
};

// 4. GET MY INVITATIONS
export const getMyInvitations = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userEmail = req.user.email;

        // Auto-expire overdue invitations
        await pool.query(`
            UPDATE invitations
            SET status = 'Expired'
            WHERE status = 'Pending' AND expires_at IS NOT NULL AND expires_at <= NOW();
        `).catch(() => {});

        const { rows } = await pool.query(`
            SELECT i.*, p.title as project_name, u.name as sender_name, u.email as sender_email
            FROM invitations i
            JOIN projects p ON i.project_id = p.id
            JOIN users u ON i.sender_id = u.id
            WHERE (i.recipient_id = $1 OR LOWER(i.recipient_email) = LOWER($2))
              AND i.status = 'Pending'
              AND (i.expires_at IS NULL OR i.expires_at > NOW())
            ORDER BY i.created_at DESC;
        `, [userId, userEmail]);

        const formatted = rows.map((i) => ({
            id: i.id,
            _id: i.id,
            project: { id: i.project_id, _id: i.project_id, name: i.project_name, title: i.project_name },
            sender: { id: i.sender_id, _id: i.sender_id, name: i.sender_name, email: i.sender_email },
            role: i.role,
            status: i.status,
            expiresAt: i.expires_at,
            createdAt: i.created_at,
        }));

        return res.status(200).json({
            success: true,
            count: formatted.length,
            invitations: formatted,
            data: formatted,
        });
    } catch (error) {
        next(error);
    }
};

// 5. ACCEPT INVITATION
export const acceptInvitation = async (req, res, next) => {
    try {
        const invitationId = parsePositiveInt(req.params.invitationId);
        const userId = req.user.id;
        const userEmail = req.user.email;

        if (!invitationId) {
            return res.status(400).json({
                success: false,
                message: "Valid invitation ID is required",
            });
        }

        const { rows } = await pool.query(`
            SELECT * FROM invitations
            WHERE id = $1 AND (recipient_id = $2 OR LOWER(recipient_email) = LOWER($3))
        `, [invitationId, userId, userEmail]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Invitation not found",
            });
        }

        const invitation = rows[0];

        // 48-Hour Expiration Check
        const isExpired = invitation.status === "Expired" || (invitation.expires_at && new Date(invitation.expires_at) <= new Date());
        if (isExpired) {
            if (invitation.status !== "Expired") {
                await pool.query("UPDATE invitations SET status = 'Expired' WHERE id = $1", [invitation.id]);
            }
            return res.status(400).json({
                success: false,
                message: "This invitation has expired (valid for 48 hours). Please ask the team leader to resend your invite.",
                expired: true,
            });
        }

        if (invitation.status !== "Pending") {
            return res.status(400).json({
                success: false,
                message: `Invitation has already been ${invitation.status.toLowerCase()}`,
            });
        }

        // Mentor invitation acceptance -> officially assigns projects.mentor_id in a transaction
        if (String(invitation.role || "").toLowerCase() === "mentor") {
            if (!MENTOR_ROLES.has(String(req.user.role || "").toLowerCase()) || isDirector(req.user)) {
                return res.status(403).json({
                    success: false,
                    message: "Only an active Faculty Mentor can accept a mentor invitation",
                });
            }

            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                const projRes = await client.query(
                    "SELECT id, title, owner_id FROM projects WHERE id = $1 FOR UPDATE;",
                    [invitation.project_id]
                );
                if (projRes.rows.length === 0) {
                    await client.query("ROLLBACK");
                    return res.status(404).json({ success: false, message: "Project no longer exists" });
                }
                const project = projRes.rows[0];

                await client.query(
                    "UPDATE projects SET mentor_id = $1, updated_at = NOW() WHERE id = $2;",
                    [userId, project.id]
                );
                await client.query(
                    "UPDATE invitations SET status = 'Accepted', recipient_id = $1 WHERE id = $2;",
                    [userId, invitationId]
                );
                // Reject any other competing pending mentor invitations for the same project
                await client.query(
                    "UPDATE invitations SET status = 'Rejected' WHERE project_id = $1 AND role = 'mentor' AND status = 'Pending' AND id != $2;",
                    [project.id, invitationId]
                );

                await logActivity({
                    projectId: project.id,
                    userId,
                    action: "MENTOR_INVITATION_ACCEPTED",
                    description: `${req.user.name} accepted the mentor invitation for "${project.title}"`,
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

                for (const m of membersRes.rows) {
                    await client.query(
                        `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                         VALUES ($1, 'Mentor Assigned', $2, 'mentor_assignment', FALSE, NOW());`,
                        [m.uid, `${req.user.name} accepted your mentor invitation and is now mentoring "${project.title}".`]
                    );
                }

                await client.query("COMMIT");
            } catch (txErr) {
                await client.query("ROLLBACK");
                throw txErr;
            } finally {
                client.release();
            }

            invalidateAllCaches();

            return res.status(200).json({
                success: true,
                message: "Mentor invitation accepted. You are now the assigned mentor for this project.",
            });
        }

        // Add to project_members with strict allowlisted role
        const safeMemberRole = ALLOWED_MEMBER_ROLES.has(String(invitation.role || "").toLowerCase())
            ? String(invitation.role).toLowerCase()
            : "member";

        await pool.query(`
            INSERT INTO project_members (project_id, user_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, user_id) DO NOTHING;
        `, [invitation.project_id, userId, safeMemberRole]);

        // Mark invitation accepted
        await pool.query("UPDATE invitations SET status = 'Accepted' WHERE id = $1", [invitationId]);
        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: "Invitation accepted. You are now a member of the project.",
        });
    } catch (error) {
        next(error);
    }
};

// 6. REJECT INVITATION
export const rejectInvitation = async (req, res, next) => {
    try {
        const invitationId = parsePositiveInt(req.params.invitationId);
        const userId = req.user.id;
        const userEmail = req.user.email;

        if (!invitationId) {
            return res.status(400).json({
                success: false,
                message: "Valid invitation ID is required",
            });
        }

        const { rows } = await pool.query(`
            SELECT * FROM invitations
            WHERE id = $1 AND (recipient_id = $2 OR LOWER(recipient_email) = LOWER($3))
        `, [invitationId, userId, userEmail]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Invitation not found",
            });
        }

        if (rows[0].status !== "Pending") {
            return res.status(400).json({
                success: false,
                message: `Invitation has already been ${rows[0].status.toLowerCase()}`,
            });
        }

        await pool.query("UPDATE invitations SET status = 'Rejected' WHERE id = $1", [invitationId]);

        if (String(rows[0].role || "").toLowerCase() === "mentor" && rows[0].sender_id) {
            const pRes = await pool.query("SELECT title FROM projects WHERE id = $1", [rows[0].project_id]);
            const projectTitle = pRes.rows[0]?.title || "your project";
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                 VALUES ($1, 'Mentor Invitation Declined', $2, 'mentor_invitation', FALSE, NOW());`,
                [rows[0].sender_id, `${req.user.name} declined the mentor invitation for "${projectTitle}". You can invite another mentor.`]
            );
        }

        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: "Invitation rejected",
        });
    } catch (error) {
        next(error);
    }
};

// 6b. ACCEPT INVITATION BY TOKEN (Used for invite links: /team?invite=<token>)
export const acceptInvitationByToken = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { token } = req.body;

        if (!token || typeof token !== "string" || !token.trim()) {
            return res.status(400).json({
                success: false,
                message: "Valid invitation token is required",
            });
        }

        const cleanToken = token.trim();

        const { rows } = await pool.query(`
            SELECT i.*, p.title as project_title, p.owner_id
            FROM invitations i
            JOIN projects p ON i.project_id = p.id
            WHERE i.token = $1;
        `, [cleanToken]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Invalid invitation link",
            });
        }

        const invitation = rows[0];

        // 48-Hour Expiration Check
        const isExpired = invitation.status === "Expired" || (invitation.expires_at && new Date(invitation.expires_at) <= new Date());
        if (isExpired) {
            if (invitation.status !== "Expired") {
                await pool.query("UPDATE invitations SET status = 'Expired' WHERE id = $1", [invitation.id]);
            }
            return res.status(400).json({
                success: false,
                message: "This invitation link has expired (valid for 48 hours). Please ask the team leader to resend your invite.",
                expired: true,
            });
        }

        if (invitation.status === "Accepted") {
            return res.status(200).json({
                success: true,
                message: "This invitation has already been accepted.",
                projectId: invitation.project_id,
            });
        }

        // Verify recipient identity matches invitation email or recipient_id
        const userEmail = String(req.user.email || "").toLowerCase().trim();
        const recipientEmail = String(invitation.recipient_email || "").toLowerCase().trim();
        const isRecipientMatch =
            (recipientEmail && recipientEmail === userEmail) ||
            (invitation.recipient_id && Number(invitation.recipient_id) === Number(userId));

        if (!isRecipientMatch) {
            return res.status(403).json({
                success: false,
                message: "This invitation link was issued to a different email address. Please login with the invited account.",
            });
        }

        // Branch A: Mentor invitation acceptance via link -> officially assigns projects.mentor_id in a transaction
        if (String(invitation.role || "").toLowerCase() === "mentor") {
            if (!MENTOR_ROLES.has(String(req.user.role || "").toLowerCase()) || isDirector(req.user)) {
                return res.status(403).json({
                    success: false,
                    message: "Only an active Faculty Mentor can accept a mentor invitation",
                });
            }

            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                const projRes = await client.query(
                    "SELECT id, title, owner_id FROM projects WHERE id = $1 FOR UPDATE;",
                    [invitation.project_id]
                );
                if (projRes.rows.length === 0) {
                    await client.query("ROLLBACK");
                    return res.status(404).json({ success: false, message: "Project no longer exists" });
                }
                const project = projRes.rows[0];

                await client.query(
                    "UPDATE projects SET mentor_id = $1, updated_at = NOW() WHERE id = $2;",
                    [userId, project.id]
                );
                await client.query(
                    "UPDATE invitations SET status = 'Accepted', recipient_id = $1 WHERE id = $2;",
                    [userId, invitation.id]
                );
                // Reject any other competing pending mentor invitations for the same project
                await client.query(
                    "UPDATE invitations SET status = 'Rejected' WHERE project_id = $1 AND role = 'mentor' AND status = 'Pending' AND id != $2;",
                    [project.id, invitation.id]
                );

                await logActivity({
                    projectId: project.id,
                    userId,
                    action: "MENTOR_INVITATION_ACCEPTED",
                    description: `${req.user.name} accepted the mentor invitation for "${project.title}" via invite link`,
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

                for (const m of membersRes.rows) {
                    await client.query(
                        `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                         VALUES ($1, 'Mentor Assigned', $2, 'mentor_assignment', FALSE, NOW());`,
                        [m.uid, `${req.user.name} accepted your mentor invitation and is now mentoring "${project.title}".`]
                    );
                }

                await client.query("COMMIT");
            } catch (txErr) {
                await client.query("ROLLBACK");
                throw txErr;
            } finally {
                client.release();
            }

            invalidateAllCaches();

            return res.status(200).json({
                success: true,
                message: "Mentor invitation accepted. You are now the assigned mentor for this project.",
                projectId: invitation.project_id,
            });
        }

        // Branch B: Standard student member invitation acceptance via link
        // Check if user is already the project owner
        if (Number(invitation.owner_id) === Number(userId)) {
            return res.status(200).json({
                success: true,
                message: "You are the leader of this project.",
                projectId: invitation.project_id,
            });
        }

        // Check if user is already a member
        const memberCheck = await pool.query(
            "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
            [invitation.project_id, userId]
        );
        if (memberCheck.rows.length > 0) {
            return res.status(200).json({
                success: true,
                message: "You are already a member of this project.",
                projectId: invitation.project_id,
            });
        }

        // Add to project_members with strict allowlisted role
        const safeMemberRole = ALLOWED_MEMBER_ROLES.has(String(invitation.role || "").toLowerCase())
            ? String(invitation.role).toLowerCase()
            : "member";

        await pool.query(`
            INSERT INTO project_members (project_id, user_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, user_id) DO NOTHING;
        `, [invitation.project_id, userId, safeMemberRole]);

        // Mark invitation accepted and record recipient
        await pool.query(
            "UPDATE invitations SET status = 'Accepted', recipient_id = $1 WHERE id = $2;",
            [userId, invitation.id]
        );

        await logActivity({
            projectId: invitation.project_id,
            userId,
            action: "INVITATION_ACCEPTED",
            description: `${req.user.name} joined "${invitation.project_title}" via invite link`,
            entityType: "Project",
            entityId: invitation.project_id,
        });

        // Notify project owner
        if (invitation.owner_id && Number(invitation.owner_id) !== Number(userId)) {
            await pool.query(`
                INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                VALUES ($1, 'New Team Member', $2, 'team_added', FALSE, NOW());
            `, [invitation.owner_id, `${req.user.name} accepted your invitation and joined "${invitation.project_title}".`]);
        }

        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: "Invitation accepted! Welcome to the squad.",
            projectId: invitation.project_id,
        });
    } catch (error) {
        next(error);
    }
};

// 7. REMOVE TEAM MEMBER
export const removeTeamMember = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        const memberId = parsePositiveInt(req.params.memberId);
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";

        if (!projectId || !memberId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID and member ID are required",
            });
        }

        const projRes = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
        if (projRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const project = projRes.rows[0];
        let isLeader = Number(project.owner_id) === Number(userId);
        if (!isLeader && !isAdmin) {
            const leaderCheck = await pool.query(
                "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2 AND LOWER(role) = 'leader';",
                [projectId, userId]
            );
            isLeader = leaderCheck.rows.length > 0;
        }

        if (role === "mentor" || role === "faculty" || (!isAdmin && !isLeader)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden. Only the current Team Leader or an Administrator can remove squad members.",
            });
        }

        if (Number(project.owner_id) === Number(memberId)) {
            return res.status(400).json({
                success: false,
                message: "Cannot remove the project owner from the team",
            });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN;");

            await client.query(
                "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
                [projectId, memberId]
            );

            // Explicitly unassign any tasks belonging to this project assigned to the removed member inside same transaction
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

        invalidateAllCaches();
        evictUserFromProjectRooms(req, projectId, memberId);

        const io = req.app.get("io");
        if (io) {
            io.to(`user:${memberId}`).emit("collabx_tasks_updated", { projectId, memberId, action: "removed" });
            io.to(`user:${memberId}`).emit("collabx_projects_updated", { projectId, memberId, action: "removed" });
            io.to(`user:${memberId}`).emit("collabx_team_updated", { projectId, memberId, action: "removed" });
            io.to(`project_${projectId}_official`).emit("collabx_tasks_updated", { projectId, memberId, action: "unassigned" });
            io.to(`project_${projectId}_official`).emit("collabx_team_updated", { projectId, memberId });
        }

        return res.status(200).json({
            success: true,
            message: "Team member removed successfully",
        });
    } catch (error) {
        next(error);
    }
};

// 7b. REMOVE PROJECT MENTOR
export const removeProjectMentor = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID is required",
            });
        }

        const projRes = await pool.query(
            `SELECT p.*, m.name as mentor_name, m.email as mentor_email
             FROM projects p
             LEFT JOIN users m ON p.mentor_id = m.id
             WHERE p.id = $1`,
            [projectId]
        );

        if (projRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const project = projRes.rows[0];
        if (!isAdmin && Number(project.owner_id) !== Number(userId)) {
            return res.status(403).json({
                success: false,
                message: "Only the project owner or an administrator can remove the faculty mentor",
            });
        }

        if (!project.mentor_id) {
            return res.status(400).json({
                success: false,
                message: "This project does not have an assigned mentor to remove",
            });
        }

        const removedMentorId = project.mentor_id;
        const removedMentorName = project.mentor_name || "Faculty Mentor";

        const client = await pool.connect();
        try {
            await client.query("BEGIN;");

            // Unassign mentor from project inside same transaction
            await client.query(
                "UPDATE projects SET mentor_id = NULL, updated_at = NOW() WHERE id = $1",
                [projectId]
            );

            // Explicitly unassign any tasks belonging to this project assigned to the removed mentor
            await client.query(
                "UPDATE tasks SET assigned_to = NULL, updated_at = NOW() WHERE project_id = $1 AND assigned_to = $2;",
                [projectId, removedMentorId]
            );

            // Cancel any pending mentor invitations for this project
            await client.query(
                "UPDATE invitations SET status = 'Rejected' WHERE project_id = $1 AND role = 'mentor' AND status = 'Pending'",
                [projectId]
            );

            await client.query("COMMIT;");
        } catch (txErr) {
            await client.query("ROLLBACK;");
            throw txErr;
        } finally {
            client.release();
        }

        // Evict previous mentor from real-time project rooms
        evictUserFromProjectRooms(req, projectId, removedMentorId);

        // Send notification to the removed mentor
        const notifRes = await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
             VALUES ($1, 'Mentor Unassigned', $2, 'mentor_unassigned', FALSE, NOW())
             RETURNING id, title, message, type, is_read, created_at;`,
            [
                removedMentorId,
                `You have been unassigned as Faculty Mentor from project "${project.title}".`,
            ]
        );

        const io = req.app.get("io");
        if (io && notifRes.rows[0]) {
            io.to(`user:${removedMentorId}`).emit("notification:new", {
                id: notifRes.rows[0].id,
                _id: notifRes.rows[0].id,
                title: notifRes.rows[0].title,
                message: notifRes.rows[0].message,
                type: notifRes.rows[0].type,
                project: projectId,
                isRead: false,
                createdAt: notifRes.rows[0].created_at,
            });
        }

        // Notify team members that mentor was removed
        const membersRes = await pool.query(
            `SELECT DISTINCT uid FROM (
                SELECT owner_id AS uid FROM projects WHERE id = $1 AND owner_id IS NOT NULL
                UNION
                SELECT user_id AS uid FROM project_members WHERE project_id = $1
            ) t WHERE uid != $2;`,
            [projectId, userId]
        );

        for (const m of membersRes.rows) {
            const teamNotif = await pool.query(
                `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                 VALUES ($1, 'Mentor Removed', $2, 'mentor_removed', FALSE, NOW())
                 RETURNING id, title, message, type, is_read, created_at;`,
                [
                    m.uid,
                    `${req.user.name} removed Faculty Mentor ${removedMentorName} from "${project.title}". The project currently has no mentor assigned.`,
                ]
            );
            if (io && teamNotif.rows[0]) {
                io.to(`user:${m.uid}`).emit("notification:new", {
                    id: teamNotif.rows[0].id,
                    _id: teamNotif.rows[0].id,
                    title: teamNotif.rows[0].title,
                    message: teamNotif.rows[0].message,
                    type: teamNotif.rows[0].type,
                    project: projectId,
                    isRead: false,
                    createdAt: teamNotif.rows[0].created_at,
                });
            }
        }

        await logActivity({
            projectId,
            userId,
            action: "MENTOR_REMOVED",
            description: `${req.user.name} removed Faculty Mentor ${removedMentorName} from "${project.title}"`,
            entityType: "Project",
            entityId: projectId,
            metadata: { previousMentorId: removedMentorId, previousMentorName: removedMentorName },
        });

        invalidateAllCaches();

        if (io) {
            io.to(`user:${removedMentorId}`).emit("collabx_tasks_updated", { projectId, mentorId: removedMentorId, action: "mentor_removed" });
            io.to(`user:${removedMentorId}`).emit("collabx_projects_updated", { projectId, mentorId: removedMentorId, action: "mentor_removed" });
            io.to(`user:${removedMentorId}`).emit("collabx_team_updated", { projectId, mentorId: removedMentorId, action: "mentor_removed" });
            io.to(`project_${projectId}_official`).emit("collabx_tasks_updated", { projectId, action: "mentor_removed" });
            io.to(`project_${projectId}_official`).emit("collabx_team_updated", { projectId, action: "mentor_removed" });
        }

        return res.status(200).json({
            success: true,
            message: `Faculty Mentor ${removedMentorName} has been removed. The project currently has no mentor assigned.`,
        });
    } catch (error) {
        next(error);
    }
};

// 8. LEAVE PROJECT
export const leaveProject = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        const userId = req.user.id;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID is required",
            });
        }

        const projRes = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
        if (projRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        if (Number(projRes.rows[0].owner_id) === Number(userId)) {
            return res.status(400).json({
                success: false,
                message: "Project owner cannot leave the project without transferring ownership first",
            });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN;");

            await client.query(
                "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
                [projectId, userId]
            );

            // Explicitly unassign any tasks belonging to this project assigned to the departing member inside same transaction
            await client.query(
                "UPDATE tasks SET assigned_to = NULL, updated_at = NOW() WHERE project_id = $1 AND assigned_to = $2;",
                [projectId, userId]
            );

            await client.query("COMMIT;");
        } catch (txErr) {
            await client.query("ROLLBACK;");
            throw txErr;
        } finally {
            client.release();
        }

        invalidateAllCaches();
        evictUserFromProjectRooms(req, projectId, userId);

        const io = req.app.get("io");
        if (io) {
            io.to(`user:${userId}`).emit("collabx_tasks_updated", { projectId, userId, action: "left" });
            io.to(`user:${userId}`).emit("collabx_projects_updated", { projectId, userId, action: "left" });
            io.to(`user:${userId}`).emit("collabx_team_updated", { projectId, userId, action: "left" });
            io.to(`project_${projectId}_official`).emit("collabx_tasks_updated", { projectId, userId, action: "unassigned" });
            io.to(`project_${projectId}_official`).emit("collabx_team_updated", { projectId, userId });
        }

        return res.status(200).json({
            success: true,
            message: "You have left the project",
        });
    } catch (error) {
        next(error);
    }
};

// 9. TRANSFER OWNERSHIP
export const transferOwnership = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.projectId);
        const userId = req.user.id;
        const { newOwnerId } = pickAllowedFields(req.body, ["newOwnerId"]);
        const targetUserId = parsePositiveInt(newOwnerId);

        if (!projectId || !targetUserId) {
            return res.status(400).json({
                success: false,
                message: "Valid project ID and new owner ID are required",
            });
        }

        if (Number(targetUserId) === Number(userId)) {
            return res.status(400).json({
                success: false,
                message: "You are already the project owner",
            });
        }

        const projRes = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
        if (projRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";
        const currentOwnerId = projRes.rows[0].owner_id;

        if (role === "mentor" || role === "faculty" || (!isAdmin && Number(currentOwnerId) !== Number(userId))) {
            return res.status(403).json({
                success: false,
                message: "Forbidden. Only the current Team Leader or an Administrator can transfer or switch team leadership.",
            });
        }

        // Verify target user is an active member of this project
        const targetMemberCheck = await pool.query(`
            SELECT pm.user_id
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = $1 AND pm.user_id = $2 AND u.is_active = TRUE;
        `, [projectId, targetUserId]);

        if (targetMemberCheck.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Ownership can only be transferred to an existing active member of this project",
            });
        }

        // Add old owner to members
        if (currentOwnerId) {
            await pool.query(`
                INSERT INTO project_members (project_id, user_id, role)
                VALUES ($1, $2, 'member')
                ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'member';
            `, [projectId, currentOwnerId]);
        }

        // Remove new owner from regular members if there
        await pool.query(
            "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
            [projectId, targetUserId]
        );

        // Update owner
        await pool.query(
            "UPDATE projects SET owner_id = $1, updated_at = NOW() WHERE id = $2",
            [targetUserId, projectId]
        );
        invalidateAllCaches();

        return res.status(200).json({
            success: true,
            message: "Ownership transferred successfully",
        });
    } catch (error) {
        next(error);
    }
};
