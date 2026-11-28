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
    changePassword,
    getMe,
} from "../controllers/auth.controller.js";
import protect from "../middleware/auth.middleware.js";
import {
    authRateLimiter,
    loginRateLimiter,
    passwordResetRateLimiter,
    otpVerifyResendRateLimiter,
    changePasswordRateLimiter,
} from "../middleware/rateLimiter.js";
import sanitizeAndValidate from "../middleware/sanitizeAndValidate.js";

const router = express.Router();

router.use(sanitizeAndValidate);

router.post("/register", authRateLimiter, registerUser);
router.post("/login", loginRateLimiter, loginUser);
router.post("/refresh", authRateLimiter, refreshTokenHandler);
router.post("/logout", logoutUser);
router.post("/forgot-password", passwordResetRateLimiter, forgotPassword);
router.post("/reset-password", passwordResetRateLimiter, resetPassword);
router.post("/verify-otp", otpVerifyResendRateLimiter, verifyOtp);
router.post("/resend-otp", otpVerifyResendRateLimiter, resendOtp);
router.post("/change-password", protect, changePasswordRateLimiter, changePassword);
router.get("/me", protect, getMe);

export default router;
