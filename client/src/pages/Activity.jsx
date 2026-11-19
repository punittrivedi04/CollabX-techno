import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import {
  Activity as ActivityIcon,
  FolderKanban,
  CheckSquare,
  Users,
  Clock3,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  UserPlus,
  UserMinus,
  FolderPlus,
  Pencil,
  Trash2,
  AlertCircle,
  CalendarDays,
  ListFilter,
  LoaderCircle,
  ChevronDown,
} from "lucide-react";

const LIMIT = 20;

const FILTERS = ["All", "Project", "Task", "Team"];

const ACTION_CONFIG = {
  project_created: {
    label: "Project Created",
    icon: FolderPlus,
    badge: "border border-[#C5D8B6] dark:border-[#2B3F22] bg-[#EEF6E6] dark:bg-[#1B2A16] text-[#2C3A35] dark:text-slate-200",
  },
  project_updated: {
    label: "Project Updated",
    icon: Pencil,
    badge: "border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#42504B] dark:text-slate-300",
  },
  project_deleted: {
    label: "Project Deleted",
    icon: Trash2,
    badge: "border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
  },
  task_created: {
    label: "Task Created",
    icon: CheckSquare,
    badge: "border border-[#C9D8CE] dark:border-[#24322B] bg-[#E8F0EA] dark:bg-[#18261F] text-[#2C3A35] dark:text-slate-200",
  },
  task_updated: {
    label: "Task Updated",
    icon: Pencil,
    badge: "border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#42504B] dark:text-slate-300",
  },
  task_completed: {
    label: "Task Completed",
    icon: CheckCircle2,
    badge: "border border-[#2E8B63]/30 dark:border-[#22C55E]/40 bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7]",
  },
  task_assigned: {
    label: "Task Assigned",
    icon: UserPlus,
    badge: "border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] text-[#42504B] dark:text-slate-300",
  },
  team_member_added: {
    label: "Member Added",
    icon: UserPlus,
    badge: "border border-[#2E8B63]/30 dark:border-[#22C55E]/40 bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7]",
  },
  team_member_removed: {
    label: "Team Updated",
    icon: UserMinus,
    badge: "border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] text-[#42504B] dark:text-slate-300",
  },
  invitation_accepted: {
    label: "Invitation Accepted",
    icon: CheckCircle2,
    badge: "border border-[#2E8B63]/30 dark:border-[#22C55E]/40 bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7]",
  },
};

const getToken = () => {
  const possibleKeys = ["token", "collabx_token", "authToken", "accessToken"];

  for (const key of possibleKeys) {
    const value = localStorage.getItem(key);
    if (value) return value;
  }

  const storedUser = localStorage.getItem("user");

  if (storedUser) {
    try {
      const parsed = JSON.parse(storedUser);
      return parsed.token || parsed.accessToken || null;
    } catch {
      return null;
    }
  }

  return null;
};

const formatDate = (date) => {
  if (!date) return "Date unavailable";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";

  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const timeAgo = (date) => {
  if (!date) return "";
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
};

const getProjectId = (project) =>
  typeof project === "string" ? project : project?._id || project?.id;

const getActionConfig = (action) =>
  ACTION_CONFIG[action] || {
    label: action?.replaceAll("_", " ") || "Activity",
    icon: ActivityIcon,
    badge: "border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#42504B] dark:text-slate-300",
  };

export default function Activity() {
  const [activities, setActivities] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("All");
  const [filter, setFilter] = useState("All");

  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchActivities = useCallback(async (showRefresh = false) => {
    const token = getToken();

    if (!token) {
      setError("Authentication token not found. Please login again.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const projectResponse = await api.get("/projects");

      const projectData =
        projectResponse.data?.projects || projectResponse.data?.data || [];

      const projectList = Array.isArray(projectData) ? projectData : [];
      setProjects(projectList);

      const requests = projectList.map((project) => {
        const projectId = getProjectId(project);
        if (!projectId) return Promise.resolve(null);

        return api.get(`/activities/project/${projectId}`, {
          params: {
            page: 1,
            limit: LIMIT,
          },
        });
      });

      const responses = await Promise.allSettled(requests);

      const combinedActivities = [];

      responses.forEach((result) => {
        if (result.status !== "fulfilled" || !result.value) return;

        const data = result.value.data;
        if (data?.success && Array.isArray(data.activities)) {
          combinedActivities.push(...data.activities);
        }
      });

      const uniqueActivities = Array.from(
        new Map(combinedActivities.map((item) => [item.id || item._id, item])).values(),
      ).sort(
        (a, b) =>
          new Date(b.createdAt || b.created_at).getTime() -
          new Date(a.createdAt || a.created_at).getTime(),
      );

      setActivities(uniqueActivities);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load activities. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const filteredActivities = useMemo(() => {
    return activities.filter((item) => {
      const matchesType =
        filter === "All" ||
        (filter === "Project" && item.entityType === "Project") ||
        (filter === "Task" && item.entityType === "Task") ||
        (filter === "Team" && item.entityType === "Team");

      const matchesProject =
        selectedProject === "All" ||
        String(getProjectId(item.project)) === String(selectedProject);

      return matchesType && matchesProject;
    });
  }, [activities, filter, selectedProject]);

  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / LIMIT));
  const currentPage = Math.min(page, totalPages);

  const paginatedActivities = filteredActivities.slice(
    (currentPage - 1) * LIMIT,
    currentPage * LIMIT,
  );

  const stats = useMemo(
    () => ({
      total: activities.length,
      projects: activities.filter((a) => a.entityType === "Project").length,
      tasks: activities.filter((a) => a.entityType === "Task").length,
      team: activities.filter((a) => a.entityType === "Team").length,
    }),
    [activities],
  );

  const changeFilter = (value) => {
    setFilter(value);
    setPage(1);
  };

  const changeProject = (value) => {
    setSelectedProject(value);
    setPage(1);
  };

  return (
    <div className="space-y-6 pb-8 text-[#141A18] dark:text-slate-100">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-5 shadow-2xs sm:flex-row sm:items-center sm:p-6">
        <div>
          <span className="inline-block rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
            Workspace Insights
          </span>
          <p className="mt-1.5 text-sm font-medium text-[#5C6B66] dark:text-[#94A89D]">
            Every important update across your projects, tasks and team.
          </p>
        </div>

        <button
          onClick={() => fetchActivities(true)}
          disabled={refreshing || loading}
          className="inline-flex w-fit items-center gap-2 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-sm font-bold shadow-2xs disabled:opacity-50"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Bento Stat Cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          {
            label: "Total Activities",
            value: stats.total,
            Icon: ActivityIcon,
            badge: "border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100",
            bg: "border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815]",
          },
          {
            label: "Projects",
            value: stats.projects,
            Icon: FolderKanban,
            badge: "border border-[#E2DFD5] dark:border-[#2D362B] bg-white dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100",
            bg: "border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A]",
          },
          {
            label: "Tasks",
            value: stats.tasks,
            Icon: CheckSquare,
            badge: "border border-[#2E8B63]/25 bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7]",
            bg: "border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815]",
          },
          {
            label: "Team",
            value: stats.team,
            Icon: Users,
            badge: "border border-[#E2DFD5] dark:border-[#2D362B] bg-white dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100",
            bg: "border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A]",
          },
        ].map(({ label, value, Icon, badge, bg }) => (
          <div
            key={label}
            className={`rounded-[28px] border ${bg} p-5 shadow-2xs`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
                {label}
              </p>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full ${badge}`}
              >
                <Icon size={17} />
              </div>
            </div>

            <p className="mt-3 text-3xl font-extrabold tracking-tight text-[#141A18] dark:text-slate-100">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Activity Panel */}
      <div className="overflow-hidden rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] shadow-2xs">
        <div className="flex flex-col justify-between gap-4 border-b border-[#E4ECE6] dark:border-[#1F2C26] p-6 lg:flex-row lg:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[#141A18] dark:text-slate-100">
              <CircleDot size={18} className="text-[#2E8B63] dark:text-[#4ADE80]" />
              Recent Activity
            </h2>
            <p className="mt-0.5 text-xs text-[#5C6B66] dark:text-[#94A89D]">
              Chronological log of workspace events
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ListFilter size={16} className="text-[#5C6B66] dark:text-[#94A89D]" />

            <div className="relative">
              <select
                value={selectedProject}
                onChange={(e) => changeProject(e.target.value)}
                className="max-w-[220px] appearance-none rounded-full border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] py-2.5 pl-4 pr-10 text-xs font-bold text-[#141A18] dark:text-slate-100 shadow-2xs outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E] cursor-pointer"
              >
                <option value="All">All Projects</option>
                {projects.map((project) => (
                  <option
                    key={getProjectId(project)}
                    value={getProjectId(project)}
                  >
                    {project.name || project.title || "Untitled Project"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2 border-b border-[#E4ECE6] dark:border-[#1F2C26] px-6 py-4">
          {FILTERS.map((item) => {
            const active = filter === item;

            return (
              <button
                key={item}
                onClick={() => changeFilter(item)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                  active
                    ? "bg-[#1E2422] dark:bg-[#1D2D24] dark:ring-1 dark:ring-[#A3E635]/35 text-white shadow-2xs"
                    : "border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] text-[#42504B] dark:text-slate-300 hover:border-[#1E2422]/40 hover:text-[#141A18] dark:hover:text-slate-100"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <LoaderCircle size={32} className="animate-spin text-[#2E8B63] dark:text-[#4ADE80]" />
              <p className="mt-4 text-sm font-bold text-[#141A18] dark:text-slate-100">
                Loading workspace activity...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-red-100 dark:bg-red-950/60 p-4 text-red-600 dark:text-red-400">
                <AlertCircle size={28} />
              </div>
              <h3 className="mt-4 font-bold text-[#141A18] dark:text-slate-100">
                Unable to load activity
              </h3>
              <p className="mt-1.5 max-w-sm text-sm text-[#5C6B66] dark:text-[#94A89D]">{error}</p>
              <button
                onClick={() => fetchActivities()}
                className="mt-5 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-xs font-bold"
              >
                Try Again
              </button>
            </div>
          ) : paginatedActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] p-5 text-[#5C6B66] dark:text-[#94A89D]">
                <ActivityIcon size={32} />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#141A18] dark:text-slate-100">
                No activity found
              </h3>
              <p className="mt-1.5 max-w-sm text-sm text-[#5C6B66] dark:text-[#94A89D]">
                Project updates, task changes and team activities will appear
                here automatically.
              </p>
            </div>
          ) : (
            <>
              <div className="relative">
                <div className="absolute bottom-5 left-[19px] top-5 w-0.5 bg-[#D4DFD7] dark:bg-[#1F2A24]" />

                <div className="space-y-2">
                  {paginatedActivities.map((item) => {
                    const config = getActionConfig(item.action);
                    const Icon = config.icon;
                    const userName = item.user?.name || "Unknown User";
                    const projectName =
                      typeof item.project === "object"
                        ? item.project?.name
                        : null;

                    return (
                      <div
                        key={item.id || item._id}
                        className="relative flex gap-4 rounded-2xl p-3.5 transition hover:bg-white dark:hover:bg-[#1E2A24] sm:p-4"
                      >
                        <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] text-[#42504B] dark:text-slate-300 shadow-2xs">
                          <Icon size={17} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-[#141A18] dark:text-slate-100">
                              {userName}
                            </span>

                            <span
                              className={`rounded-full px-3 py-0.5 text-[11px] font-semibold ${config.badge}`}
                            >
                              {config.label}
                            </span>
                          </div>

                          <p className="mt-1.5 text-sm leading-relaxed text-[#42504B] dark:text-slate-300">
                            {item.description}
                          </p>

                          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-[#5C6B66] dark:text-[#94A89D]">
                            <span className="flex items-center gap-1">
                              <Clock3 size={12} />
                              {timeAgo(item.createdAt || item.created_at)}
                            </span>

                            <span className="flex items-center gap-1">
                              <CalendarDays size={12} />
                              {formatDate(item.createdAt || item.created_at)}
                            </span>

                            {projectName && (
                              <span className="flex items-center gap-1 font-bold text-[#141A18] dark:text-slate-100">
                                <FolderKanban size={12} className="text-[#2E8B63] dark:text-[#4ADE80]" />
                                {projectName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pagination */}
              <div className="mt-6 flex flex-col justify-between gap-4 border-t border-[#E4ECE6] dark:border-[#1F2C26] pt-5 sm:flex-row sm:items-center">
                <p className="text-xs font-medium text-[#5C6B66] dark:text-[#94A89D]">
                  Showing{" "}
                  <span className="font-bold text-[#141A18] dark:text-slate-100">
                    {(currentPage - 1) * LIMIT + 1} -{" "}
                    {Math.min(currentPage * LIMIT, filteredActivities.length)}
                  </span>{" "}
                  of{" "}
                  <span className="font-bold text-[#141A18] dark:text-slate-100">
                    {filteredActivities.length}
                  </span>{" "}
                  activities
                </p>

                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    className="rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] p-2 disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <span className="min-w-20 text-center text-xs font-bold text-[#141A18] dark:text-slate-100">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      setPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    className="rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] p-2 disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
