import express from "express";

import {
    getProjectTeam,
    sendInvitation,
    cancelInvitation,
    getMyInvitations,
    acceptInvitation,
    rejectInvitation,
    removeTeamMember,
    removeProjectMentor,
    leaveProject,
    transferOwnership,
} from "../controllers/team.controller.js";

import protect from "../middleware/auth.middleware.js";
import { blockDirectorMutations } from "../middleware/directorGuard.js";
import { requireProjectLeader, requireProjectMember } from "../middleware/ownershipGuard.js";

const router = express.Router();

router.use(protect);
router.use(blockDirectorMutations("Director operates in read-only executive mode. Team modifications are not permitted."));

// Received invitations
router.get("/invitations/received", getMyInvitations);
router.patch("/invitations/:invitationId/accept", acceptInvitation);
router.patch("/invitations/:invitationId/reject", rejectInvitation);

// Project team
router.get("/:projectId", requireProjectMember("projectId"), getProjectTeam);
router.post("/:projectId/invitations", requireProjectLeader("projectId"), sendInvitation);
router.delete("/:projectId/invitations/:invitationId", cancelInvitation);

// Membership management
router.delete("/:projectId/members/:memberId", requireProjectLeader("projectId"), removeTeamMember);
router.delete("/:projectId/mentor", requireProjectLeader("projectId"), removeProjectMentor);
router.post("/:projectId/leave", leaveProject);
router.patch("/:projectId/transfer-ownership", requireProjectLeader("projectId"), transferOwnership);

export default router;
