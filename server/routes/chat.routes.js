import express from "express";
import {
    getChatMessages,
    sendChatMessage,
    editChatMessage,
    deleteChatMessage,
} from "../controllers/chat.controller.js";
import protect from "../middleware/auth.middleware.js";
import { blockDirector } from "../middleware/directorGuard.js";
import { requireProjectMember } from "../middleware/ownershipGuard.js";

const router = express.Router();

router.use(protect);
router.use(blockDirector("Director account does not have access to project chat channels."));

// Get project chat history (strict squad/owner/mentor/admin isolation)
router.get("/:projectId/messages", requireProjectMember("projectId"), getChatMessages);
router.get("/:projectId", requireProjectMember("projectId"), getChatMessages);

// Send a new message (strict squad/owner/mentor/admin isolation)
router.post("/:projectId/messages", requireProjectMember("projectId"), sendChatMessage);
router.post("/:projectId", requireProjectMember("projectId"), sendChatMessage);

// Edit own message
router.patch("/:projectId/messages/:messageId", editChatMessage);
router.patch("/:projectId/:messageId", editChatMessage);

// Delete message
router.delete("/:projectId/messages/:messageId", deleteChatMessage);
router.delete("/:projectId/:messageId", deleteChatMessage);

export default router;
