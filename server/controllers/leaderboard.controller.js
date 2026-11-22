import pool from "../config/db.js";
import { parsePositiveInt, escapeLikePattern, isPresentHttpUrl } from "../utils/formatters.js";
import { readCache, aggregateCache, invalidateAllCaches } from "../utils/microCache.js";
import logActivity from "../utils/activityLogger.js";
import { isDirector } from "../middleware/directorGuard.js";

/**
 * 1. GET /api/leaderboard
 * Fetches all projects that are 100% completed AND opted-in to the Leaderboard
 * AND have both valid Presentation (PPT) and Live Demo links.
 * Dual-ranking logic:
 *   Primary: Total star votes (DESC)
 *   Secondary: Submission / creation recency (DESC)
 */
export const getLeaderboard = async (req, res, next) => {
    try {
        const userId = req.user?.id ? Number(req.user.id) : null;
        const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
        const cacheKey = `leaderboard:u:${userId || 0}:q:${search}`;

        const leaderboard = await aggregateCache.getOrSet(cacheKey, async () => {
            const params = [];
            let isStarredSelect = "FALSE AS is_starred";
            if (userId) {
                params.push(userId);
                isStarredSelect = `EXISTS(SELECT 1 FROM project_stars ps WHERE ps.project_id = fl.id AND ps.user_id = $${params.length}) AS is_starred`;
            }

            let searchWhereClause = "1 = 1";
            if (search) {
                params.push(`%${escapeLikePattern(search)}%`);
                const sIdx = params.length;
                searchWhereClause = `(
                    fl.title ILIKE $${sIdx} ESCAPE '\\' OR
                    COALESCE(fl.description, '') ILIKE $${sIdx} ESCAPE '\\' OR
                    COALESCE(fl.owner_name, '') ILIKE $${sIdx} ESCAPE '\\' OR
                    COALESCE(fl.owner_roll_no, '') ILIKE $${sIdx} ESCAPE '\\' OR
                    COALESCE(fl.mentor_name, '') ILIKE $${sIdx} ESCAPE '\\'
                )`;
            }

            const queryText = `
                WITH full_leaderboard AS (
                    SELECT
                        p.id, p.title, p.description, p.status, p.progress,
                        p.ppt_url, p.demo_url, p.github_url, p.created_at,
                        p.leaderboard_submitted_at,
                        o.id AS owner_id, o.name AS owner_name, o.email AS owner_email, o.roll_no AS owner_roll_no,
                        m.id AS mentor_id, m.name AS mentor_name, m.email AS mentor_email,
                        (SELECT COUNT(*)::int FROM project_stars ps WHERE ps.project_id = p.id) AS star_count,
                        ROW_NUMBER() OVER (
                            ORDER BY
                                (SELECT COUNT(*)::int FROM project_stars ps WHERE ps.project_id = p.id) DESC,
                                COALESCE(p.leaderboard_submitted_at, p.created_at) DESC,
                                p.id DESC
                        )::int AS rank
                    FROM projects p
                    LEFT JOIN users o ON o.id = p.owner_id
                    LEFT JOIN users m ON m.id = p.mentor_id
                    WHERE p.is_on_leaderboard = TRUE
                      AND LOWER(TRIM(COALESCE(p.status, ''))) = 'completed'
                      AND (p.status IS NULL OR LOWER(TRIM(p.status)) != 'archived')
                      AND (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) >= 1
                      AND (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND LOWER(TRIM(COALESCE(t.status, ''))) NOT IN ('completed', 'done')) = 0
                      AND p.ppt_url IS NOT NULL AND TRIM(p.ppt_url) != '' AND p.ppt_url ~* '^https?://'
                      AND p.demo_url IS NOT NULL AND TRIM(p.demo_url) != '' AND p.demo_url ~* '^https?://'
                )
                SELECT fl.*,
                       ${isStarredSelect}
                FROM full_leaderboard fl
                WHERE ${searchWhereClause}
                ORDER BY fl.rank ASC
                LIMIT 100;
            `;

            const { rows: projects } = await pool.query(queryText, params);

            if (projects.length === 0) return [];

            const projectIds = projects.map((p) => p.id);

            // Fetch squad members for public view
            const membersRes = await pool.query(
                `SELECT pm.project_id, pm.role, u.id, u.name, u.email, u.roll_no
                 FROM project_members pm
                 JOIN users u ON u.id = pm.user_id
                 WHERE pm.project_id = ANY($1)
                 ORDER BY u.name ASC;`,
                [projectIds]
            );

            const membersByProject = new Map();
            for (const row of membersRes.rows) {
                if (!membersByProject.has(row.project_id)) {
                    membersByProject.set(row.project_id, []);
                }
                membersByProject.get(row.project_id).push({
                    id: row.id,
                    _id: row.id,
                    name: row.name,
                    email: row.email,
                    roll_no: row.roll_no || "",
                    role: row.role || "member",
                });
            }

            return projects.map((p) => {
                const teamLeader = p.owner_id
                    ? {
                          id: p.owner_id,
                          _id: p.owner_id,
                          name: p.owner_name || "Lead",
                          email: p.owner_email || "",
                          roll_no: p.owner_roll_no || "",
                      }
                    : null;

                const mentor = p.mentor_id
                    ? {
                          id: p.mentor_id,
                          _id: p.mentor_id,
                          name: p.mentor_name || "Mentor",
                          email: p.mentor_email || "",
                      }
                    : null;

                const allMembers = membersByProject.get(p.id) || [];
                const members = allMembers.filter((m) => String(m.id) !== String(p.owner_id));

                return {
                    id: p.id,
                    _id: p.id,
                    rank: Number(p.rank),
                    title: p.title,
                    name: p.title,
                    description: p.description || "",
                    status: p.status,
                    progress: Number(p.progress || 100),
                    pptUrl: p.ppt_url || "",
                    demoUrl: p.demo_url || "",
                    githubUrl: p.github_url || "",
                    submittedAt: p.leaderboard_submitted_at || p.created_at,
                    createdAt: p.created_at,
                    starCount: Number(p.star_count || 0),
                    isStarred: Boolean(p.is_starred),
                    teamLeader,
                    owner: teamLeader,
                    mentor,
                    members,
                    memberCount: members.length + (teamLeader ? 1 : 0),
                };
            });
        });

        return res.status(200).json({
            success: true,
            count: leaderboard.length,
            projects: leaderboard,
            data: leaderboard,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * 2. POST /api/leaderboard/projects/:id/star
 * 1 star per user (Mentor, Student, Director, Admin).
 * Clicking toggles the star vote.
 */
export const toggleProjectStar = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.id);
        const userId = req.user.id;

        if (!projectId) {
            return res.status(400).json({ success: false, message: "Valid project ID is required" });
        }

        // Verify project exists, is on leaderboard, and is 100% completed
        const { rows: projRows } = await pool.query(
            `SELECT id, title, status, progress, is_on_leaderboard FROM projects WHERE id = $1;`,
            [projectId]
        );

        if (projRows.length === 0) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const project = projRows[0];

        if (project.status === "Archived") {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        if (!project.is_on_leaderboard) {
            return res.status(400).json({
                success: false,
                message: "This project is not currently published on the Leaderboard",
            });
        }

        if (String(project.status || "").trim().toLowerCase() !== "completed") {
            return res.status(400).json({
                success: false,
                message: "Only projects with 'Completed' status can receive Leaderboard stars",
            });
        }

        const { rows: taskCounts } = await pool.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(status, ''))) NOT IN ('completed', 'done'))::int AS pending
             FROM tasks WHERE project_id = $1;`,
            [projectId]
        );
        const totalTasks = Number(taskCounts[0]?.total || 0);
        const pendingTasks = Number(taskCounts[0]?.pending || 0);

        if (totalTasks === 0 || pendingTasks > 0) {
            return res.status(400).json({
                success: false,
                message: "Only completed projects with all tasks finished can receive Leaderboard stars",
            });
        }

        // Check if user already starred
        const { rows: existingVote } = await pool.query(
            "SELECT id FROM project_stars WHERE project_id = $1 AND user_id = $2;",
            [projectId, userId]
        );

        let isStarred;
        if (existingVote.length > 0) {
            await pool.query("DELETE FROM project_stars WHERE project_id = $1 AND user_id = $2;", [
                projectId,
                userId,
            ]);
            isStarred = false;
        } else {
            await pool.query(
                `INSERT INTO project_stars (project_id, user_id, created_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (project_id, user_id) DO NOTHING;`,
                [projectId, userId]
            );
            isStarred = true;
        }

        const { rows: countRows } = await pool.query(
            "SELECT COUNT(*)::int AS count FROM project_stars WHERE project_id = $1;",
            [projectId]
        );
        const starCount = Number(countRows[0]?.count || 0);

        invalidateAllCaches();

        const io = req.app.get("io");
        if (io) {
            io.emit("leaderboard:star_update", {
                projectId,
                starCount,
                userId,
            });
        }

        await logActivity({
            projectId,
            userId,
            action: isStarred ? "PROJECT_STARRED" : "PROJECT_UNSTARRED",
            description: `${req.user.name} ${isStarred ? "starred" : "unstarred"} "${project.title}" on the Leaderboard`,
            entityType: "Project",
            entityId: projectId,
        });

        return res.status(200).json({
            success: true,
            isStarred,
            starCount,
            message: isStarred ? "Project starred!" : "Star removed",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * 3. POST /api/leaderboard/projects/:id/submit
 * Project Leader submits their 100% completed project to the College Leaderboard.
 * Automatically dispatches system-wide notifications to all active users.
 */
export const submitToLeaderboard = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.id);
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";

        if (!projectId) {
            return res.status(400).json({ success: false, message: "Valid project ID is required" });
        }

        const { rows: projRows } = await pool.query(
            `SELECT id, title, description, status, progress, owner_id, is_on_leaderboard, ppt_url, demo_url
             FROM projects WHERE id = $1;`,
            [projectId]
        );

        if (projRows.length === 0) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const project = projRows[0];

        if (project.status === "Archived") {
            return res.status(400).json({
                success: false,
                message: "Archived projects cannot be submitted to the Leaderboard.",
            });
        }

        // Only Project Leader or Admin can submit
        if (!isAdmin && Number(project.owner_id) !== Number(userId)) {
            return res.status(403).json({
                success: false,
                message: "Only the Project Leader can submit this project to the College Leaderboard",
            });
        }

        // Must be strictly status === 'completed' and have all tasks completed
        if (String(project.status || "").trim().toLowerCase() !== "completed") {
            return res.status(400).json({
                success: false,
                message: "Project status must be explicitly set to 'Completed' before submitting to the College Leaderboard.",
            });
        }

        const taskCheckRes = await pool.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(status, ''))) NOT IN ('completed', 'done'))::int AS pending
             FROM tasks WHERE project_id = $1;`,
            [projectId]
        );
        const totalTasks = Number(taskCheckRes.rows[0]?.total || 0);
        const pendingTasks = Number(taskCheckRes.rows[0]?.pending || 0);

        if (totalTasks === 0) {
            return res.status(400).json({
                success: false,
                message: "Project must have at least one task before submitting to the College Leaderboard.",
            });
        }

        if (pendingTasks > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot submit to Leaderboard: ${pendingTasks} task(s) are still pending. All tasks must be completed.`,
            });
        }

        // Must have both valid Presentation (PPT) link and Live Demo link
        const hasValidPpt = isPresentHttpUrl(project.ppt_url);
        const hasValidDemo = isPresentHttpUrl(project.demo_url);
        if (!hasValidPpt || !hasValidDemo) {
            return res.status(400).json({
                success: false,
                message: "A project must have both a valid Presentation (PPT) link and a Live Demo link before submitting to the College Leaderboard.",
            });
        }

        if (project.is_on_leaderboard) {
            return res.status(200).json({
                success: true,
                message: "This project is already published on the College Leaderboard.",
                project,
            });
        }

        // Clean any historical stars so re-submission / fresh publication starts with 0 stars
        await pool.query("DELETE FROM project_stars WHERE project_id = $1;", [projectId]);

        // Publish to leaderboard
        const { rows: updatedRows } = await pool.query(
            `UPDATE projects
             SET is_on_leaderboard = TRUE,
                 leaderboard_submitted_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING id, title, description, status, progress, is_on_leaderboard, leaderboard_submitted_at;`,
            [projectId]
        );

        const updated = updatedRows[0];
        invalidateAllCaches();

        // System-wide notification to all active users
        const notifTitle = "New Project on College Leaderboard!";
        const notifMessage = `"${project.title}" has arrived on the College Leaderboard! Inspect their demo and presentation and give it a star.`;

        await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
             SELECT u.id, $1, $2, 'leaderboard', FALSE, NOW()
             FROM users u
             WHERE u.is_active = TRUE;`,
            [notifTitle, notifMessage]
        );

        const io = req.app.get("io");
        if (io) {
            io.emit("notification:new", {
                title: notifTitle,
                message: notifMessage,
                type: "leaderboard",
                project: projectId,
                createdAt: new Date().toISOString(),
            });
            io.emit("leaderboard:new_project", {
                projectId,
                title: project.title,
                leaderboardSubmittedAt: updated.leaderboard_submitted_at,
            });
            io.emit("leaderboard:star_update", {
                projectId,
                starCount: 0,
            });
        }

        await logActivity({
            projectId,
            userId,
            action: "LEADERBOARD_PUBLISHED",
            description: `${req.user.name} published project "${project.title}" to the College Leaderboard`,
            entityType: "Project",
            entityId: projectId,
        });

        return res.status(200).json({
            success: true,
            message: `"${project.title}" is now published on the College Leaderboard!`,
            project: updated,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * 4. DELETE /api/leaderboard/projects/:id/submit
 * Project Leader (or Admin) can withdraw project from Leaderboard.
 */
export const withdrawFromLeaderboard = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.id);
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";

        if (!projectId) {
            return res.status(400).json({ success: false, message: "Valid project ID is required" });
        }

        const { rows: projRows } = await pool.query(
            "SELECT id, title, owner_id, is_on_leaderboard FROM projects WHERE id = $1;",
            [projectId]
        );

        if (projRows.length === 0) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const project = projRows[0];

        if (!isAdmin && Number(project.owner_id) !== Number(userId)) {
            return res.status(403).json({
                success: false,
                message: "Only the Project Leader can withdraw this project from the Leaderboard",
            });
        }

        // 1. Delete all star votes so re-submitting starts fresh with 0 stars
        await pool.query("DELETE FROM project_stars WHERE project_id = $1;", [projectId]);

        // 2. Unlist project and clear leaderboard submission timestamp
        await pool.query(
            `UPDATE projects
             SET is_on_leaderboard = FALSE,
                 leaderboard_submitted_at = NULL,
                 updated_at = NOW()
             WHERE id = $1;`,
            [projectId]
        );

        invalidateAllCaches();

        const io = req.app.get("io");
        if (io) {
            io.emit("leaderboard:project_withdrawn", { projectId });
            io.emit("leaderboard:star_update", { projectId, starCount: 0 });
        }

        await logActivity({
            projectId,
            userId,
            action: "LEADERBOARD_WITHDRAWN",
            description: `${req.user.name} withdrew project "${project.title}" from the College Leaderboard`,
            entityType: "Project",
            entityId: projectId,
        });

        return res.status(200).json({
            success: true,
            message: `"${project.title}" has been withdrawn from the College Leaderboard.`,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * 5. GET /api/leaderboard/my-eligible-projects
 * Returns completed projects owned by current user eligible to be submitted.
 */
export const getMyEligibleProjects = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = String(req.user.role || "").toLowerCase();
        const isAdmin = role === "admin" || role === "coordinator";

        let query = `
            SELECT p.id, p.title, p.description, p.status, p.progress,
                   p.ppt_url, p.demo_url, p.is_on_leaderboard, p.leaderboard_submitted_at,
                   p.owner_id, u.name AS owner_name, u.email AS owner_email,
                   (SELECT COUNT(*)::int FROM project_stars ps WHERE ps.project_id = p.id) AS star_count,
                   (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
                   (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND LOWER(TRIM(COALESCE(t.status, ''))) NOT IN ('completed', 'done')) AS pending_tasks
            FROM projects p
            LEFT JOIN users u ON u.id = p.owner_id
            WHERE (p.status IS NULL OR LOWER(TRIM(p.status)) != 'archived')
              AND (
                  p.is_on_leaderboard = TRUE
                  OR (
                      LOWER(TRIM(COALESCE(p.status, ''))) = 'completed'
                      AND (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) >= 1
                      AND (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND LOWER(TRIM(COALESCE(t.status, ''))) NOT IN ('completed', 'done')) = 0
                  )
              )
        `;
        const params = [];
        if (!isAdmin) {
            query += " AND p.owner_id = $1";
            params.push(userId);
        }
        query += " ORDER BY p.updated_at DESC;";

        const { rows: projects } = await pool.query(query, params);

        return res.status(200).json({
            success: true,
            count: projects.length,
            projects: projects.map((p) => {
                const hasValidPpt = isPresentHttpUrl(p.ppt_url);
                const hasValidDemo = isPresentHttpUrl(p.demo_url);
                const hasValidDeliverables = hasValidPpt && hasValidDemo;
                const isAllTasksCompleted = Number(p.total_tasks || 0) >= 1 && Number(p.pending_tasks || 0) === 0;
                const isCompletedStatus = String(p.status || "").trim().toLowerCase() === "completed";
                const isFullyQualified = isCompletedStatus && isAllTasksCompleted && hasValidDeliverables;

                return {
                    id: p.id,
                    _id: p.id,
                    title: p.title,
                    description: p.description || "",
                    status: p.status,
                    progress: Number(p.progress || 100),
                    pptUrl: p.ppt_url || "",
                    demoUrl: p.demo_url || "",
                    hasValidPpt,
                    hasValidDemo,
                    hasValidDeliverables,
                    isOnLeaderboard: Boolean(p.is_on_leaderboard),
                    isFullyQualified,
                    isPubliclyVisible: Boolean(p.is_on_leaderboard && isFullyQualified),
                    starCount: Number(p.star_count || 0),
                    totalTasks: Number(p.total_tasks || 0),
                    pendingTasks: Number(p.pending_tasks || 0),
                    ownerId: p.owner_id,
                    ownerName: p.owner_name || "",
                    ownerEmail: p.owner_email || "",
                };
            }),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * 6. GET /api/leaderboard/projects/:id/stars
 * Returns structured star voter list, categorized by role:
 *  - Directors at the top
 *  - Mentors in the middle
 *  - Students below
 *  - Tailored to caller's perspective highlighting
 */
export const getProjectStarsBreakdown = async (req, res, next) => {
    try {
        const projectId = parsePositiveInt(req.params.id);
        const currentUserId = req.user?.id ? Number(req.user.id) : null;

        if (!projectId) {
            return res.status(400).json({ success: false, message: "Valid project ID is required" });
        }

        // Verify project exists
        const { rows: projRows } = await pool.query(
            "SELECT id, title, is_on_leaderboard FROM projects WHERE id = $1;",
            [projectId]
        );

        if (projRows.length === 0) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const project = projRows[0];

        // Fetch all voters from project_stars joined with users
        const { rows: voters } = await pool.query(
            `SELECT 
                ps.id AS star_id,
                ps.created_at AS starred_at,
                u.id AS user_id,
                u.name,
                u.email,
                u.role,
                u.roll_no
             FROM project_stars ps
             JOIN users u ON u.id = ps.user_id
             WHERE ps.project_id = $1
             ORDER BY ps.created_at DESC;`,
            [projectId]
        );

        const directors = [];
        const mentors = [];
        const students = [];
        const admins = [];

        let currentUserStarred = false;

        for (const voter of voters) {
            const roleLower = String(voter.role || "").toLowerCase().trim();
            const isDirectorUser = roleLower === "director";
            const isMentorUser = !isDirectorUser && (roleLower === "mentor" || roleLower === "faculty");
            const isAdminUser = !isDirectorUser && !isMentorUser && (roleLower === "admin" || roleLower === "coordinator");

            const isCurrent = currentUserId && Number(voter.user_id) === currentUserId;
            if (isCurrent) {
                currentUserStarred = true;
            }

            const formatted = {
                id: voter.user_id,
                starId: voter.star_id,
                name: voter.name,
                email: voter.email,
                role: isDirectorUser ? "director" : isMentorUser ? "mentor" : isAdminUser ? "admin" : "student",
                displayRole: isDirectorUser
                    ? "Executive Director"
                    : isMentorUser
                    ? "Faculty Mentor"
                    : isAdminUser
                    ? "Administrator"
                    : "Student",
                rollNo: voter.roll_no || "",
                starredAt: voter.starred_at,
                isCurrentUser: Boolean(isCurrent),
            };

            if (isDirectorUser) {
                directors.push(formatted);
            } else if (isMentorUser) {
                mentors.push(formatted);
            } else if (isAdminUser) {
                admins.push(formatted);
            } else {
                students.push(formatted);
            }
        }

        // Determine current user's role perspective
        const callerRoleLower = String(req.user?.role || "").toLowerCase().trim();
        const callerPerspective =
            callerRoleLower === "director"
                ? "director"
                : callerRoleLower === "mentor" || callerRoleLower === "faculty"
                ? "mentor"
                : callerRoleLower === "admin" || callerRoleLower === "coordinator"
                ? "admin"
                : "student";

        return res.status(200).json({
            success: true,
            projectId,
            projectTitle: project.title,
            totalStars: voters.length,
            currentUserStarred,
            currentUserRole: callerPerspective,
            currentUserId,
            categorized: {
                directors,
                mentors,
                students,
                admins,
            },
            counts: {
                total: voters.length,
                directors: directors.length,
                mentors: mentors.length,
                students: students.length,
                admins: admins.length,
            },
        });
    } catch (error) {
        next(error);
    }
};
