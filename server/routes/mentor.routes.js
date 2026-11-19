import express from "express";
import protect, { authorize } from "../middleware/auth.middleware.js";
import {
    getMentorOverview,
    getMentorStudents,
    getMentorStudentById,
    getMentorTeams,
    getMentorTeamById,
    switchTeamLeader,
    submitMentorProjectReview,
    createMentorTask,
    reviewMentorTask,
    getMentorAnnouncements,
    createMentorAnnouncement,
    getMentorInvitations,
    acceptMentorInvitation,
    rejectMentorInvitation,
} from "../controllers/mentor.controller.js";

const router = express.Router();

// Strict Mentor RBAC on all /api/mentor/* endpoints
router.use(protect, authorize("mentor"));

// Overview
router.get("/overview", getMentorOverview);

// Assigned Students
router.get("/students", getMentorStudents);
router.get("/students/:id", getMentorStudentById);

// Assigned Teams & Team Leader management
router.get("/teams", getMentorTeams);
router.get("/teams/:projectId", getMentorTeamById);
router.patch("/teams/:projectId/leader", switchTeamLeader);
router.post("/teams/:projectId/review", submitMentorProjectReview);

// Tasks assignment & review
router.post("/tasks", createMentorTask);
router.patch("/tasks/:id/review", reviewMentorTask);

// Team-scoped Announcements
router.get("/announcements", getMentorAnnouncements);
router.post("/announcements", createMentorAnnouncement);

// Mentor Invitations (Student-driven mentor requests)
router.get("/invitations", getMentorInvitations);
router.patch("/invitations/:invitationId/accept", acceptMentorInvitation);
router.patch("/invitations/:invitationId/reject", rejectMentorInvitation);

export default router;
