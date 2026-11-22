export const parsePositiveInt = (value) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "boolean") return null;
    const str = String(value).trim();
    if (!/^\d+$/.test(str)) return null;
    const num = Number(str);
    return Number.isSafeInteger(num) && num > 0 ? num : null;
};

/**
 * Escape SQL LIKE / ILIKE wildcards (%, _, \) so user search input
 * cannot trigger wildcard flooding or degrade PostgreSQL scans.
 */
export const escapeLikePattern = (value) => {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[\\%_]/g, "\\$&");
};

/**
 * Strictly pick only allowlisted own properties from a plain object.
 * Prevents mass assignment and prototype pollution.
 */
export const pickAllowedFields = (source, allowedKeys) => {
    const result = Object.create(null);
    if (!source || typeof source !== "object" || Array.isArray(source)) {
        return result;
    }
    for (const key of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            result[key] = source[key];
        }
    }
    return result;
};

export const isSafeHttpUrl = (value) => {
    if (!value || typeof value !== "string") return true;
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (trimmed.length > 500) return false;
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
};

export const isPresentHttpUrl = (value) => {
    if (!value || typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 500) return false;
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
};

export const safeUser = (user) => {
    if (!user) return null;
    return {
        id: user.id,
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || "student",
        roll_no: user.roll_no || "",
        phone: user.phone || "",
        mentor_id: user.mentor_id ?? null,
        role_classified: Boolean(user.role_classified),
        is_verified: user.is_verified ?? true,
        is_active: user.is_active ?? true,
        createdAt: user.created_at || user.createdAt,
    };
};

export const formatProject = (p, members = [], owner = null) => {
    if (!p) return null;
    const ownerObj = owner || p.owner || (p.owner_id ? { id: p.owner_id, _id: p.owner_id, name: p.owner_name || "Lead", email: p.owner_email || "" } : null);
    // Ensure owner is NEVER duplicated in members list
    const cleanMembers = (members || []).filter((m) => {
        const memberId = m?.id ?? m?._id ?? m;
        return String(memberId) !== String(p.owner_id);
    });
    const uniqueMemberCount = cleanMembers.length + (ownerObj ? 1 : 0);

    const hasTaskCount = p.total_tasks !== undefined || p.totalTasks !== undefined || p.taskProgress?.total !== undefined;
    const totalTasks = Number(p.total_tasks ?? p.totalTasks ?? p.taskProgress?.total ?? 0);
    const completedTasks = Number(p.completed_tasks ?? p.completedTasks ?? p.taskProgress?.completed ?? 0);
    
    // Strict task-based progress: total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0
    let progressVal = 0;
    if (hasTaskCount) {
        progressVal = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    } else if (p.progress !== null && p.progress !== undefined) {
        progressVal = Number(p.progress);
    }

    // Status consistency: if claimed Completed but tasks are not all completed or 0 tasks exist, resolve to In Progress
    let statusVal = p.status || "Planning";
    if (String(statusVal).toLowerCase() === "completed" && hasTaskCount && (totalTasks === 0 || completedTasks < totalTasks)) {
        statusVal = completedTasks > 0 ? "In Progress" : "Planning";
    }

    return {
        ...p,
        id: p.id,
        _id: p.id,
        name: p.title,
        title: p.title,
        description: p.description || "",
        status: statusVal,
        priority: p.priority || "Medium",
        progress: progressVal,
        deadline: p.deadline || null,
        owner_id: p.owner_id,
        mentor_id: p.mentor_id || null,
        owner: ownerObj,
        members: cleanMembers,
        teamMembers: cleanMembers,
        memberCount: uniqueMemberCount,
        teamSize: uniqueMemberCount,
        taskProgress: hasTaskCount ? {
            total: totalTasks,
            completed: completedTasks,
            pending: Math.max(0, totalTasks - completedTasks),
            completionRate: progressVal,
        } : p.taskProgress,
        githubUrl: p.github_url || "",
        demoUrl: p.demo_url || "",
        pptUrl: p.ppt_url || "",
        mentorReview: p.mentor_review || null,
        reviewedAt: p.reviewed_at || null,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
    };
};

export const formatTask = (t, project = null, assignedTo = null, createdBy = null) => {
    if (!t) return null;
    const projectOwnerId = t.project_owner_id || (project ? (project.owner_id || project.owner?.id) : null) || null;
    return {
        ...t,
        id: t.id,
        _id: t.id,
        title: t.title,
        description: t.description || "",
        status: t.status || "Todo",
        priority: t.priority || "Medium",
        project: project || t.project || (t.project_id ? { id: t.project_id, _id: t.project_id, name: t.project_title || `Project ${t.project_id}`, title: t.project_title || `Project ${t.project_id}`, owner_id: projectOwnerId } : null),
        projectId: t.project_id,
        project_owner_id: projectOwnerId,
        projectOwnerId: projectOwnerId,
        assignedTo: assignedTo || t.assignedTo || (t.assigned_to ? { id: t.assigned_to, _id: t.assigned_to, name: t.assignee_name || "Assignee", email: t.assignee_email || "" } : null),
        createdBy: createdBy || t.createdBy || (t.created_by ? { id: t.created_by, _id: t.created_by, name: t.creator_name || "Creator", email: t.creator_email || "" } : null),
        dueDate: t.due_date,
        completedAt: t.completed_at,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
    };
};

export const formatNotification = (n) => {
    if (!n) return null;
    return {
        ...n,
        id: n.id,
        _id: n.id,
        title: n.title || "Notification",
        message: n.message,
        type: n.type || "general",
        isRead: Boolean(n.is_read),
        userId: n.user_id,
        recipient: n.user_id,
        createdAt: n.created_at,
    };
};
