import express from "express";

import {
    createProject,
    getProjects,
    getProjectById,
    updateProject,
    deleteProject,
} from "../controllers/project.controller.js";

import protect from "../middleware/auth.middleware.js";
import { blockDirectorMutations } from "../middleware/directorGuard.js";
import { requireProjectLeader, requireProjectMember } from "../middleware/ownershipGuard.js";

const router = express.Router();

// CREATE
router.post("/", protect, blockDirectorMutations("Director operates in read-only executive mode. Project creation is not permitted."), createProject);

// READ ALL
router.get("/", protect, getProjects);

// READ SINGLE
router.get("/:id", protect, requireProjectMember("id"), getProjectById);

// UPDATE
router.put("/:id", protect, blockDirectorMutations("Director operates in read-only executive mode. Project updates are not permitted."), requireProjectLeader("id"), updateProject);
router.patch("/:id", protect, blockDirectorMutations("Director operates in read-only executive mode. Project updates are not permitted."), requireProjectLeader("id"), updateProject);

// DELETE
router.delete("/:id", protect, blockDirectorMutations("Director operates in read-only executive mode. Project deletion is not permitted."), requireProjectLeader("id"), deleteProject);

export default router;
