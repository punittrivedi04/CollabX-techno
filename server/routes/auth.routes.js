import express from "express";
import {
    registerUser,
    loginUser,
    refreshTokenHandler,
    logoutUser,
    forgotPassword,
    resetPassword,
    resendOtp,
    verifyOtp,
    getMe,
} from "../controllers/auth.controller.js";
import protect from "../middleware/auth.middleware.js";
import { authRateLimiter, createRateLimiter } from "../middleware/rateLimiter.js";
import sanitizeAndValidate from "../middleware/sanitizeAndValidate.js";

const router = express.Router();

const otpLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many OTP requests. Please wait a few minutes before trying again.",
    code: "TOO_MANY_OTP_REQUESTS",
    keyGenerator: (req) => `otp:${req.ip || "127.0.0.1"}`,
});

router.use(sanitizeAndValidate);

router.post("/register", authRateLimiter, registerUser);
router.post("/login", authRateLimiter, loginUser);
router.post("/refresh", authRateLimiter, refreshTokenHandler);
router.post("/logout", logoutUser);
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/reset-password", otpLimiter, resetPassword);
router.post("/verify-otp", otpLimiter, verifyOtp);
router.post("/resend-otp", otpLimiter, resendOtp);
router.get("/me", protect, getMe);

export default router;
