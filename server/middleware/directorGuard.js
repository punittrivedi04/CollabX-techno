// Middleware and helpers to enforce Director Account View-Only mode

export const isDirector = (user) => {
    if (!user) return false;
    const role = String(user.role || "").toLowerCase().trim();
    return role === "director";
};

// Middleware to block Director from accessing restricted routes (e.g., tasks, chat messages)
export const blockDirector = (customMessage) => (req, res, next) => {
    if (isDirector(req.user)) {
        return res.status(403).json({
            success: false,
            message:
                customMessage ||
                "Director operates in executive view-only mode and does not have access to this resource.",
        });
    }
    next();
};

// Middleware to block mutation requests (POST, PUT, PATCH, DELETE) for Director
export const blockDirectorMutations = (customMessage) => (req, res, next) => {
    if (isDirector(req.user)) {
        const method = String(req.method || "").toUpperCase();
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
            return res.status(403).json({
                success: false,
                message:
                    customMessage ||
                    "Director operates in read-only executive mode. Modifications are not permitted.",
            });
        }
    }
    next();
};

// Middleware to enforce Director-only read-only executive portal access
export const enforceDirectorReadOnly = (req, res, next) => {
    if (!isDirector(req.user)) {
        return res.status(403).json({
            success: false,
            message: "Access denied. Executive Director privileges required.",
        });
    }

    const method = String(req.method || "").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
        return res.status(403).json({
            success: false,
            message: "Director operates in read-only executive mode. Modifications are not permitted.",
        });
    }

    const pathLower = String(req.path || "").toLowerCase();
    if (pathLower.includes("chat") || pathLower.includes("unofficial") || pathLower.includes("message")) {
        return res.status(403).json({
            success: false,
            message: "Director account does not have access to student chat channels.",
        });
    }

    return next();
};

export default {
    isDirector,
    blockDirector,
    blockDirectorMutations,
    enforceDirectorReadOnly,
};
