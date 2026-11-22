import express from "express";
import protect, { authorize } from "../middleware/auth.middleware.js";
import { enforceDirectorReadOnly } from "../middleware/directorGuard.js";
import {
    getDirectorOverview,
    getDirectorReports,
    getDirectorProjectById,
    getDirectorMentorById,
    getDirectorStudentById,
} from "../controllers/director.controller.js";

const router = express.Router();

// Strict Director Executive RBAC + Read-Only Guard + Zero Unofficial Chat Access
router.use(protect, authorize("director"), enforceDirectorReadOnly);

router.get("/overview", getDirectorOverview);
router.get("/reports", getDirectorReports);
router.get("/projects/:id", getDirectorProjectById);
router.get("/mentors/:id", getDirectorMentorById);
router.get("/students/:id", getDirectorStudentById);

export default router;
