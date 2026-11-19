import express from "express";
import {
    getChatMessages,
    sendChatMessage,
    editChatMessage,
    deleteChatMessage,
} from "../controllers/chat.controller.js";
import protect from "../middleware/auth.middleware.js";
import { blockDirector } from "../middleware/directorGuard.js";

const router = express.Router();

router.use(protect);
router.use(blockDirector("Director account does not have access to project chat channels."));

// Get project chat history
router.get("/:projectId/messages", getChatMessages);
router.get("/:projectId", getChatMessages);

// Send a new message
router.post("/:projectId/messages", sendChatMessage);
router.post("/:projectId", sendChatMessage);

// Edit own message
router.patch("/:projectId/messages/:messageId", editChatMessage);
router.patch("/:projectId/:messageId", editChatMessage);

// Delete message
router.delete("/:projectId/messages/:messageId", deleteChatMessage);
router.delete("/:projectId/:messageId", deleteChatMessage);

export default router;
