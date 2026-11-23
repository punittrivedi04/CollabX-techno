import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { safeUser, parsePositiveInt, pickAllowedFields } from "../utils/formatters.js";
import { sendOtpEmail, sendWelcomeEmail } from "../utils/sendEmail.js";
import {
    MicroCache,
    invalidateUserCache,
    revokeUserTokens,
    getTokenRevocationTime,
} from "../utils/microCache.js";

const generateSecureOtp = () => String(crypto.randomInt(100000, 1000000));
const VALID_OTP_PURPOSES = new Set(["signup", "reset_password"]);

// Bounded in-memory brute-force protection (shared-server safe, zero DB bloat)
const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginAttemptsCache = new MicroCache({ maxEntries: 1000, ttlMs: LOGIN_LOCKOUT_MS });

const MAX_OTP_ATTEMPTS = 5;
const otpAttemptsCache = new MicroCache({ maxEntries: 1000, ttlMs: 5 * 60 * 1000 });
const consumedOtpTokens = new MicroCache({ maxEntries: 2000, ttlMs: 3 * 60 * 1000 });

const hashKey = (str) => crypto.createHash("sha256").update(String(str)).digest("hex").slice(0, 24);

const createAccessToken = (userId) => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is missing in environment variables");
    }
    const minIatMs = getTokenRevocationTime(userId) + 1;
    const iatMs = Math.max(Date.now(), minIatMs);
    return jwt.sign(
        { id: Number(userId), iatMs },
        process.env.JWT_SECRET,
        { expiresIn: "15m", algorithm: "HS256" }
    );
};

const createRefreshToken = (userId) => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is missing in environment variables");
    }
    return jwt.sign(
        { id: Number(userId), type: "refresh" },
        process.env.JWT_SECRET,
        { expiresIn: "7d", algorithm: "HS256" }
    );
};

const setRefreshTokenCookie = (res, token) => {
    res.cookie("refreshToken", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
};

// ==========================================
// 1. LOGIN
// ==========================================
export const loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body || {};

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password ||
            email.trim().length > 254 ||
            password.length > 128
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid email and password are required",
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        // Per-account brute-force lockout check (independent of campus NAT IP)
        const attemptRecord = loginAttemptsCache.get(cleanEmail);
        if (attemptRecord && attemptRecord.count >= MAX_FAILED_LOGINS) {
            return res.status(429).json({
                success: false,
                code: "ACCOUNT_LOCKED",
                message: "Too many failed login attempts for this account. Please try again in 15 minutes or reset your password.",
            });
        }

        // 1. Check if user exists
        const { rows } = await pool.query(`
            SELECT id, name, email, password_hash, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at
            FROM users
            WHERE LOWER(email) = LOWER($1);
        `, [cleanEmail]);

        if (rows.length === 0) {
            // Constant-time compare against dummy hash to prevent user enumeration via timing
            await bcrypt.compare(password, "$2a$12$e8Yk26V1Pfx5XJ8l2s7.OeO3iVd6L0yGv4l6hN1K2rO9tW6Y5Z2e.");
            return res.status(401).json({
                success: false,
                code: "INVALID_CREDENTIALS",
                message: "Invalid email or password.",
            });
        }

        const user = rows[0];

        // Ensure verified @technonjr.org accounts are auto-approved and bypass the approval queue
        const isTechnoNjr = cleanEmail.endsWith("@technonjr.org");
        if (isTechnoNjr && user.is_verified && (user.is_active === false || user.role_classified === false)) {
            await pool.query(
                "UPDATE users SET is_active = TRUE, role_classified = TRUE WHERE id = $1;",
                [user.id]
            );
            user.is_active = true;
            user.role_classified = true;
        }

        if (user.is_active === false && user.role_classified === false) {
            return res.status(403).json({
                success: false,
                code: "AWAITING_APPROVAL",
                message: "Your account is awaiting Admin approval and role classification.",
            });
        }

        if (user.is_active === false) {
            return res.status(403).json({
                success: false,
                code: "ACCOUNT_DEACTIVATED",
                message: "Your account has been deactivated. Please contact an administrator.",
            });
        }

        // 2. Validate password
        const passwordMatches = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatches) {
            const nextCount = (attemptRecord?.count || 0) + 1;
            loginAttemptsCache.set(cleanEmail, { count: nextCount }, LOGIN_LOCKOUT_MS);
            if (nextCount >= MAX_FAILED_LOGINS) {
                return res.status(429).json({
                    success: false,
                    code: "ACCOUNT_LOCKED",
                    message: "Too many failed login attempts for this account. Please try again in 15 minutes or reset your password.",
                });
            }
            return res.status(401).json({
                success: false,
                code: "INVALID_CREDENTIALS",
                message: "Invalid email or password.",
            });
        }

        // Clear failed-attempt counter on successful authentication
        loginAttemptsCache.delete(cleanEmail);

        // 3. Issue dual JWTs
        const accessToken = createAccessToken(user.id);
        const refreshToken = createRefreshToken(user.id);
        const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

        await pool.query(
            "UPDATE users SET refresh_token_hash = $1 WHERE id = $2;",
            [refreshTokenHash, user.id]
        );

        setRefreshTokenCookie(res, refreshToken);

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token: accessToken,
            accessToken,
            refreshToken,
            user: safeUser(user),
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 2. REGISTER (Strict Field Allowlist - Prevents Role/Status Mass Assignment)
// ==========================================
export const registerUser = async (req, res, next) => {
    try {
        // Explicitly allowlist only safe signup fields; ignore any injected role/is_verified/is_active
        const { name, email, password, roll_no, rollNumber } = pickAllowedFields(req.body, [
            "name",
            "email",
            "password",
            "roll_no",
            "rollNumber",
        ]);

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid name, email, and password are required",
            });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

        if (!cleanName || !cleanEmail || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email, and password are required",
            });
        }

        if (cleanName.length < 2 || cleanName.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Name must contain 2 to 100 characters",
            });
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (cleanEmail.length > 254 || !emailPattern.test(cleanEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address",
            });
        }

        if (typeof password !== "string" || password.length < 8 || password.length > 128) {
            return res.status(400).json({
                success: false,
                message: "Password must contain 8 to 128 characters",
            });
        }

        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least one uppercase letter, one lowercase letter, and one number",
            });
        }

        // Check if user already exists
        const existingCheck = await pool.query(
            "SELECT id, is_verified FROM users WHERE LOWER(email) = LOWER($1)",
            [cleanEmail]
        );

        const passwordHash = await bcrypt.hash(password, 12);

        // Auto-uppercase and strip/block spaces, dashes, slashes, and special characters
        let cleanRollNo = null;
        const rawRoll = roll_no !== undefined ? roll_no : rollNumber;
        if (typeof rawRoll === "string" && rawRoll.trim()) {
            const sanitized = rawRoll.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
            if (sanitized) {
                if (!/^[A-Z0-9]+$/.test(sanitized)) {
                    return res.status(400).json({
                        success: false,
                        message: "Roll number must be alphanumeric (uppercase letters and numbers only)",
                    });
                }
                if (sanitized.length > 50) {
                    return res.status(400).json({
                        success: false,
                        message: "Roll number cannot exceed 50 characters",
                    });
                }
                cleanRollNo = sanitized;
            }
        }

        // If not explicitly provided in body, fallback to extracting from email prefix if technonjr.org
        if (!cleanRollNo) {
            const [prefix, emailDomain] = cleanEmail.split("@");
            if (emailDomain === "technonjr.org" && prefix) {
                const rollMatch = prefix.match(/^(\d{2}etc[a-z]{2,}\d+)/i);
                if (rollMatch) {
                    cleanRollNo = rollMatch[1].replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
                }
            }
        }

        // Check email domain for Techno NJR institutional auto-approval
        const isTechnoNjr = cleanEmail.endsWith("@technonjr.org");
        let isNewPendingSignup = false;
        let createdUserId = null;

        if (existingCheck.rows.length > 0) {
            const existingUser = existingCheck.rows[0];
            if (existingUser.is_verified) {
                return res.status(409).json({
                    success: false,
                    code: "USER_EXISTS",
                    message: "Account already exists. Please login instead.",
                });
            }

            // Update unverified user credentials
            // @technonjr.org accounts are auto-approved (is_active=TRUE, role_classified=TRUE)
            // Non-technonjr accounts stay pending Admin approval & role classification
            const updateRes = await pool.query(`
                UPDATE users
                SET name = $1,
                    password_hash = $2,
                    roll_no = COALESCE($3, roll_no),
                    is_active = $4,
                    role_classified = $5
                WHERE id = $6
                RETURNING id;
            `, [cleanName, passwordHash, cleanRollNo, isTechnoNjr, isTechnoNjr, existingUser.id]);
            createdUserId = updateRes.rows[0]?.id || existingUser.id;
        } else {
            // Create new user: @technonjr.org accounts bypass approval queue directly with Student role
            const insertRes = await pool.query(`
                INSERT INTO users (name, email, password_hash, roll_no, role, is_verified, is_active, role_classified, created_at)
                VALUES ($1, $2, $3, $4, 'student', FALSE, $5, $6, NOW())
                RETURNING id;
            `, [cleanName, cleanEmail, passwordHash, cleanRollNo, isTechnoNjr, isTechnoNjr]);
            isNewPendingSignup = true;
            createdUserId = insertRes.rows[0]?.id;
        }

        // Send notifications (Admin notification + User welcome notification)
        try {
            const adminRes = await pool.query(`
                SELECT id
                FROM users
                WHERE LOWER(role) IN ('admin', 'coordinator')
                  AND is_active = TRUE;
            `);
            const io = req.app.get("io");

            const adminNotifTitle = isTechnoNjr
                ? "New @technonjr.org Account Created"
                : "New Account Awaiting Approval";
            const adminNotifMsg = isTechnoNjr
                ? `${cleanName} (${cleanEmail}${cleanRollNo ? ` · Roll: ${cleanRollNo}` : ""}) registered an institutional account with Student access.`
                : `${cleanName} (${cleanEmail}) registered and is awaiting Admin approval and role classification. Review at /admin/roles`;
            const adminNotifType = isTechnoNjr ? "account_created" : "role_approval";
            const adminNotifLink = isTechnoNjr ? "/admin/students" : "/admin/roles";

            for (const admin of adminRes.rows) {
                const ins = await pool.query(
                    `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                     VALUES ($1, $2, $3, $4, FALSE, NOW())
                     RETURNING id, title, message, type, is_read, created_at;`,
                    [admin.id, adminNotifTitle, adminNotifMsg, adminNotifType]
                );
                if (io && ins.rows[0]) {
                    io.to(`user:${admin.id}`).emit("notification:new", {
                        id: ins.rows[0].id,
                        _id: ins.rows[0].id,
                        title: ins.rows[0].title,
                        message: ins.rows[0].message,
                        type: ins.rows[0].type,
                        link: adminNotifLink,
                        isRead: false,
                        createdAt: ins.rows[0].created_at,
                    });
                }
            }

            // User-side welcome/account-created notification
            if (createdUserId) {
                const userNotifTitle = isTechnoNjr
                    ? "Welcome to CollabX!"
                    : "Registration Received";
                const userNotifMsg = isTechnoNjr
                    ? `Welcome to CollabX, ${cleanName}! Your @technonjr.org institutional account has been successfully created with Student access.`
                    : `Hello ${cleanName}, your account has been registered and is pending administrator approval and role classification.`;
                const userNotifType = isTechnoNjr ? "welcome" : "system";

                await pool.query(
                    `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                     VALUES ($1, $2, $3, $4, FALSE, NOW());`,
                    [createdUserId, userNotifTitle, userNotifMsg, userNotifType]
                );
            }
        } catch (notifErr) {
            console.warn("[Signup Notification] Failed:", notifErr.message);
        }

        // Non-blocking welcome email delivery for institutional accounts
        if (isTechnoNjr) {
            sendWelcomeEmail({ to: cleanEmail, name: cleanName, role: "student" }).catch((emailErr) => {
                console.warn("[Welcome Email Notice] Non-blocking delivery:", emailErr.message);
            });
        }

        invalidateUserCache();

        // Generate cryptographically secure 6-digit numeric OTP and 2-minute signed token
        const otp = generateSecureOtp();
        const otpHash = await bcrypt.hash(otp, 10);

        const otpToken = jwt.sign(
            { email: cleanEmail, otpHash, purpose: "signup" },
            process.env.JWT_SECRET,
            { expiresIn: "2m", algorithm: "HS256" }
        );

        // Send branded dark-themed OTP email
        const emailResult = await sendOtpEmail({
            to: cleanEmail,
            name: cleanName,
            otp,
            purpose: "signup",
        });

        if (!emailResult?.sent) {
            console.error(`[Register] Failed to dispatch OTP to ${cleanEmail}:`, emailResult?.reason);
            return res.status(502).json({
                success: false,
                code: "EMAIL_DISPATCH_FAILED",
                message: "Account created, but failed to deliver verification code to your email. Please try requesting a new code.",
                reason: process.env.NODE_ENV !== "production" ? emailResult?.reason : undefined,
                otpToken,
                email: cleanEmail,
            });
        }

        return res.status(200).json({
            success: true,
            message: "Verification OTP sent to your email. Valid for 2 minutes.",
            otpToken,
            email: cleanEmail,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 3. VERIFY OTP (Signup & Reset)
// ==========================================
export const verifyOtp = async (req, res, next) => {
    try {
        const { email, otp, otpToken } = pickAllowedFields(req.body, [
            "email",
            "otp",
            "otpToken",
        ]);

        if (
            typeof email !== "string" ||
            typeof otpToken !== "string" ||
            !email.trim() ||
            email.trim().length > 254 ||
            otp === undefined ||
            otp === null ||
            !String(otp).trim() ||
            !otpToken.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Email, OTP code, and otpToken are required",
            });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanOtp = String(otp).trim();
        const tokenAttemptKey = hashKey(otpToken);

        if (consumedOtpTokens.get(tokenAttemptKey)) {
            return res.status(400).json({
                success: false,
                code: "OTP_ALREADY_USED",
                message: "This verification code has already been used. Please request a new code if needed.",
            });
        }

        const prevOtpAttempts = otpAttemptsCache.get(tokenAttemptKey) || 0;
        if (prevOtpAttempts >= MAX_OTP_ATTEMPTS) {
            return res.status(429).json({
                success: false,
                code: "OTP_LOCKED",
                message: "Too many invalid OTP attempts. Please request a new verification code.",
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(otpToken, process.env.JWT_SECRET, {
                algorithms: ["HS256"],
            });
        } catch (jwtErr) {
            if (jwtErr.name === "TokenExpiredError") {
                return res.status(400).json({
                    success: false,
                    code: "OTP_EXPIRED",
                    message: "OTP has expired (2-minute limit). Please request a new code.",
                });
            }
            return res.status(400).json({
                success: false,
                code: "INVALID_TOKEN",
                message: "Invalid or expired OTP token. Please request a new code.",
            });
        }

        if (
            !decoded ||
            typeof decoded.otpHash !== "string" ||
            !VALID_OTP_PURPOSES.has(decoded.purpose) ||
            decoded.email !== cleanEmail
        ) {
            return res.status(400).json({
                success: false,
                message: "OTP token does not match the provided email address",
            });
        }

        const isMatch = await bcrypt.compare(cleanOtp, decoded.otpHash);
        if (!isMatch) {
            otpAttemptsCache.set(tokenAttemptKey, prevOtpAttempts + 1);
            return res.status(400).json({
                success: false,
                code: "INVALID_OTP",
                message: "Invalid 6-digit verification code. Please check your email and try again.",
            });
        }

        consumedOtpTokens.set(tokenAttemptKey, true);
        otpAttemptsCache.delete(tokenAttemptKey);

        // If purpose is signup, mark email verified; @technonjr.org accounts are auto-activated
        if (decoded.purpose === "signup") {
            const isTechnoNjr = cleanEmail.endsWith("@technonjr.org");
            const updateRes = await pool.query(`
                UPDATE users
                SET is_verified = TRUE,
                    is_active = CASE WHEN $2::boolean THEN TRUE ELSE is_active END,
                    role_classified = CASE WHEN $2::boolean THEN TRUE ELSE role_classified END
                WHERE LOWER(email) = LOWER($1)
                RETURNING id, name, email, roll_no, role, phone, mentor_id, role_classified, is_verified, is_active, created_at;
            `, [cleanEmail, isTechnoNjr]);

            if (updateRes.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    code: "USER_NOT_FOUND",
                    message: "User account not found.",
                });
            }

            const user = updateRes.rows[0];
            invalidateUserCache();

            if (user.is_active === false && user.role_classified === false) {
                return res.status(200).json({
                    success: true,
                    pendingApproval: true,
                    code: "AWAITING_APPROVAL",
                    message: "Email verified! Your account is awaiting Admin approval and role classification.",
                    user: safeUser(user),
                });
            }

            if (user.is_active === false) {
                return res.status(403).json({
                    success: false,
                    code: "ACCOUNT_DEACTIVATED",
                    message: "Your account has been deactivated. Please contact an administrator.",
                });
            }

            const accessToken = createAccessToken(user.id);
            const refreshToken = createRefreshToken(user.id);
            const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

            await pool.query(
                "UPDATE users SET refresh_token_hash = $1 WHERE id = $2;",
                [refreshTokenHash, user.id]
            );

            setRefreshTokenCookie(res, refreshToken);

            return res.status(200).json({
                success: true,
                message: "Account verified successfully! Welcome to CollabX.",
                token: accessToken,
                accessToken,
                refreshToken,
                user: safeUser(user),
            });
        }

        return res.status(200).json({
            success: true,
            message: "OTP verified successfully.",
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 4. RESEND OTP
// ==========================================
export const resendOtp = async (req, res, next) => {
    try {
        const { email, purpose = "signup" } = req.body || {};

        if (!email || typeof email !== "string" || email.trim().length > 254) {
            return res.status(400).json({
                success: false,
                message: "Valid email address is required",
            });
        }

        const safePurpose = VALID_OTP_PURPOSES.has(purpose) ? purpose : "signup";
        const cleanEmail = email.trim().toLowerCase();

        const { rows } = await pool.query(
            "SELECT id, name FROM users WHERE LOWER(email) = LOWER($1)",
            [cleanEmail]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                code: "USER_NOT_FOUND",
                message: "No account found with this email address.",
            });
        }

        const user = rows[0];

        const otp = generateSecureOtp();
        const otpHash = await bcrypt.hash(otp, 10);

        const otpToken = jwt.sign(
            { email: cleanEmail, otpHash, purpose: safePurpose },
            process.env.JWT_SECRET,
            { expiresIn: "2m", algorithm: "HS256" }
        );

        const emailResult = await sendOtpEmail({
            to: cleanEmail,
            name: user.name,
            otp,
            purpose: safePurpose,
        });

        if (!emailResult?.sent) {
            console.error(`[ResendOtp] Failed to dispatch OTP to ${cleanEmail}:`, emailResult?.reason);
            return res.status(502).json({
                success: false,
                code: "EMAIL_DISPATCH_FAILED",
                message: "Unable to send verification code to your email at this moment. Please try again shortly.",
                reason: process.env.NODE_ENV !== "production" ? emailResult?.reason : undefined,
            });
        }

        return res.status(200).json({
            success: true,
            message: "A new OTP code has been sent to your email. Valid for 2 minutes.",
            otpToken,
            email: cleanEmail,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 5. FORGOT PASSWORD
// ==========================================
export const forgotPassword = async (req, res, next) => {
    try {
        const { email } = pickAllowedFields(req.body, ["email"]);

        if (!email || typeof email !== "string" || !email.trim() || email.trim().length > 254) {
            return res.status(400).json({
                success: false,
                message: "Valid email address is required",
            });
        }

        const cleanEmail = email.trim().toLowerCase();

        const { rows } = await pool.query(
            "SELECT id, name FROM users WHERE LOWER(email) = LOWER($1)",
            [cleanEmail]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                code: "USER_NOT_FOUND",
                message: "No account found with this email address. Please create an account first.",
            });
        }

        const user = rows[0];

        const otp = generateSecureOtp();
        const otpHash = await bcrypt.hash(otp, 10);

        const otpToken = jwt.sign(
            { email: cleanEmail, otpHash, purpose: "reset_password" },
            process.env.JWT_SECRET,
            { expiresIn: "2m", algorithm: "HS256" }
        );

        const emailResult = await sendOtpEmail({
            to: cleanEmail,
            name: user.name,
            otp,
            purpose: "reset_password",
        });

        if (!emailResult?.sent) {
            console.error(`[ForgotPassword] Failed to dispatch OTP to ${cleanEmail}:`, emailResult?.reason);
            return res.status(502).json({
                success: false,
                code: "EMAIL_DISPATCH_FAILED",
                message: "Unable to send password reset code to your email at this moment. Please try again shortly.",
                reason: process.env.NODE_ENV !== "production" ? emailResult?.reason : undefined,
            });
        }

        return res.status(200).json({
            success: true,
            message: "Password reset OTP sent to your email. Valid for 2 minutes.",
            otpToken,
            email: cleanEmail,
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 6. RESET PASSWORD (Revokes All Refresh Tokens, Active Access Tokens, Cache & Sockets)
// ==========================================
export const resetPassword = async (req, res, next) => {
    try {
        const { email, otp, otpToken, newPassword } = pickAllowedFields(req.body, [
            "email",
            "otp",
            "otpToken",
            "newPassword",
        ]);

        if (
            typeof email !== "string" ||
            typeof otpToken !== "string" ||
            !email.trim() ||
            email.trim().length > 254 ||
            otp === undefined ||
            otp === null ||
            !String(otp).trim() ||
            !otpToken.trim() ||
            !newPassword
        ) {
            return res.status(400).json({
                success: false,
                message: "Email, OTP code, otpToken, and new password are required",
            });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanOtp = String(otp).trim();

        if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
            return res.status(400).json({
                success: false,
                message: "New password must contain 8 to 128 characters",
            });
        }

        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: "New password must contain at least one uppercase letter, one lowercase letter, and one number",
            });
        }

        const tokenAttemptKey = hashKey(otpToken);

        if (consumedOtpTokens.get(tokenAttemptKey)) {
            return res.status(400).json({
                success: false,
                code: "OTP_ALREADY_USED",
                message: "This reset code has already been used. Please request a new code if needed.",
            });
        }

        const prevOtpAttempts = otpAttemptsCache.get(tokenAttemptKey) || 0;
        if (prevOtpAttempts >= MAX_OTP_ATTEMPTS) {
            return res.status(429).json({
                success: false,
                code: "OTP_LOCKED",
                message: "Too many invalid verification attempts. Please request a new reset code.",
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(otpToken, process.env.JWT_SECRET, {
                algorithms: ["HS256"],
            });
        } catch (jwtErr) {
            if (jwtErr.name === "TokenExpiredError") {
                return res.status(400).json({
                    success: false,
                    code: "OTP_EXPIRED",
                    message: "Reset code has expired (2-minute limit). Please request a new code.",
                });
            }
            return res.status(400).json({
                success: false,
                code: "INVALID_TOKEN",
                message: "Invalid reset token. Please request a new code.",
            });
        }

        if (
            !decoded ||
            typeof decoded.otpHash !== "string" ||
            decoded.email !== cleanEmail ||
            decoded.purpose !== "reset_password"
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid password reset request",
            });
        }

        const isMatch = await bcrypt.compare(cleanOtp, decoded.otpHash);
        if (!isMatch) {
            otpAttemptsCache.set(tokenAttemptKey, prevOtpAttempts + 1);
            return res.status(400).json({
                success: false,
                code: "INVALID_OTP",
                message: "Invalid verification code. Please check and try again.",
            });
        }

        consumedOtpTokens.set(tokenAttemptKey, true);
        otpAttemptsCache.delete(tokenAttemptKey);
        const passwordHash = await bcrypt.hash(newPassword, 12);

        const updateRes = await pool.query(`
            UPDATE users
            SET password_hash = $1,
                refresh_token_hash = NULL
            WHERE LOWER(email) = LOWER($2)
            RETURNING id;
        `, [passwordHash, cleanEmail]);

        if (updateRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                code: "USER_NOT_FOUND",
                message: "User account not found.",
            });
        }

        const resetUserId = updateRes.rows[0].id;

        // Immediately revoke all existing access/refresh tokens, clear auth cache, clear lockout & disconnect live sockets
        revokeUserTokens(resetUserId);
        invalidateUserCache();
        loginAttemptsCache.delete(cleanEmail);

        const io = req.app.get("io");
        if (io) {
            io.in(`user:${resetUserId}`).disconnectSockets(true);
        }

        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
        });

        return res.status(200).json({
            success: true,
            message: "Password reset successful! Please login with your new password.",
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 7. REFRESH TOKEN
// ==========================================
export const refreshTokenHandler = async (req, res, next) => {
    try {
        const rawRefreshToken =
            req.cookies?.refreshToken ||
            req.body?.refreshToken ||
            req.headers["x-refresh-token"];

        if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
            return res.status(401).json({
                success: false,
                message: "Refresh token is required",
            });
        }

        const secret = process.env.JWT_SECRET;
        let decoded;
        try {
            decoded = jwt.verify(rawRefreshToken, secret, { algorithms: ["HS256"] });
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired refresh token",
            });
        }

        const parsedUserId = parsePositiveInt(decoded?.id);
        if (!decoded || !parsedUserId || decoded.type !== "refresh") {
            return res.status(401).json({
                success: false,
                message: "Invalid refresh token",
            });
        }

        const { rows } = await pool.query(
            "SELECT id, name, email, roll_no, role, is_verified, is_active, refresh_token_hash, created_at FROM users WHERE id = $1",
            [parsedUserId]
        );

        if (rows.length === 0 || !rows[0].refresh_token_hash) {
            return res.status(401).json({
                success: false,
                message: "Session expired or invalid. Please login again.",
            });
        }

        const user = rows[0];
        if (user.is_active === false) {
            return res.status(403).json({
                success: false,
                message: "User account has been deactivated.",
            });
        }

        const isMatch = await bcrypt.compare(rawRefreshToken, user.refresh_token_hash);
        if (!isMatch) {
            await pool.query("UPDATE users SET refresh_token_hash = NULL WHERE id = $1", [user.id]);
            revokeUserTokens(user.id);
            invalidateUserCache();
            return res.status(401).json({
                success: false,
                message: "Refresh token reuse detected. Please login again.",
            });
        }

        // Rotate Refresh Token
        const newAccessToken = createAccessToken(user.id);
        const newRefreshToken = createRefreshToken(user.id);
        const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

        await pool.query(
            "UPDATE users SET refresh_token_hash = $1 WHERE id = $2",
            [newRefreshTokenHash, user.id]
        );

        setRefreshTokenCookie(res, newRefreshToken);

        return res.status(200).json({
            success: true,
            message: "Token refreshed successfully",
            token: newAccessToken,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user: safeUser(user),
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 8. LOGOUT
// ==========================================
export const logoutUser = async (req, res, next) => {
    try {
        let userId = parsePositiveInt(req.user?.id);
        if (!userId) {
            const rawRefreshToken =
                req.cookies?.refreshToken ||
                req.body?.refreshToken ||
                req.headers["x-refresh-token"];
            if (rawRefreshToken && typeof rawRefreshToken === "string" && process.env.JWT_SECRET) {
                try {
                    const decoded = jwt.verify(rawRefreshToken, process.env.JWT_SECRET, {
                        algorithms: ["HS256"],
                    });
                    userId = parsePositiveInt(decoded?.id);
                } catch {
                    // Ignore invalid/expired cookie on logout
                }
            }
        }
        if (userId) {
            await pool.query(
                "UPDATE users SET refresh_token_hash = NULL WHERE id = $1",
                [userId]
            );
            invalidateUserCache();
        }

        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
        });

        return res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// 9. GET LOGGED-IN USER
// ==========================================
export const getMe = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        return res.status(200).json({
            success: true,
            user: safeUser(req.user),
        });
    } catch (error) {
        next(error);
    }
};
