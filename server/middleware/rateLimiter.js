/**
 * server/middleware/rateLimiter.js
 *
 * Custom In-Memory Sliding-Window Rate Limiter & Brute-Force Protection for CollabX.
 * Zero external Redis dependency; uses bounded sliding-window time buckets with
 * automatic background eviction to ensure constant memory footprint.
 */

class SlidingWindowStore {
    constructor(cleanupIntervalMs = 60000, maxEntries = 50000) {
        this.hits = new Map();
        this.maxEntries = maxEntries;

        const timer = setInterval(() => this.cleanup(), cleanupIntervalMs);
        if (timer.unref) timer.unref();
    }

    cleanup() {
        const now = Date.now();
        for (const [key, record] of this.hits.entries()) {
            if (record.resetTime <= now) {
                this.hits.delete(key);
            }
        }
    }

    recordHit(key, windowMs) {
        const now = Date.now();
        let record = this.hits.get(key);

        if (!record || record.resetTime <= now) {
            record = {
                count: 1,
                resetTime: now + windowMs,
                firstSeen: now,
                lockoutUntil: 0,
            };
            if (this.hits.size >= this.maxEntries) {
                // Evict oldest entry
                const firstKey = this.hits.keys().next().value;
                if (firstKey) this.hits.delete(firstKey);
            }
            this.hits.set(key, record);
            return { count: 1, resetTime: record.resetTime, locked: false, lockoutRemaining: 0 };
        }

        if (record.lockoutUntil > now) {
            return {
                count: record.count,
                resetTime: record.resetTime,
                locked: true,
                lockoutRemaining: Math.ceil((record.lockoutUntil - now) / 1000),
            };
        }

        record.count += 1;
        return { count: record.count, resetTime: record.resetTime, locked: false, lockoutRemaining: 0 };
    }

    applyLockout(key, lockoutMs) {
        const now = Date.now();
        const record = this.hits.get(key);
        if (record) {
            record.lockoutUntil = now + lockoutMs;
        }
    }

    reset(key) {
        this.hits.delete(key);
    }
}

const sharedStore = new SlidingWindowStore();

/**
 * Creates a configurable sliding-window rate limiting middleware.
 */
export const createRateLimiter = ({
    windowMs = 60000,
    max = 60,
    message = "Too many requests. Please try again later.",
    code = "RATE_LIMIT_EXCEEDED",
    keyGenerator = (req) => req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
    skip = () => false,
    lockoutDurationMs = 0,
}) => {
    return (req, res, next) => {
        if (skip(req)) {
            return next();
        }

        const key = keyGenerator(req);
        const { count, resetTime, locked, lockoutRemaining } = sharedStore.recordHit(key, windowMs);
        const remaining = Math.max(0, max - count);
        const resetSeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));

        res.setHeader("RateLimit-Limit", max);
        res.setHeader("RateLimit-Remaining", remaining);
        res.setHeader("RateLimit-Reset", resetSeconds);

        if (locked || count > max) {
            const retryAfter = lockoutRemaining > 0 ? lockoutRemaining : resetSeconds;
            res.setHeader("Retry-After", retryAfter);

            if (lockoutDurationMs > 0 && !locked) {
                sharedStore.applyLockout(key, lockoutDurationMs);
            }

            return res.status(429).json({
                success: false,
                code,
                message,
                retryAfter,
            });
        }

        next();
    };
};

const getClientIp = (req) => {
    const forwarded = req.headers?.["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
    }
    return req.ip || "127.0.0.1";
};

const getEmailKeyPart = (req) => {
    const raw = req.body?.email;
    return typeof raw === "string" && raw.trim()
        ? raw.trim().toLowerCase().slice(0, 120)
        : "anon";
};

/**
 * 1. STRICT AUTH LIMITER
 * Protects /api/auth/register and /api/auth/refresh against brute-force and abuse.
 * Threshold: Max 10 attempts per 15 minutes per IP + 15 min progressive lockout.
 */
export const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many authentication attempts. Please try again in 15 minutes.",
    code: "TOO_MANY_AUTH_ATTEMPTS",
    lockoutDurationMs: 15 * 60 * 1000,
    keyGenerator: (req) => `auth:${getClientIp(req)}`,
});

/**
 * 1b. STRICT LOGIN LIMITER
 * Protects POST /api/auth/login: max 8 attempts per 15 minutes per IP/email.
 */
export const loginRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 8,
    message: "Too many login attempts. Please try again in 15 minutes.",
    code: "TOO_MANY_LOGIN_ATTEMPTS",
    lockoutDurationMs: 15 * 60 * 1000,
    keyGenerator: (req) => `login:${getClientIp(req)}:${getEmailKeyPart(req)}`,
});

/**
 * 1c. PASSWORD RESET / FORGOT PASSWORD LIMITER
 * Protects POST /api/auth/forgot-password & /reset-password: max 5 attempts per 15 minutes.
 */
export const passwordResetRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Too many password reset attempts. Please wait 15 minutes before trying again.",
    code: "TOO_MANY_RESET_ATTEMPTS",
    lockoutDurationMs: 15 * 60 * 1000,
    keyGenerator: (req) => `pwreset:${getClientIp(req)}:${getEmailKeyPart(req)}`,
});

/**
 * 1d. OTP VERIFY & RESEND LIMITER
 * Protects POST /api/auth/verify-otp & /resend-otp against brute-force guessing and email spam.
 */
export const otpVerifyResendRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many OTP requests. Please wait a few minutes before trying again.",
    code: "TOO_MANY_OTP_REQUESTS",
    keyGenerator: (req) => `otp:${getClientIp(req)}:${getEmailKeyPart(req)}`,
});

/**
 * 2. WRITE / MUTATION LIMITER
 * Applied to POST, PUT, PATCH, DELETE operations.
 * Threshold: Max 60 requests per minute per authenticated user (or IP if unauthenticated).
 * Prevents star-toggling, task flooding, and chat spam.
 */
const mutationLimiterInstance = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    message: "Too many write requests. Please slow down.",
    code: "MUTATION_RATE_LIMIT",
    keyGenerator: (req) => (req.user?.id ? `mut:user:${req.user.id}` : `mut:ip:${getClientIp(req)}`),
});

export const mutationRateLimiter = (req, res, next) => {
    const method = req.method;
    if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
        return next();
    }

    // Auth endpoints use their dedicated strict brute-force limiters
    if (
        req.path.startsWith("/auth/login") ||
        req.path.startsWith("/auth/register") ||
        req.path.startsWith("/auth/forgot-password") ||
        req.path.startsWith("/auth/reset-password") ||
        req.path.startsWith("/auth/verify-otp") ||
        req.path.startsWith("/auth/resend-otp") ||
        req.path === "/health"
    ) {
        return next();
    }

    return mutationLimiterInstance(req, res, next);
};

/**
 * 3. GLOBAL API LIMITER
 * Protects all /api/* routes against denial-of-service and high-frequency scraping.
 * Campus NAT-Safe: Keys by Bearer token when present so thousands of campus students
 * sharing a single college gateway IP each receive an independent quota bucket.
 * Threshold: Max 200 requests per minute per authenticated user / client IP.
 */
export const globalRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 200,
    message: "Too many requests. Please try again later.",
    code: "GLOBAL_RATE_LIMIT",
    skip: (req) => req.path === "/api/health" || req.path === "/health",
    keyGenerator: (req) => {
        const auth = req.headers.authorization;
        if (auth && typeof auth === "string" && auth.startsWith("Bearer ")) {
            return `global:token:${auth.slice(-32)}`;
        }
        const forwarded = req.headers["x-forwarded-for"];
        const clientIp = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : (req.ip || "127.0.0.1");
        return `global:ip:${clientIp}`;
    },
});

export default {
    createRateLimiter,
    authRateLimiter,
    loginRateLimiter,
    passwordResetRateLimiter,
    otpVerifyResendRateLimiter,
    mutationRateLimiter,
    globalRateLimiter,
};
