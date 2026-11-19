import express from "express";
import { getProjectActivities } from "../controllers/activity.controller.js";
import protect from "../middleware/auth.middleware.js";
import { requireProjectMember } from "../middleware/ownershipGuard.js";

const router = express.Router();

router.get(
    "/project/:projectId",
    protect,
    requireProjectMember("projectId"),
    getProjectActivities
);

export default router;
