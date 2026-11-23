import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, ".env") });

import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import http from "http";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";

import pool, { ensureSchemaMigrations, ensurePerformanceIndexes } from "./config/db.js";
import { startTaskReminderJob } from "./jobs/taskReminder.job.js";
import {
    userAuthCache,
    projectAccessCache,
    invalidateAllCaches,
    invalidateUserCache,
    isTokenRevoked,
} from "./utils/microCache.js";

// Routes
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import taskRoutes from "./routes/task.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import teamRoutes from "./routes/team.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import activityRoutes from "./routes/activity.routes.js";
import userRoutes from "./routes/user.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import mentorRoutes from "./routes/mentor.routes.js";
import directorRoutes from "./routes/director.routes.js";
import leaderboardRoutes from "./routes/leaderboard.routes.js";
import {
    getUserProfile,
    updateUserProfile,
} from "./controllers/user.controller.js";
import { getDirectorStudents, getDirectorStudentById } from "./controllers/director.controller.js";
import { getAdminStudents, getAdminStudentById } from "./controllers/admin.controller.js";
import { getMentorStudents, getMentorStudentById } from "./controllers/mentor.controller.js";
import protect from "./middleware/auth.middleware.js";
import { isDirector, blockDirectorMutations } from "./middleware/directorGuard.js";
import { parsePositiveInt } from "./utils/formatters.js";

// Error Middleware
import {
    notFound,
    errorHandler,
} from "./middleware/error.middleware.js";

// Custom Security Middleware
import { securityHeaders, createCorsOptions } from "./middleware/securityHeaders.js";
import { globalRateLimiter, mutationRateLimiter } from "./middleware/rateLimiter.js";
import sanitizeAndValidate, { sanitizeText } from "./middleware/sanitizeAndValidate.js";

const app = express();
const server = http.createServer(app);
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL;
const DEBUG_SOCKETS = process.env.DEBUG_SOCKETS === "true";

export const parseAllowedOrigins = (rawUrl) => {
    const fallback = ["http://localhost:5173", "http://127.0.0.1:5173"];
    if (!rawUrl || typeof rawUrl !== "string") return fallback;
    const origins = rawUrl
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => Boolean(origin) && origin !== "*")
        .map((origin) => {
            try {
                return new URL(origin).origin;
            } catch {
                return origin.replace(/\/+$/, "");
            }
        })
        .filter(Boolean);
    return origins.length > 0 ? origins : fallback;
};

let allowedOrigins = parseAllowedOrigins(process.env.CLIENT_URL);

// ==========================================
// TRUST PROXY (Enabled for Render / Reverse Proxy Deployments)
// ==========================================
app.set("trust proxy", 1);

// ==========================================
// CORS CONFIGURATION
// ==========================================
const corsOptions = createCorsOptions(() => allowedOrigins);

// ==========================================
// SOCKET.IO SETUP (Low-Memory 2,000+ Concurrency Config)
// ==========================================
const io = new Server(server, {
    cors: corsOptions,
    perMessageDeflate: false,
    httpCompression: false,
    maxHttpBufferSize: 65536, // 64KB
    pingInterval: 25000,
    pingTimeout: 20000,
    connectTimeout: 20000,
});

// ==========================================
// SOCKET.IO JWT AUTHENTICATION (Cached for 2K Burst)
// ==========================================
io.use(async (socket, next) => {
    try {
        const authToken =
            socket.handshake.auth?.token ||
            socket.handshake.headers?.authorization;

        if (!authToken || typeof authToken !== "string") {
            return next(new Error("Authentication required"));
        }

        const token = authToken.startsWith("Bearer ")
            ? authToken.slice(7).trim()
            : authToken.trim();

        if (!token) {
            return next(new Error("Authentication required"));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ["HS256"],
        });
        const parsedUserId = parsePositiveInt(decoded?.id || decoded?._id);

        if (!decoded || decoded.type === "refresh" || !parsedUserId) {
            return next(new Error("Invalid authentication token"));
        }

        if (isTokenRevoked(parsedUserId, decoded)) {
            return next(new Error("Session has been invalidated. Please login again."));
        }

        const user = await userAuthCache.getOrSet(`auth:${parsedUserId}`, async () => {
            const { rows } = await pool.query(
                "SELECT id, name, email, roll_no, role, is_verified, is_active, created_at FROM users WHERE id = $1",
                [parsedUserId]
            );
            return rows[0] || null;
        });

        if (!user || user.is_active === false) {
            return next(new Error("User account not found"));
        }

        socket.data.user = {
            id: user.id.toString(),
            _id: user.id.toString(),
            name: user.name,
            email: user.email,
            role: user.role || "student",
        };

        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return next(new Error("Session expired. Please login again."));
        }

        return next(new Error("Invalid authentication token"));
    }
});

// ==========================================
// GLOBAL SECURITY & PARSING MIDDLEWARE
// ==========================================
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(helmet({
    contentSecurityPolicy: false, // Managed custom in securityHeaders for Vite & WebSockets
}));
app.use(cors(corsOptions));
app.use(compression({
    filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        return compression.filter(req, res);
    },
    level: 6,
    threshold: 1024,
}));
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
app.use(
    express.urlencoded({
        extended: false,
        limit: "100kb",
        parameterLimit: 100,
    })
);

if (process.env.QUIET_LOGS !== "true") {
    app.use(
        morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
            skip: (req) =>
                req.path === "/api/health" ||
                req.path === "/health" ||
                Boolean(req.originalUrl && req.originalUrl.includes("/health")),
        })
    );
}

// Make Socket.IO accessible inside controllers
app.set("io", io);

// Centralized Input Sanitization & Multi-Tier Rate Limiting
app.use("/api", sanitizeAndValidate);
app.use("/api", globalRateLimiter);
app.use("/api", mutationRateLimiter);

// Auto-invalidate bounded micro TTL caches on any successful mutation
app.use("/api", (req, res, next) => {
    const method = req.method;
    if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
        res.on("finish", () => {
            if (res.statusCode < 400) {
                const target = (req.originalUrl || req.path || "").toLowerCase();
                if (
                    target.includes("/user") ||
                    target.includes("/auth") ||
                    target.includes("/admin") ||
                    target.includes("/mentor")
                ) {
                    invalidateUserCache();
                } else {
                    invalidateAllCaches();
                }
            }
        });
    }
    next();
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/messages", chatRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/mentor", mentorRoutes);
app.use("/api/director", directorRoutes);
app.use("/api/leaderboard", leaderboardRoutes);

// Direct /api/students and /api/student dispatcher based on role
app.get(["/api/students", "/api/student"], protect, (req, res, next) => {
    const role = (req.user?.role || "").toLowerCase().trim();
    if (role === "director") return getDirectorStudents(req, res, next);
    if (role === "mentor" || role === "faculty") return getMentorStudents(req, res, next);
    return getAdminStudents(req, res, next);
});

app.get(["/api/students/:id", "/api/student/:id"], protect, (req, res, next) => {
    const role = (req.user?.role || "").toLowerCase().trim();
    if (role === "director") return getDirectorStudentById(req, res, next);
    if (role === "mentor" || role === "faculty") return getMentorStudentById(req, res, next);
    return getAdminStudentById(req, res, next);
});

// Direct profile endpoints
app.get("/api/users/profile", protect, getUserProfile);
app.put("/api/users/profile", protect, blockDirectorMutations("Director operates in read-only executive mode. Profile updates are not permitted."), updateUserProfile);
app.patch("/api/users/profile", protect, blockDirectorMutations("Director operates in read-only executive mode. Profile updates are not permitted."), updateUserProfile);
app.get("/api/user/profile", protect, getUserProfile);
app.put("/api/user/profile", protect, blockDirectorMutations("Director operates in read-only executive mode. Profile updates are not permitted."), updateUserProfile);
app.patch("/api/user/profile", protect, blockDirectorMutations("Director operates in read-only executive mode. Profile updates are not permitted."), updateUserProfile);

const normalizeChannel = (ch) => {
    const s = String(ch || "").trim().toLowerCase();
    return s === "unofficial" ? "unofficial" : "official";
};

// ==========================================
// SOCKET.IO CONNECTION & REAL-TIME EVENTS
// ==========================================
const MAX_SOCKET_EVENTS = 15;
const SOCKET_EVENT_WINDOW_MS = 5000;

io.on("connection", (socket) => {
    const initialUser = socket.data?.user;
    const authUserId = initialUser?.id;

    if (authUserId) {
        socket.join(`user:${authUserId}`);
        socket.join(`user_${authUserId}`);
        if (DEBUG_SOCKETS) {
            console.log(`[Socket] Connected: User ${authUserId} (${initialUser.name}) [socketId: ${socket.id}]`);
        }
    }

    // Ultra-lean per-socket flood limiter (15 events / 5s per socket, zero extra Maps/timers)
    let rateWindowStart = Date.now();
    let rateEventCount = 0;
    let rateWarnedInWindow = false;

    const allowSocketEvent = (callback) => {
        const now = Date.now();
        if (now - rateWindowStart >= SOCKET_EVENT_WINDOW_MS) {
            rateWindowStart = now;
            rateEventCount = 0;
            rateWarnedInWindow = false;
        }
        rateEventCount += 1;
        if (rateEventCount > MAX_SOCKET_EVENTS) {
            if (!rateWarnedInWindow) {
                rateWarnedInWindow = true;
                socket.emit("rate_limited", {
                    code: "RATE_LIMITED",
                    message: "Too many real-time events. Please slow down.",
                });
            }
            if (typeof callback === "function") {
                callback({
                    success: false,
                    code: "RATE_LIMITED",
                    message: "Too many real-time events. Please slow down.",
                });
            }
            return false;
        }
        return true;
    };

    // Always resolve identity exclusively from authenticated socket.data.user (never client payloads)
    const getAuthenticatedSocketUser = async () => {
        const sid = parsePositiveInt(socket.data?.user?.id);
        if (!sid) return null;
        const fresh = await userAuthCache.getOrSet(`auth:${sid}`, async () => {
            const { rows } = await pool.query(
                "SELECT id, name, email, roll_no, role, is_verified, is_active, created_at FROM users WHERE id = $1",
                [sid]
            );
            return rows[0] || null;
        });
        if (!fresh || fresh.is_active === false) return null;
        const normalized = {
            id: fresh.id.toString(),
            _id: fresh.id.toString(),
            name: fresh.name,
            email: fresh.email,
            role: fresh.role || "student",
        };
        socket.data.user = normalized;
        return normalized;
    };

    const getCachedProject = (projectId) =>
        projectAccessCache.getOrSet(`proj:${projectId}`, async () => {
            const projCheck = await pool.query(
                "SELECT id, owner_id, mentor_id FROM projects WHERE id = $1",
                [projectId]
            );
            return projCheck.rows[0] || null;
        });

    const getCachedMembership = (projectId, uid) =>
        projectAccessCache.getOrSet(`pm:${projectId}:${uid}`, async () => {
            const memberCheck = await pool.query(
                "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
                [projectId, Number(uid)]
            );
            return memberCheck.rows.length > 0;
        });

    // JOIN PROJECT ROOM (Dual Channel: official / unofficial - Strict Squad Isolation)
    socket.on("join_project", async (data, callback) => {
        if (!allowSocketEvent(callback)) return;

        const payload = data && typeof data === "object" ? data : null;
        const pId = payload ? (payload.projectId || payload.project) : data;
        const rawChannel = payload ? payload.channel : "official";
        const channel = normalizeChannel(rawChannel);
        const projectId = parsePositiveInt(pId);

        const user = await getAuthenticatedSocketUser();
        const userId = user?.id;

        if (!projectId || !userId) {
            if (typeof callback === "function") callback({ success: false, message: "Valid projectId required" });
            return;
        }

        if (isDirector(user)) {
            socket.emit("error", { message: "Director account does not have access to project chat channels" });
            if (typeof callback === "function") callback({ success: false, message: "Director denied" });
            return;
        }

        const role = String(user?.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";
        const isMentorRole = role === "mentor" || role === "faculty";

        // Enforce: Mentors, Admins, and Directors cannot join unofficial channel
        if (channel === "unofficial" && (isAdmin || isMentorRole)) {
            socket.emit("error", { message: "Unofficial chat is strictly private to student team members" });
            if (typeof callback === "function") callback({ success: false, message: "Unofficial denied" });
            return;
        }

        try {
            const project = await getCachedProject(projectId);
            if (!project) {
                socket.emit("error", { message: "Project not found" });
                if (typeof callback === "function") callback({ success: false, message: "Project not found" });
                return;
            }

            const isOwner = Number(project.owner_id) === Number(userId);
            const isAssignedMentor = Number(project.mentor_id) === Number(userId);

            if (channel === "unofficial") {
                if (!isOwner && !(await getCachedMembership(projectId, userId))) {
                    socket.emit("error", { message: "You are not a member of this project" });
                    if (typeof callback === "function") callback({ success: false, message: "Forbidden" });
                    return;
                }
            } else {
                // Official channel: strictly require admin, owner, assigned mentor, or squad member
                if (!isAdmin && !isOwner && !isAssignedMentor && !(await getCachedMembership(projectId, userId))) {
                    socket.emit("error", { message: "You do not have access to this project chat" });
                    if (typeof callback === "function") callback({ success: false, message: "Forbidden" });
                    return;
                }
            }
        } catch (err) {
            console.error("[Socket] join_project check failed:", err.message);
            if (typeof callback === "function") callback({ success: false, message: "Join failed" });
            return;
        }

        const room = `project_${projectId}_${channel}`;
        socket.join(room);
        if (DEBUG_SOCKETS) {
            console.log(`[Socket] User ${userId} joined room ${room}`);
        }
        if (typeof callback === "function") callback({ success: true, room });
    });

    // LEAVE PROJECT ROOM
    socket.on("leave_project", (data) => {
        if (!allowSocketEvent()) return;

        const payload = data && typeof data === "object" ? data : null;
        const pId = payload ? (payload.projectId || payload.project) : data;
        const rawChannel = payload ? payload.channel : "official";
        const channel = normalizeChannel(rawChannel);
        const projectId = parsePositiveInt(pId);

        if (!projectId) return;

        const room = `project_${projectId}_${channel}`;
        socket.leave(room);
        if (DEBUG_SOCKETS) {
            console.log(`[Socket] User ${authUserId} left room ${room}`);
        }
    });

    // REAL-TIME MESSAGE SEND VIA SOCKET (Anti-Spoofing: identity strictly from socket.data.user)
    socket.on("send_message", async (data, callback) => {
        if (!allowSocketEvent(callback)) return;

        try {
            const user = await getAuthenticatedSocketUser();
            const userId = user?.id;

            if (!userId) {
                if (typeof callback === "function") callback({ success: false, message: "Authentication required" });
                return;
            }

            if (isDirector(user)) {
                if (typeof callback === "function") callback({ success: false, message: "Director account does not have access to project chat" });
                return;
            }

            const payload = data && typeof data === "object" ? data : {};
            const pId = payload.projectId || payload.project;
            const projectId = parsePositiveInt(pId);
            const rawChannel = payload.channel || "official";
            const channel = normalizeChannel(rawChannel);
            const rawText = typeof payload.content === "string"
                ? payload.content
                : typeof payload.message === "string"
                    ? payload.message
                    : "";
            const content = sanitizeText(rawText);

            if (!projectId || !content) {
                if (typeof callback === "function") callback({ success: false, message: "Valid project ID and non-empty content are required" });
                return;
            }

            if (content.length > 2000) {
                if (typeof callback === "function") callback({ success: false, message: "Message cannot exceed 2000 characters" });
                return;
            }

            const role = String(user?.role || "").toLowerCase();
            const isAdmin = role === "admin" || role === "coordinator";
            const isMentorRole = role === "mentor" || role === "faculty";

            // Strict role check for unofficial channel
            if (channel === "unofficial") {
                if (isAdmin || isMentorRole || isDirector(user)) {
                    if (typeof callback === "function") {
                        callback({ success: false, message: "Unofficial chat is strictly private to student team members" });
                    }
                    return;
                }
            }

            const project = await getCachedProject(projectId);
            if (!project) {
                if (typeof callback === "function") callback({ success: false, message: "Project not found" });
                return;
            }

            const isOwner = Number(project.owner_id) === Number(userId);
            const isAssignedMentor = Number(project.mentor_id) === Number(userId);

            if (channel === "unofficial") {
                if (!isOwner && !(await getCachedMembership(projectId, userId))) {
                    if (typeof callback === "function") callback({ success: false, message: "You do not have access to this project" });
                    return;
                }
            } else {
                if (!isAdmin && !isOwner && !isAssignedMentor && !(await getCachedMembership(projectId, userId))) {
                    if (typeof callback === "function") callback({ success: false, message: "You do not have access to this project" });
                    return;
                }
            }

            // Parameterized PostgreSQL insert strictly using authenticated socket userId
            const insertRes = await pool.query(`
                INSERT INTO messages (project_id, sender_id, channel, content, created_at)
                VALUES ($1, $2, $3, $4, NOW())
                RETURNING id, project_id, sender_id, channel, content, created_at;
            `, [projectId, Number(userId), channel, content]);

            const inserted = insertRes.rows[0];
            invalidateAllCaches();

            const createdAtIso = inserted.created_at
                ? new Date(inserted.created_at).toISOString()
                : new Date().toISOString();

            const formattedMessage = {
                id: inserted.id,
                _id: inserted.id,
                project: inserted.project_id,
                projectId: inserted.project_id,
                project_id: inserted.project_id,
                channel: inserted.channel || channel,
                sender: {
                    id: user.id,
                    _id: user.id,
                    name: user.name || "Member",
                    email: user.email || "",
                    role: user.role || "student",
                },
                sender_id: user.id,
                sender_name: user.name || "Member",
                content: inserted.content,
                createdAt: createdAtIso,
                created_at: createdAtIso,
            };

            const roomName = `project_${projectId}_${channel}`;
            io.to(roomName).emit("chat:message:new", formattedMessage);
            io.to(roomName).emit("chat_message_received", { message: formattedMessage });

            if (typeof callback === "function") {
                callback({ success: true, data: formattedMessage });
            }
        } catch (err) {
            console.error("[Socket] send_message error:", err.message);
            if (typeof callback === "function") {
                callback({ success: false, message: "Failed to send message" });
            }
        }
    });

    // REAL-TIME MESSAGE DELETE VIA SOCKET ("Delete for Everyone" - Strict Sender Ownership)
    socket.on("delete_message", async (data, callback) => {
        if (!allowSocketEvent(callback)) return;

        try {
            const user = await getAuthenticatedSocketUser();
            const userId = user?.id;

            if (!userId) {
                if (typeof callback === "function") callback({ success: false, message: "Authentication required" });
                return;
            }

            if (isDirector(user)) {
                if (typeof callback === "function") callback({ success: false, message: "Director account does not have access to project chat" });
                return;
            }

            const payload = data && typeof data === "object" ? data : {};
            const projectId = parsePositiveInt(payload.projectId || payload.project);
            const messageId = parsePositiveInt(payload.messageId || payload.id);

            if (!projectId || !messageId) {
                if (typeof callback === "function") callback({ success: false, message: "Valid projectId and messageId are required" });
                return;
            }

            const { rows } = await pool.query(
                "SELECT id, project_id, channel, sender_id FROM messages WHERE id = $1 AND project_id = $2",
                [messageId, projectId]
            );

            if (rows.length === 0) {
                if (typeof callback === "function") callback({ success: false, message: "Message not found" });
                return;
            }

            const targetMessage = rows[0];

            // Strict Sender Ownership Check: ONLY the original author can delete
            if (String(targetMessage.sender_id) !== String(userId)) {
                if (typeof callback === "function") callback({ success: false, message: "You can only delete your own messages" });
                return;
            }

            await pool.query(
                "DELETE FROM messages WHERE id = $1 AND sender_id = $2",
                [messageId, Number(userId)]
            );
            invalidateAllCaches();

            const channel = targetMessage.channel || "official";
            const roomName = `project_${targetMessage.project_id}_${channel}`;
            const deletedPayload = {
                messageId,
                id: messageId,
                _id: messageId,
                projectId: targetMessage.project_id,
                project: targetMessage.project_id,
                channel,
            };

            io.to(roomName).emit("chat:message:deleted", deletedPayload);
            io.to(roomName).emit("message_deleted", deletedPayload);

            if (typeof callback === "function") {
                callback({ success: true, data: deletedPayload });
            }
        } catch (err) {
            console.error("[Socket] delete_message error:", err.message);
            if (typeof callback === "function") {
                callback({ success: false, message: "Failed to delete message" });
            }
        }
    });

    // TYPING INDICATOR (Only allowed for verified joined rooms; identity strictly from socket.data.user)
    socket.on("typing", (data) => {
        if (!allowSocketEvent()) return;

        const user = socket.data?.user;
        const userId = user?.id;
        const payload = data && typeof data === "object" ? data : {};
        const pId = payload.projectId || payload.project;
        const channel = normalizeChannel(payload.channel);
        const projectId = parsePositiveInt(pId);
        if (!projectId || !userId) return;
        const room = `project_${projectId}_${channel}`;
        if (!socket.rooms.has(room)) return;
        socket.to(room).emit("typing", {
            projectId,
            channel,
            userId,
            name: user.name,
            isTyping: Boolean(payload.isTyping ?? true),
        });
    });

    // STOP TYPING INDICATOR
    socket.on("stop_typing", (data) => {
        if (!allowSocketEvent()) return;

        const user = socket.data?.user;
        const userId = user?.id;
        const payload = data && typeof data === "object" ? data : {};
        const pId = payload.projectId || payload.project;
        const channel = normalizeChannel(payload.channel);
        const projectId = parsePositiveInt(pId);
        if (!projectId || !userId) return;
        const room = `project_${projectId}_${channel}`;
        if (!socket.rooms.has(room)) return;
        socket.to(room).emit("stop_typing", {
            projectId,
            channel,
            userId,
            name: user.name,
            isTyping: false,
        });
    });

    socket.on("disconnect", (reason) => {
        if (DEBUG_SOCKETS && authUserId) {
            console.log(`[Socket] Disconnected: User ${authUserId} (${reason})`);
        }
        // Explicitly release references for clean garbage collection under 2,000+ sockets
        socket.data.user = null;
        socket.removeAllListeners();
    });
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use(notFound);
app.use(errorHandler);

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
let isShuttingDown = false;

const shutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`${signal} received. Shutting down CollabX backend...`);

    const forceExit = setTimeout(() => {
        console.error("Graceful shutdown timed out.");
        process.exit(1);
    }, 10000);

    forceExit.unref();

    io.close(async () => {
        try {
            await pool.end();
            console.log("PostgreSQL pool closed.");
            console.log("CollabX shutdown complete.");
            clearTimeout(forceExit);
            process.exit(0);
        } catch (error) {
            console.error("Shutdown error:", error.message);
            process.exit(1);
        }
    });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
});

// ==========================================
// START SERVER
// ==========================================
const startServer = async () => {
    try {
        if (!CLIENT_URL) {
            throw new Error("CLIENT_URL is missing in .env");
        }

        allowedOrigins = parseAllowedOrigins(CLIENT_URL);

        if (allowedOrigins.length === 0) {
            throw new Error("At least one valid CLIENT_URL is required.");
        }

        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
            throw new Error("Please configure a strong JWT_SECRET in .env");
        }

        // Fast lightweight database connectivity check on normal startup
        const dbCheck = await pool.query("SELECT NOW() as db_time;");
        if (process.env.NODE_ENV !== "production") {
            console.log("PostgreSQL Connected:", dbCheck.rows[0].db_time);
        } else {
            console.log("PostgreSQL Connected: OK");
        }

        // Run DDL migrations & indexes only when explicitly requested (or via npm run db:init)
        if (process.env.RUN_DB_MIGRATIONS === "true") {
            await ensureSchemaMigrations();
            console.log("PostgreSQL Schema Migrations: VERIFIED");
            await ensurePerformanceIndexes();
            console.log("PostgreSQL Performance Indexes: VERIFIED");
        }

        startTaskReminderJob(io);

        server.on("error", (error) => {
            if (error.code === "EADDRINUSE") {
                console.error(`[Server Error] Port ${PORT} is already in use (EADDRINUSE). Please free port ${PORT}.`);
            } else {
                console.error("[Server Error]", error.message);
            }
            process.exit(1);
        });

        server.listen(PORT, "0.0.0.0", 2048, () => {
            if (process.env.NODE_ENV === "production") {
                console.log(`CollabX Backend running on port ${PORT} [production]`);
            } else {
                console.log("----------------------------------");
                console.log(`CollabX Backend: http://localhost:${PORT}`);
                console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
                console.log("Database: Supabase PostgreSQL (pg driver, max pool: 20)");
                console.log("Security: Helmet, CORS, RateLimiters, Dual JWT");
                console.log("Real-time Chat, Notifications & Task Scheduler: ENABLED");
                console.log("----------------------------------");
            }
        });
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

startServer();
