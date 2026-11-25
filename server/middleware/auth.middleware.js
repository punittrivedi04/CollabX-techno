import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { safeUser, parsePositiveInt } from "../utils/formatters.js";
import { userAuthCache, isTokenRevoked } from "../utils/microCache.js";

export const getEffectiveRole = (user) => {
    if (!user) return "";
    const normalized = String(user.role || "student").toLowerCase().trim();
    if (normalized === "director") return "director";
    if (normalized === "coordinator") return "admin";
    if (normalized === "faculty") return "mentor";
    return normalized;
};

export const authorize = (...allowedRoles) => {
    const normalizedAllowed = allowedRoles.map((r) => String(r || "").toLowerCase().trim());

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please login.",
            });
        }

        const effectiveRole = getEffectiveRole(req.user);
        if (!normalizedAllowed.includes(effectiveRole)) {
            return res.status(403).json({
                success: false,
                message: "Access denied. You do not have permission to access this portal.",
            });
        }

        return next();
    };
};

const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please login.",
            });
        }

        const token = authHeader.slice(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Invalid authorization token.",
            });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return next(new Error("JWT_SECRET is missing in environment variables"));
        }

        const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });

        if (!decoded || decoded.type === "refresh" || !decoded.id) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token.",
            });
        }

        const userId = parsePositiveInt(decoded.id);
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token.",
            });
        }

        if (isTokenRevoked(userId, decoded)) {
            return res.status(401).json({
                success: false,
                message: "Session has been invalidated. Please login again.",
            });
        }

        const user = await userAuthCache.getOrSet(`auth:${userId}`, async () => {
            const { rows } = await pool.query(
                "SELECT id, name, email, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at FROM users WHERE id = $1",
                [userId]
            );
            return rows[0] || null;
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User account no longer exists.",
            });
        }

        if (user.is_verified === false || user.is_active === false) {
            return res.status(403).json({
                success: false,
                message: user.is_verified === false ? "User email is not verified." : "User account has been deactivated.",
            });
        }

        req.user = {
            id: user.id,
            _id: user.id,
            ...safeUser(user),
        };

        return next();
    } catch (error) {
        if (
            error.name === "TokenExpiredError" ||
            error.name === "JsonWebTokenError" ||
            error.name === "NotBeforeError"
        ) {
            return res.status(401).json({
                success: false,
                message:
                    error.name === "TokenExpiredError"
                        ? "Session expired. Please login again."
                        : "Invalid or expired authentication token.",
            });
        }

        return next(error);
    }
};

export default protect;
