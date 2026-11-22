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
    getAdminUsers,
    deleteAdminUser,
    addAdminTeamMember,
    removeAdminTeamMember,
    deleteAdminProject,
} from "../controllers/admin.controller.js";

const router = express.Router();

// Strict Admin RBAC on all /api/admin/* endpoints
router.use(protect, authorize("admin"));

// Overview
router.get("/overview", getAdminOverview);

// User directory & management (Students, Mentors, Directors, Admins)
router.get("/users", getAdminUsers);
router.delete("/users/:id", deleteAdminUser);

// Students management
router.get("/students", getAdminStudents);
router.get("/students/:id", getAdminStudentById);
router.post("/students", createAdminStudent);
router.put("/students/:id", updateAdminStudent);
router.delete("/students/:id", deleteAdminUser);
router.patch("/students/:id/status", updateStudentStatus);
router.patch("/students/:id/assign-mentor", assignStudentMentor);

// Mentors management
router.get("/mentors", getAdminMentors);
router.get("/mentors/:id", getAdminMentorById);
router.delete("/mentors/:id", deleteAdminUser);

// Teams & Projects management
router.get("/teams", getAdminTeams);
router.get("/teams/:projectId", getAdminTeamById);
router.delete("/teams/:projectId", deleteAdminProject);
router.delete("/projects/:projectId", deleteAdminProject);
router.patch("/projects/:projectId/reassign-mentor", reassignProjectMentor);
router.post("/teams/:projectId/members", addAdminTeamMember);
router.delete("/teams/:projectId/members/:memberId", removeAdminTeamMember);

// Safe role transitions (student <-> mentor)
router.patch("/users/:id/role", transitionUserRole);

// Announcements management
router.get("/announcements", getAdminAnnouncements);
router.post("/announcements", createAdminAnnouncement);
router.delete("/announcements/:id", deleteAdminAnnouncement);

export default router;
