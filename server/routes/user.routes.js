import express from "express";
import {
    getUserProfile,
    updateUserProfile,
    getUsers,
} from "../controllers/user.controller.js";
import protect from "../middleware/auth.middleware.js";
import { blockDirectorMutations } from "../middleware/directorGuard.js";

const router = express.Router();

// User profile endpoints (mounted under /api/users and /api/user)
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, blockDirectorMutations("Director operates in read-only executive mode. Profile updates are not permitted."), updateUserProfile);
router.patch("/profile", protect, blockDirectorMutations("Director operates in read-only executive mode. Profile updates are not permitted."), updateUserProfile);

// Search / list users for assignments and invitations
router.get("/all", protect, getUsers);
router.get("/search", protect, getUsers);

// Also handle base route /api/users and /api/user
router.get("/", protect, (req, res, next) => {
    if (req.query.role || req.query.search || req.baseUrl.endsWith("/users")) {
        return getUsers(req, res, next);
    }
    return getUserProfile(req, res, next);
});
router.put("/", protect, blockDirectorMutations("Director operates in read-only executive mode. Profile updates are not permitted."), updateUserProfile);
router.patch("/", protect, blockDirectorMutations("Director operates in read-only executive mode. Profile updates are not permitted."), updateUserProfile);

export default router;
