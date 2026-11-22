import express from "express";
import protect from "../middleware/auth.middleware.js";
import { requireProjectLeader } from "../middleware/ownershipGuard.js";
import {
    getLeaderboard,
    toggleProjectStar,
    submitToLeaderboard,
    withdrawFromLeaderboard,
    getMyEligibleProjects,
    getProjectStarsBreakdown,
} from "../controllers/leaderboard.controller.js";

const router = express.Router();

// All Leaderboard endpoints require authenticated session
router.use(protect);

router.get("/", getLeaderboard);
router.get("/my-eligible", getMyEligibleProjects);
router.get("/projects/:id/stars", getProjectStarsBreakdown);
router.post("/projects/:id/star", toggleProjectStar);
router.post("/projects/:id/submit", requireProjectLeader("id"), submitToLeaderboard);
router.delete("/projects/:id/submit", requireProjectLeader("id"), withdrawFromLeaderboard);

export default router;
