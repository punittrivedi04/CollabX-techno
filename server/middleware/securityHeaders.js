/**
 * server/middleware/securityHeaders.js
 *
 * Custom HTTP Security Headers & Strict CORS Middleware for CollabX.
 * Provides defense-in-depth header protections and strict origin controls
 * compatible with Vite/React single-page applications and Socket.IO websockets.
 */

export const securityHeaders = (req, res, next) => {
    // 1. Prevent MIME-type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");

    // 2. Clickjacking protection: disallow embedding in iframes
    res.setHeader("X-Frame-Options", "DENY");

    // 3. Referrer Policy: send origin only on cross-origin requests
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // 4. Permissions Policy: disable sensitive browser hardware APIs
    res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );

    // 5. Strict-Transport-Security: enforce HTTPS (HSTS)
    if (process.env.NODE_ENV === "production") {
        res.setHeader(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains; preload"
        );
    }

    // 6. DNS Prefetch Control
    res.setHeader("X-DNS-Prefetch-Control", "off");

    // 7. Cross-Origin Policies
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    // 8. Custom Content-Security-Policy (CSP) compatible with Vite, React, Tailwind, and Socket.IO
    const cspDirectives = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' ws: wss: http://localhost:* https://*",
        "media-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ];
    res.setHeader("Content-Security-Policy", cspDirectives.join("; "));

    next();
};

/**
 * Strict CORS Configuration Factory.
 * Enforces explicit trusted origins list and prevents wildcard `*` with credentials.
 */
export const createCorsOptions = (getAllowedOrigins) => {
    return {
        origin: (origin, callback) => {
            const allowed = typeof getAllowedOrigins === "function"
                ? getAllowedOrigins()
                : (Array.isArray(getAllowedOrigins) ? getAllowedOrigins : []);

            // Allow requests with no origin (e.g. mobile apps, same-origin, curl, server-to-server)
            if (!origin) {
                return callback(null, true);
            }

            const normalizedOrigin = String(origin || "").trim().replace(/\/+$/, "");

            if (allowed.includes(origin) || allowed.includes(normalizedOrigin)) {
                return callback(null, true);
            }

            return callback(new Error("Origin not allowed by CORS"));
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "x-refresh-token", "X-Requested-With"],
        credentials: true,
        maxAge: 86400, // 24 hours
    };
};

export default securityHeaders;
