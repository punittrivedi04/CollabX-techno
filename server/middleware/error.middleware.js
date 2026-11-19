
const PG_SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;
const INTERNAL_LEAK_PATTERN =
    /\b(relation|column|syntax error|pg_|postgres|psql|select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from|constraint)\b/i;

const isPostgresError = (error) =>
    Boolean(
        error &&
            (error.severity ||
                error.routine ||
                error.table ||
                error.column ||
                error.constraint ||
                error.detail ||
                (typeof error.code === "string" && PG_SQLSTATE_PATTERN.test(error.code)))
    );

const mapPostgresError = (code) => {
    switch (code) {
        case "22P02":
            return { status: 400, message: "Invalid identifier or input format." };
        case "22003":
            return { status: 400, message: "Numeric value out of allowed range." };
        case "23505":
            return { status: 409, message: "A conflicting record already exists." };
        case "23503":
            return { status: 400, message: "Referenced resource does not exist." };
        case "23502":
        case "23514":
            return { status: 400, message: "Invalid or missing required field." };
        default:
            return { status: 500, message: "Internal Server Error" };
    }
};

const notFound = (req, res, next) => {
    const error = new Error("Route not found");
    error.statusCode = 404;
    next(error);
};

const errorHandler = (error, req, res, next) => {
    // Log detailed error only on the server (never sent to client)
    console.error("Backend Error:", {
        message: error.message,
        code: error.code,
        url: req.originalUrl,
        method: req.method,
    });

    if (res.headersSent) {
        return next(error);
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({
            success: false,
            message: "Request payload exceeds the maximum allowed size (100KB).",
        });
    }

    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({
            success: false,
            message: "Malformed JSON request payload.",
        });
    }

    if (error.message === "Origin not allowed by CORS") {
        return res.status(403).json({
            success: false,
            message: "Origin not allowed by CORS policy.",
        });
    }

    // Never leak PostgreSQL error details, SQLSTATE messages, table/column names, or stack traces
    if (isPostgresError(error)) {
        const mapped = mapPostgresError(error.code);
        return res.status(mapped.status).json({
            success: false,
            message: mapped.message,
        });
    }

    const statusCode =
        Number.isInteger(error.statusCode) &&
            error.statusCode >= 400 &&
            error.statusCode <= 599
            ? error.statusCode
            : 500;

    let message = "Internal Server Error";
    if (statusCode === 404) {
        message = "Route not found";
    } else if (statusCode < 500 && typeof error.message === "string") {
        message = INTERNAL_LEAK_PATTERN.test(error.message)
            ? "Invalid request."
            : error.message;
    }

    return res.status(statusCode).json({
        success: false,
        message,
    });
};

export { notFound, errorHandler };
