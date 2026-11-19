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

/**
 * 1. STRICT AUTH LIMITER
 * Protects /api/auth/login and /api/auth/register against brute-force and credential stuffing.
 * Threshold: Max 10 attempts per 15 minutes per IP + 15 min progressive lockout.
 */
export const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many authentication attempts. Please try again in 15 minutes.",
    code: "TOO_MANY_AUTH_ATTEMPTS",
    lockoutDurationMs: 15 * 60 * 1000,
    keyGenerator: (req) => {
        const ip = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
        return `auth:${ip}`;
    },
});

/**
 * 2. WRITE / MUTATION LIMITER
 * Applied to POST, PUT, PATCH, DELETE operations.
 * Threshold: Max 60 requests per minute per authenticated user (or IP if unauthenticated).
 * Prevents star-toggling, task flooding, and chat spam.
 */
export const mutationRateLimiter = (req, res, next) => {
    // Only limit mutation methods
    const method = req.method;
    if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
        return next();
    }

    // Skip health checks or unauthenticated login/register (they have their own authRateLimiter)
    if (req.path.startsWith("/auth/login") || req.path.startsWith("/auth/register") || req.path === "/health") {
        return next();
    }

    const key = req.user?.id ? `mut:user:${req.user.id}` : `mut:ip:${req.ip || "unknown"}`;
    const limiter = createRateLimiter({
        windowMs: 60 * 1000, // 1 minute
        max: 60,
        message: "Too many write requests. Please slow down.",
        code: "MUTATION_RATE_LIMIT",
        keyGenerator: () => key,
    });

    return limiter(req, res, next);
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
    mutationRateLimiter,
    globalRateLimiter,
};
