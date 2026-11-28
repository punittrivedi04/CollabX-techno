/**
 * server/middleware/sanitizeAndValidate.js
 *
 * Centralized Input Sanitization, Payload Size Caps & Schema Validation for CollabX.
 * Recursively cleans incoming payloads: strips null bytes, neutralizes XSS vectors,
 * enforces strict URL protocols (http/https only), and validates standard formats
 * (email, roll_no) without altering valid business logic or legitimate values.
 */

const PASSWORD_FIELD_NAMES = new Set([
    "password",
    "currentpassword",
    "newpassword",
    "confirmpassword",
]);

const URL_FIELD_NAMES = new Set([
    "githuburl",
    "github_url",
    "demourl",
    "demo_url",
    "ppturl",
    "ppt_url",
    "repourl",
    "repo_url",
    "websiteurl",
    "website_url",
    "avatarurl",
    "avatar_url",
]);

const DANGEROUS_PATTERNS = [
    /<\s*script\b[^>]*>([\s\S]*?)<\s*\/\s*script\s*>/gi,
    /<\s*script\b[^>]*>/gi,
    /<\s*\/\s*script\s*>/gi,
    /javascript\s*:/gi,
    /vbscript\s*:/gi,
    /data\s*:\s*text\/html/gi,
    /on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, // onerror=..., onload=..., etc.
];

const ROLL_NO_PATTERN = /^[A-Z0-9]{2,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sanitizes a single text string by stripping null bytes and neutralizing XSS vectors.
 */
export const sanitizeText = (input) => {
    if (typeof input !== "string") return input;

    // 1. Strip null bytes
    let clean = input.replace(/\0/g, "").replace(/\\u0000/g, "");

    // 2. Neutralize dangerous script & event handler patterns
    for (const pattern of DANGEROUS_PATTERNS) {
        clean = clean.replace(pattern, "");
    }

    return clean.trim();
};

/**
 * Validates whether a given URL is a safe http:// or https:// address.
 */
export const isSafeHttpUrl = (url) => {
    if (!url || typeof url !== "string") return true; // empty / null allowed
    const trimmed = url.trim();
    if (!trimmed) return true;
    if (trimmed.length > 500) return false;

    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
};

/**
 * Recursively traverses and sanitizes nested objects and arrays.
 */
const deepSanitize = (target, errors = [], fieldPath = "") => {
    if (target === null || target === undefined) return target;

    if (typeof target === "string") {
        return sanitizeText(target);
    }

    if (Array.isArray(target)) {
        return target.map((item, idx) => deepSanitize(item, errors, `${fieldPath}[${idx}]`));
    }

    if (typeof target === "object" && !(target instanceof Date)) {
        const sanitizedObj = {};
        for (const [key, value] of Object.entries(target)) {
            // Check for prototype pollution attempt
            if (key === "__proto__" || key === "constructor" || key === "prototype") {
                continue;
            }

            const currentPath = fieldPath ? `${fieldPath}.${key}` : key;
            const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");

            // 0. Preserve password characters verbatim (strip only null bytes, no trimming/regex mutation)
            if (PASSWORD_FIELD_NAMES.has(normalizedKey) && typeof value === "string") {
                sanitizedObj[key] = value.replace(/\0/g, "").replace(/\\u0000/g, "");
                continue;
            }

            // 1. URL validation for known deliverable fields
            if (URL_FIELD_NAMES.has(normalizedKey) && typeof value === "string" && value.trim()) {
                if (!isSafeHttpUrl(value)) {
                    errors.push(`Field '${key}' must be a valid http:// or https:// URL (max 500 characters)`);
                }
            }

            // 2. Roll number validation
            if ((normalizedKey === "rollno" || normalizedKey === "rollnumber") && typeof value === "string" && value.trim()) {
                const upperRoll = value.trim().toUpperCase();
                if (!ROLL_NO_PATTERN.test(upperRoll)) {
                    errors.push("Roll number / Faculty ID must contain 2 to 30 alphanumeric characters (uppercase letters and digits only)");
                }
                sanitizedObj[key] = upperRoll;
                continue;
            }

            // 3. Email format validation (only for explicit email fields in body)
            if (normalizedKey === "email" && typeof value === "string" && value.trim()) {
                const cleanEmail = value.trim().toLowerCase();
                if (cleanEmail.length > 254 || !EMAIL_PATTERN.test(cleanEmail)) {
                    errors.push("Please provide a valid email address");
                }
                sanitizedObj[key] = cleanEmail;
                continue;
            }

            sanitizedObj[key] = deepSanitize(value, errors, currentPath);
        }
        return sanitizedObj;
    }

    return target;
};

/**
 * Express middleware for centralized input sanitization and schema validation.
 */
export const sanitizeAndValidate = (req, res, next) => {
    const validationErrors = [];

    if (req.body && typeof req.body === "object") {
        req.body = deepSanitize(req.body, validationErrors, "body");
    }

    if (req.query && typeof req.query === "object") {
        req.query = deepSanitize(req.query, validationErrors, "query");
    }

    if (req.params && typeof req.params === "object") {
        req.params = deepSanitize(req.params, validationErrors, "params");
    }

    if (validationErrors.length > 0) {
        return res.status(400).json({
            success: false,
            code: "VALIDATION_ERROR",
            message: validationErrors[0],
            errors: validationErrors,
        });
    }

    next();
};

export default sanitizeAndValidate;
