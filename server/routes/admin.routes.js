import express from "express";
import protect, { authorize } from "../middleware/auth.middleware.js";
import {
    getAdminOverview,
    getAdminStudents,
    getAdminStudentById,
    createAdminStudent,
    updateAdminStudent,
    updateStudentStatus,
    assignStudentMentor,
    getAdminMentors,
    getAdminMentorById,
    getAdminTeams,
    getAdminTeamById,
    reassignProjectMentor,
    transitionUserRole,
    getAdminAnnouncements,
    createAdminAnnouncement,
    deleteAdminAnnouncement,
} from "../controllers/admin.controller.js";

const router = express.Router();

// Strict Admin RBAC on all /api/admin/* endpoints
router.use(protect, authorize("admin"));

// Overview
router.get("/overview", getAdminOverview);

// Students management
router.get("/students", getAdminStudents);
router.get("/students/:id", getAdminStudentById);
router.post("/students", createAdminStudent);
router.put("/students/:id", updateAdminStudent);
router.patch("/students/:id/status", updateStudentStatus);
router.patch("/students/:id/assign-mentor", assignStudentMentor);

// Mentors management
router.get("/mentors", getAdminMentors);
router.get("/mentors/:id", getAdminMentorById);

// Teams & Projects management
router.get("/teams", getAdminTeams);
router.get("/teams/:projectId", getAdminTeamById);
router.patch("/projects/:projectId/reassign-mentor", reassignProjectMentor);

// Safe role transitions (student <-> mentor)
router.patch("/users/:id/role", transitionUserRole);

// Announcements management
router.get("/announcements", getAdminAnnouncements);
router.post("/announcements", createAdminAnnouncement);
router.delete("/announcements/:id", deleteAdminAnnouncement);

export default router;
