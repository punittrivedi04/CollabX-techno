/**
 * server/middleware/ownershipGuard.js
 *
 * Reusable Ownership-Based Authorization Guards for CollabX.
 * Provides explicit, declarative route-level authorization middleware to ensure
 * zero endpoints rely solely on client UI hiding or vulnerable to IDOR.
 */

import pool from "../config/db.js";
import { parsePositiveInt } from "../utils/formatters.js";
import { projectAccessCache } from "../utils/microCache.js";
import { getEffectiveRole } from "./auth.middleware.js";
import { isDirector } from "./directorGuard.js";

/**
 * Guard that strictly requires the user to hold one of the specified roles.
 */
export const requireRole = (...allowedRoles) => {
    const normalized = allowedRoles.map((r) => String(r || "").toLowerCase().trim());
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please login.",
            });
        }
        const effective = getEffectiveRole(req.user);
        if (!normalized.includes(effective)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Requires one of: [${allowedRoles.join(", ")}].`,
            });
        }
        next();
    };
};

/**
 * Reusable helper to retrieve project owner & mentor IDs with micro-caching.
 */
const getProjectInfo = async (projectId) => {
    return projectAccessCache.getOrSet(`proj_info:${projectId}`, async () => {
        const { rows } = await pool.query(
            "SELECT id, owner_id, mentor_id FROM projects WHERE id = $1",
            [projectId]
        );
        return rows[0] || null;
    });
};

/**
 * Guard that verifies the requesting user is the project owner (or Admin).
 */
export const requireProjectLeader = (paramKey = "id") => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: "Authentication required." });
            }

            const rawId = req.params[paramKey] || req.body[paramKey] || req.query[paramKey];
            const projectId = parsePositiveInt(rawId);
            if (!projectId) {
                return res.status(400).json({ success: false, message: "Valid project ID is required." });
            }

            const role = String(req.user.role || "").toLowerCase();
            const isAdmin = role === "admin" || role === "coordinator";
            if (isAdmin) {
                return next();
            }

            const project = await getProjectInfo(projectId);
            if (!project) {
                return res.status(404).json({ success: false, message: "Project not found." });
            }

            const isOwner = Number(project.owner_id) === Number(req.user.id);
            if (!isOwner) {
                return res.status(403).json({
                    success: false,
                    message: "Forbidden. Only the Team Leader or an Administrator can perform this action.",
                });
            }

            req.project = project;
            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Guard that verifies the requesting user is a squad member, owner, assigned mentor, or Admin.
 */
export const requireProjectMember = (paramKey = "id") => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: "Authentication required." });
            }

            const rawId = req.params[paramKey] || req.body[paramKey] || req.query[paramKey];
            const projectId = parsePositiveInt(rawId);
            if (!projectId) {
                return res.status(400).json({ success: false, message: "Valid project ID is required." });
            }

            const role = String(req.user.role || "").toLowerCase();
            const isAdmin = role === "admin" || role === "coordinator" || isDirector(req.user);
            if (isAdmin) {
                return next();
            }

            const project = await getProjectInfo(projectId);
            if (!project) {
                return res.status(404).json({ success: false, message: "Project not found." });
            }

            const userId = Number(req.user.id);
            const isOwner = Number(project.owner_id) === userId;
            const isMentor = Number(project.mentor_id) === userId;

            if (isOwner || isMentor) {
                req.project = project;
                return next();
            }

            // Check project_members table
            const memberCheck = await projectAccessCache.getOrSet(`pm:${projectId}:${userId}`, async () => {
                const { rows } = await pool.query(
                    "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
                    [projectId, userId]
                );
                return rows.length > 0;
            });

            if (!memberCheck) {
                return res.status(403).json({
                    success: false,
                    message: "Forbidden. You do not have access to this project.",
                });
            }

            req.project = project;
            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Guard that verifies the user is the project mentor, owner, or Admin.
 */
export const requireProjectMentorOrLeader = (paramKey = "id") => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: "Authentication required." });
            }

            const rawId = req.params[paramKey] || req.body[paramKey] || req.query[paramKey];
            const projectId = parsePositiveInt(rawId);
            if (!projectId) {
                return res.status(400).json({ success: false, message: "Valid project ID is required." });
            }

            const role = String(req.user.role || "").toLowerCase();
            const isAdmin = role === "admin" || role === "coordinator";
            if (isAdmin) {
                return next();
            }

            const project = await getProjectInfo(projectId);
            if (!project) {
                return res.status(404).json({ success: false, message: "Project not found." });
            }

            const userId = Number(req.user.id);
            const isOwner = Number(project.owner_id) === userId;
            const isMentor = Number(project.mentor_id) === userId;

            if (!isOwner && !isMentor) {
                return res.status(403).json({
                    success: false,
                    message: "Forbidden. Only the Team Leader, Assigned Mentor, or Administrator can perform this action.",
                });
            }

            req.project = project;
            next();
        } catch (error) {
            next(error);
        }
    };
};

export default {
    requireRole,
    requireProjectLeader,
    requireProjectMember,
    requireProjectMentorOrLeader,
};
