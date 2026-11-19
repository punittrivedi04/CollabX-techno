
import express from "express";

import {
    createTask,
    getTasks,
    getTaskById,
    updateTask,
    deleteTask,
} from "../controllers/task.controller.js";

import protect from "../middleware/auth.middleware.js";
import { blockDirector } from "../middleware/directorGuard.js";

const router = express.Router();

router.use(protect);
router.use(blockDirector("Director operates in executive view-only mode and does not access task operations."));

router.post("/", createTask);
router.get("/", getTasks);
router.get("/:id", getTaskById);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

export default router;
