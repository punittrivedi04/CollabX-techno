export function getErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  return (
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

export function getInitials(name = "User") {
  return String(name || "User")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(value) {
  if (!value) return "Just now";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Just now";
  const diffMs = Date.now() - d.getTime();
  const seconds = Math.floor(Math.max(0, diffMs) / 1000);

  if (seconds < 45) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} mins ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;

  const years = Math.floor(days / 365);
  if (years === 1) return "1 year ago";
  return `${years} years ago`;
}

export function timeAgo(value) {
  return formatRelativeTime(value);
}

export function isValidHttpUrl(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 500) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const isPresentHttpUrl = isValidHttpUrl;

export function getTodayInputDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function calculateProjectProgress(item) {
  if (!item) return 0;
  if (typeof item === "number") return Math.min(100, Math.max(0, item));

  const total = Number(
    item.taskProgress?.total ??
    item.total_tasks ??
    item.totalTasks ??
    item.total ??
    0
  );
  const completed = Number(
    item.taskProgress?.completed ??
    item.completed_tasks ??
    item.completedTasks ??
    item.completed ??
    0
  );

  // Strict task progress formula: total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0
  if (total > 0) {
    return Math.round((completed / total) * 100);
  }

  // If task count is 0, progress is strictly 0%
  const hasTaskData =
    item.taskProgress !== undefined ||
    item.total_tasks !== undefined ||
    item.totalTasks !== undefined ||
    item.total !== undefined;

  if (hasTaskData) {
    return 0;
  }

  // Fallback to item.progress if valid number (never hardcoded 100% just because status is Completed)
  if (typeof item.progress === "number" && Number.isFinite(item.progress)) {
    return Math.min(100, Math.max(0, item.progress));
  }

  return 0;
}

export function resolveProjectStatus(item) {
  if (!item) return "Planning";
  if (typeof item === "string") return item;

  const rawStatus = item.status || "Planning";
  const total = Number(
    item.taskProgress?.total ??
    item.total_tasks ??
    item.totalTasks ??
    item.total ??
    0
  );
  const completed = Number(
    item.taskProgress?.completed ??
    item.completed_tasks ??
    item.completedTasks ??
    item.completed ??
    0
  );

  const hasTaskData =
    item.taskProgress !== undefined ||
    item.total_tasks !== undefined ||
    item.totalTasks !== undefined ||
    item.total !== undefined;

  // If claimed "Completed" but tasks are not all completed, or 0 tasks exist, resolve to In Progress / Planning
  if (String(rawStatus).toLowerCase() === "completed" && hasTaskData) {
    if (total === 0 || completed < total) {
      return completed > 0 ? "In Progress" : "Planning";
    }
  }

  return rawStatus;
}

export function isProjectCompleted(item) {
  if (!item) return false;
  const status = resolveProjectStatus(item);
  return String(status).toLowerCase() === "completed";
}
