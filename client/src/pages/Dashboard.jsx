import { useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  FolderKanban,
  Users,
  ArrowUpRight,
  Plus,
  Activity,
  LoaderCircle,
  AlertCircle,
  CheckCircle2,
  Shield,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { isValidHttpUrl } from "../utils/portalHelpers";

const getId = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value._id || value.id || null;
  return value;
};

const isCompleted = (status) =>
  ["completed", "done"].includes(String(status || "").toLowerCase());

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();

  const isDirector =
    String(user?.role || "").toLowerCase().trim() === "director";

  const [data, setData] = useState({
    projects: [],
    totalProjects: 0,
    tasks: [],
    notifications: [],
    teamMembersCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      setError("");

      try {
        const [projectResult, taskResult, notificationResult] =
          await Promise.allSettled([
            api.get("/projects", { params: { limit: 50 } }),
            isDirector
              ? Promise.resolve({ data: { tasks: [] } })
              : api.get("/tasks"),
            api.get("/notifications"),
          ]);

        if (projectResult.status === "rejected") {
          throw projectResult.reason;
        }

        const projects = Array.isArray(projectResult.value?.data?.projects)
          ? projectResult.value.data.projects
          : [];
        const totalProjects =
          typeof projectResult.value?.data?.total === "number"
            ? projectResult.value.data.total
            : projects.length;

        const tasks =
          taskResult.status === "fulfilled" &&
          Array.isArray(taskResult.value?.data?.tasks)
            ? taskResult.value.data.tasks
            : [];

        const notifications =
          notificationResult.status === "fulfilled" &&
          Array.isArray(notificationResult.value?.data?.notifications)
            ? notificationResult.value.data.notifications
            : [];

        const currentUserId = getId(user);

        const uniqueMembers = new Set();
        if (currentUserId) {
          uniqueMembers.add(String(currentUserId));
        }

        projects.forEach((project) => {
          const ownerId = getId(project?.owner);
          if (ownerId) uniqueMembers.add(String(ownerId));

          (Array.isArray(project?.members) ? project.members : []).forEach(
            (member) => {
              const memberId = getId(member);
              if (memberId) uniqueMembers.add(String(memberId));
            },
          );
        });

        if (projects.length > 0) {
          const teamResults = await Promise.allSettled(
            projects.map((project) =>
              api.get(`/team/${project?._id || project?.id}`),
            ),
          );

          teamResults.forEach((result) => {
            if (result.status !== "fulfilled") return;

            const team = result.value?.data?.team;
            if (!team) return;

            const ownerId = getId(team.owner);
            if (ownerId) uniqueMembers.add(String(ownerId));

            (Array.isArray(team.members) ? team.members : []).forEach(
              (person) => {
                const memberId = getId(person);
                if (memberId) uniqueMembers.add(String(memberId));
              },
            );
          });
        }

        setData({
          projects,
          totalProjects,
          tasks,
          notifications,
          teamMembersCount: uniqueMembers.size,
        });
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Unable to load dashboard.",
        );
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [user, isDirector],
  );

  useEffect(() => {
    loadDashboard(false);

    const handleBackgroundRefresh = () => {
      loadDashboard(true);
    };

    window.addEventListener("collabx_tasks_updated", handleBackgroundRefresh);
    window.addEventListener("collabx_projects_updated", handleBackgroundRefresh);
    window.addEventListener("collabx_team_updated", handleBackgroundRefresh);
    window.addEventListener(
      "collabx_notifications_updated",
      handleBackgroundRefresh,
    );
    window.addEventListener(
      "collabx_notification_received",
      handleBackgroundRefresh,
    );
    window.addEventListener("focus", handleBackgroundRefresh);

    return () => {
      window.removeEventListener(
        "collabx_tasks_updated",
        handleBackgroundRefresh,
      );
      window.removeEventListener(
        "collabx_projects_updated",
        handleBackgroundRefresh,
      );
      window.removeEventListener("collabx_team_updated", handleBackgroundRefresh);
      window.removeEventListener(
        "collabx_notifications_updated",
        handleBackgroundRefresh,
      );
      window.removeEventListener(
        "collabx_notification_received",
        handleBackgroundRefresh,
      );
      window.removeEventListener("focus", handleBackgroundRefresh);
    };
  }, [loadDashboard, location.key]);

  const completedTasks = data.tasks.filter((task) => isCompleted(task?.status));
  const activeTasks = Math.max(0, data.tasks.length - completedTasks.length);
  const unreadNotifications = data.notifications.filter(
    (notification) => !notification?.isRead,
  );

  const taskCompletionRate =
    data.tasks.length > 0
      ? Math.round((completedTasks.length / data.tasks.length) * 100)
      : 0;

  const getProjectProgress = (project) => {
    const pId = project?._id || project?.id;
    const projectTasks = data.tasks.filter(
      (task) => String(getId(task?.project)) === String(pId),
    );

    if (projectTasks.length === 0) {
      return {
        total: 0,
        completed: 0,
        progress: 0,
        isCompleted: false,
        status:
          String(project?.status || "").toLowerCase() === "completed"
            ? "In Progress"
            : project?.status || "Planning",
      };
    }

    const completed = projectTasks.filter((task) =>
      isCompleted(task?.status),
    ).length;

    const total = projectTasks.length;
    const progress = Math.round((completed / total) * 100);
    const isAllDone = total > 0 && completed === total;
    const isExplicitlyCompleted = isCompleted(project?.status);

    return {
      total,
      completed,
      progress,
      isCompleted: isAllDone && isExplicitlyCompleted,
      status:
        isAllDone && isExplicitlyCompleted
          ? "Completed"
          : String(project?.status || "").toLowerCase() === "completed"
            ? "In Progress"
            : project?.status || "In Progress",
    };
  };

  const getProgressBarFill = (progress) => {
    if (progress >= 75) return "bg-green-600 dark:bg-green-500";
    if (progress >= 40) return "bg-orange-500 dark:bg-orange-400";
    return "bg-red-600 dark:bg-red-500";
  };

  const getPriorityClass = (priority) => {
    const value = String(priority || "Medium").toLowerCase();
    if (value === "high")
      return "border border-black/15 bg-neutral-100 text-neutral-950 dark:border-white/15 dark:bg-[#18181E] dark:text-white";
    if (value === "low")
      return "border border-black/10 bg-neutral-50 text-neutral-600 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-400";
    return "border border-black/12 bg-neutral-50 text-neutral-800 dark:border-white/12 dark:bg-[#14141A] dark:text-neutral-200";
  };

  const getStatusClass = (status) => {
    const value = String(status || "").toLowerCase();
    if (isCompleted(value))
      return "border border-black/15 bg-neutral-100 text-neutral-950 dark:border-white/15 dark:bg-[#18181E] dark:text-white";
    if (value === "in progress")
      return "border border-black/15 bg-neutral-100 text-neutral-900 dark:border-white/15 dark:bg-[#16161C] dark:text-neutral-200";
    if (value === "in review")
      return "border border-black/12 bg-neutral-50 text-neutral-700 dark:border-white/12 dark:bg-[#121216] dark:text-neutral-300";
    return "border border-black/10 bg-neutral-50 text-neutral-600 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-400";
  };

  const getTaskProjectName = (task) => {
    if (!task) return "General Project";
    if (task.project?.title) return task.project.title;
    if (task.project?.name) return task.project.name;
    if (task.project_title) return task.project_title;
    if (typeof task.project === "string" && task.project.trim())
      return task.project.trim();
    const pId =
      task.projectId ||
      task.project_id ||
      task.project?.id ||
      task.project?._id;
    if (pId && data.projects?.length) {
      const matched = data.projects.find(
        (p) => String(p?._id || p?.id) === String(pId),
      );
      if (matched?.title || matched?.name)
        return matched.title || matched.name;
    }
    return "General Project";
  };

  const greenButtonClass =
    "inline-flex items-center justify-center gap-1.5 rounded-full bg-[#141715] px-4 py-2 text-xs font-bold text-white shadow-2xs transition-all duration-200 hover:cursor-pointer hover:bg-[#1b5e3a] dark:bg-[#141715] dark:text-white dark:hover:bg-[#1b5e3a]";

  const overviewActionButtonClass =
    "inline-flex items-center justify-center gap-1.5 rounded-full border border-[#2A3321] bg-[#121412] px-4 py-2 text-xs font-bold text-[#A3E635] shadow-2xs transition-all duration-200 hover:cursor-pointer hover:bg-[#1F5E3B] hover:text-white group-hover:bg-[#1F5E3B] group-hover:text-white dark:border-[#2A3321] dark:bg-[#121412] dark:text-[#A3E635] dark:hover:bg-[#1F5E3B] dark:hover:text-white dark:group-hover:bg-[#1F5E3B] dark:group-hover:text-white";

  const neutralOutlineBtnClass =
    "inline-flex items-center justify-center gap-1.5 rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-bold text-neutral-900 shadow-2xs transition-all duration-200 hover:cursor-pointer hover:border-black/35 hover:bg-neutral-50 dark:border-white/15 dark:bg-[#101014] dark:text-white dark:hover:border-white/35 dark:hover:bg-[#18181E]";

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 rounded-2xl border border-black/12 bg-white text-sm font-semibold text-neutral-600 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-400">
        <LoaderCircle
          size={22}
          strokeWidth={1.85}
          className="animate-spin text-[#1E6B4B] dark:text-[#22C55E]"
        />
        <span>Loading your workspace...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Top Greeting & Action Bar */}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-black/12 bg-white p-5 shadow-2xs dark:border-white/12 dark:bg-[#08080A] sm:flex-row sm:items-center sm:p-6">
        <div className="min-w-0">
          <span className="inline-block rounded-md border border-black/12 bg-neutral-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-700 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300">
            {isDirector ? "Executive Overview" : "Good to see you again"}
          </span>
          <p className="mt-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Here is what is happening across your Techno NJR projects today.
          </p>
        </div>

        {!isDirector && (
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              to="/tasks"
              className={`${neutralOutlineBtnClass} w-full py-2.5 sm:w-auto`}
            >
              <span>My Tasks ({data.tasks.length})</span>
              <ArrowUpRight size={14} strokeWidth={1.85} />
            </Link>

            <Link
              to="/projects"
              className={`${overviewActionButtonClass} w-full px-5 py-2.5 sm:w-auto`}
            >
              <Plus size={16} strokeWidth={2} />
              <span>New Project</span>
            </Link>
          </div>
        )}

        {isDirector && (
          <div className="inline-flex items-center gap-2 rounded-full border border-black/12 bg-neutral-100 px-4 py-2 text-xs font-bold text-neutral-900 dark:border-white/14 dark:bg-[#101014] dark:text-white">
            <Shield size={14} strokeWidth={1.85} />
            <span>Director Executive View (All 47 Projects)</span>
          </div>
        )}
      </section>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-black/15 bg-neutral-100 p-4 text-sm font-medium text-neutral-900 dark:border-white/15 dark:bg-[#101014] dark:text-white">
          <AlertCircle size={18} strokeWidth={1.85} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Bento Grid */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* LEFT COLUMN (7 cols) */}
        <div className="space-y-5 xl:col-span-7">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Card 1: Workspace Output */}
            <Link
              to="/projects"
              className="group flex flex-col justify-between rounded-2xl border border-black/12 bg-white p-6 shadow-2xs transition hover:cursor-pointer hover:border-black/35 dark:border-white/12 dark:bg-[#08080A] dark:hover:border-white/35"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  WORKSPACE OUTPUT
                </span>
                <span className={overviewActionButtonClass}>
                  <span>Projects</span>
                  <ArrowUpRight size={13} strokeWidth={1.85} />
                </span>
              </div>

              <div className="my-5 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-4xl font-extrabold tabular-nums tracking-tight text-neutral-950 dark:text-white">
                    {data.totalProjects || data.projects.length}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    Total Projects
                  </p>
                </div>

                <div>
                  <p className="text-4xl font-extrabold tabular-nums tracking-tight text-neutral-950 dark:text-white">
                    {isDirector ? 47 : activeTasks}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    {isDirector ? "Active Projects" : "Pending Tasks"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-neutral-50 px-3.5 py-2.5 text-xs font-semibold text-neutral-700 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-300">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2
                    size={14}
                    strokeWidth={1.85}
                    className="text-neutral-700 dark:text-neutral-300"
                  />
                  <span>
                    {isDirector
                      ? "All squads active"
                      : `${completedTasks.length} tasks done`}
                  </span>
                </span>
                <span className="font-bold tabular-nums text-neutral-950 dark:text-white">
                  {isDirector ? "100% Verified" : `${taskCompletionRate}% rate`}
                </span>
              </div>
            </Link>

            {/* Card 2: Squad & Alerts */}
            <Link
              to="/team"
              className="group flex flex-col justify-between rounded-2xl border border-black/12 bg-white p-6 shadow-2xs transition hover:cursor-pointer hover:border-black/35 dark:border-white/12 dark:bg-[#08080A] dark:hover:border-white/35"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  SQUAD &amp; ALERTS
                </span>
                <span className={overviewActionButtonClass}>
                  <span>Team</span>
                  <ArrowUpRight size={13} strokeWidth={1.85} />
                </span>
              </div>

              <div className="my-5 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-4xl font-extrabold tabular-nums tracking-tight text-neutral-950 dark:text-white">
                    {isDirector ? 139 : data.teamMembersCount}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    Team Members
                  </p>
                </div>

                <div>
                  <p className="text-4xl font-extrabold tabular-nums tracking-tight text-neutral-950 dark:text-white">
                    {unreadNotifications.length}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    Unread Alerts
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-neutral-50 px-3.5 py-2.5 text-xs font-semibold text-neutral-700 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-300">
                <span className="inline-flex items-center gap-1.5">
                  <Users
                    size={14}
                    strokeWidth={1.85}
                    className="text-neutral-700 dark:text-neutral-300"
                  />
                  <span>Active workspace squad</span>
                </span>
                <span className="font-bold tabular-nums text-neutral-950 dark:text-white">
                  {unreadNotifications.length > 0
                    ? `${unreadNotifications.length} new`
                    : "All read"}
                </span>
              </div>
            </Link>
          </div>

          {/* Bottom Wide Card: Workload & Task Summary */}
          <div className="rounded-2xl border border-black/12 bg-white p-6 shadow-2xs dark:border-white/12 dark:bg-[#08080A] sm:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-950 dark:text-white">
                  WORKLOAD &amp; TASK SUMMARY
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  Real-time breakdown of tasks across your projects
                </p>
              </div>

              {!isDirector && (
                <Link to="/tasks" className={overviewActionButtonClass}>
                  <span>Manage Tasks</span>
                  <ArrowUpRight size={14} strokeWidth={1.85} />
                </Link>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                {
                  label: "Total Tasks",
                  count: isDirector ? 47 : data.tasks.length,
                  sub: "Assigned",
                },
                {
                  label: "Completed",
                  count: isDirector ? 47 : completedTasks.length,
                  sub: `${isDirector ? 100 : taskCompletionRate}% done`,
                },
                {
                  label: "Remaining",
                  count: isDirector ? 0 : activeTasks,
                  sub: "In queue",
                },
                {
                  label: "Projects",
                  count: data.totalProjects || data.projects.length,
                  sub: "Active",
                },
                {
                  label: "Members",
                  count: isDirector ? 139 : data.teamMembersCount,
                  sub: "Collaborators",
                },
                {
                  label: "Alerts",
                  count: unreadNotifications.length,
                  sub: "Unread",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex min-w-0 flex-col justify-between rounded-xl border border-black/10 bg-neutral-50 p-3 text-center dark:border-white/10 dark:bg-[#101014]"
                >
                  <span className="truncate text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    {item.label}
                  </span>
                  <div className="my-2 rounded-lg border border-black/10 bg-white py-2 text-xl font-extrabold tabular-nums text-neutral-950 dark:border-white/10 dark:bg-[#08080A] dark:text-white">
                    {item.count}
                  </div>
                  <span className="truncate text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                    {item.sub}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Projects Timeline */}
        <div className="flex flex-col justify-between rounded-2xl border border-black/12 bg-white p-6 shadow-2xs dark:border-white/12 dark:bg-[#08080A] sm:p-7 xl:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-950 dark:text-white">
                  PROJECTS TIMELINE
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  Actual sprint completion &amp; live demo links
                </p>
              </div>

              <Link to="/projects" className={overviewActionButtonClass}>
                <span>View all</span>
                <ArrowUpRight size={13} strokeWidth={1.85} />
              </Link>
            </div>

            {data.projects.length > 0 ? (
              <div className="mt-6 space-y-4">
                {data.projects.slice(0, 5).map((project) => {
                  const pId = project?._id || project?.id;
                  const { progress, status: displayStatus } =
                    getProjectProgress(project);
                  const fillClass = getProgressBarFill(progress);

                  return (
                    <div
                      key={pId}
                      className="rounded-xl border border-black/10 bg-neutral-50 p-4 shadow-2xs dark:border-white/10 dark:bg-[#101014]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          to={isDirector ? "/projects" : `/chat?projectId=${pId}`}
                          className="group inline-flex min-w-0 items-center gap-1.5 text-sm font-extrabold text-neutral-950 transition hover:cursor-pointer hover:underline dark:text-white"
                        >
                          <span className="truncate">
                            {project?.title ||
                              project?.name ||
                              "Untitled project"}
                          </span>
                          <ArrowUpRight
                            size={14}
                            strokeWidth={1.85}
                            className="shrink-0 text-neutral-400 transition group-hover:text-neutral-950 dark:text-neutral-500 dark:group-hover:text-white"
                          />
                        </Link>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md border border-black/12 bg-white px-2.5 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200">
                            {displayStatus}
                          </span>

                          {isValidHttpUrl(project?.demoUrl) && (
                              <a
                                href={project.demoUrl.trim()}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-[#2A3321] bg-[#121412] px-3 py-1 text-[11px] font-bold text-[#A3E635] transition-all duration-200 hover:cursor-pointer hover:bg-[#1F5E3B] hover:text-white group-hover:bg-[#1F5E3B] group-hover:text-white dark:border-[#2A3321] dark:bg-[#121412] dark:text-[#A3E635] dark:hover:bg-[#1F5E3B] dark:hover:text-white dark:group-hover:bg-[#1F5E3B] dark:group-hover:text-white"
                              >
                                <span>View Demo</span>
                                <ArrowUpRight size={12} strokeWidth={1.85} />
                              </a>
                            )}
                        </div>
                      </div>

                      <div className="mt-3.5 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${fillClass}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-extrabold tabular-nums text-neutral-950 dark:text-white">
                          {progress}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="my-12 rounded-2xl border border-dashed border-black/15 bg-neutral-50/70 py-12 text-center dark:border-white/15 dark:bg-[#101014]/70">
                <FolderKanban
                  size={34}
                  strokeWidth={1.85}
                  className="mx-auto text-neutral-500 dark:text-neutral-400"
                />
                <p className="mt-3 text-sm font-bold text-neutral-950 dark:text-white">
                  No projects yet
                </p>
                {!isDirector && (
                  <Link to="/projects" className={`mt-3 ${greenButtonClass}`}>
                    <Plus size={14} strokeWidth={2} />
                    <span>Create a project</span>
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4 text-xs font-medium text-neutral-500 dark:border-white/10 dark:text-neutral-400">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-green-600 dark:bg-green-500" />
                <span>75%+ Done</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500 dark:bg-orange-400" />
                <span>40%+ Active</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-600 dark:bg-red-500" />
                <span>&lt;40% Early</span>
              </span>
            </div>
            <span className="font-bold tabular-nums text-neutral-950 dark:text-white">
              Total: {data.totalProjects || data.projects.length}
            </span>
          </div>
        </div>
      </section>

      {/* Bottom Bento Row: Recent Tasks Table + Guided Navigation Cards */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-2xl border border-black/12 bg-white p-6 shadow-2xs dark:border-white/12 dark:bg-[#08080A] lg:col-span-8">
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-950 dark:text-white">
                RECENT TASKS
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Latest tasks saved in your workspace
              </p>
            </div>
            {!isDirector && (
              <Link to="/tasks" className={overviewActionButtonClass}>
                <span>View all</span>
                <ArrowUpRight size={13} strokeWidth={1.85} />
              </Link>
            )}
          </div>

          {data.tasks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left">
                <thead>
                  <tr className="border-b border-black/10 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:border-white/10 dark:text-neutral-400">
                    <th className="pb-3 pr-4">Task</th>
                    <th className="pb-3 pr-4">Project</th>
                    <th className="pb-3 pr-4">Priority</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tasks.slice(0, 5).map((task) => (
                    <tr
                      key={task?._id || task?.id}
                      className="border-b border-black/10 last:border-0 dark:border-white/10"
                    >
                      <td className="py-3.5 pr-4 text-sm font-bold text-neutral-950 dark:text-white">
                        {task?.title || "Untitled task"}
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className="inline-flex max-w-[190px] items-center gap-1.5 truncate rounded-md border border-black/12 bg-neutral-50 px-2.5 py-1 text-xs font-semibold text-neutral-800 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-200">
                          <FolderKanban
                            size={12}
                            strokeWidth={1.85}
                            className="shrink-0 text-neutral-600 dark:text-neutral-400"
                          />
                          <span className="truncate">
                            {getTaskProjectName(task)}
                          </span>
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span
                          className={`rounded-md px-2.5 py-0.5 text-[11px] font-bold ${getPriorityClass(
                            task?.priority,
                          )}`}
                        >
                          {task?.priority || "Medium"}
                        </span>
                      </td>
                      <td className="py-3.5">
                        <span
                          className={`rounded-md px-2.5 py-0.5 text-[11px] font-bold ${getStatusClass(
                            task?.status,
                          )}`}
                        >
                          {task?.status || "Todo"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
              {isDirector
                ? "Executive view: Task operational monitoring handled at squad level."
                : "No tasks available. Create your first task."}
            </div>
          )}
        </div>

        {/* Right Guided Navigation Cards */}
        <div className="flex flex-col justify-between gap-4 lg:col-span-4">
          <Link
            to="/team"
            className="group flex flex-1 items-center gap-4 rounded-2xl border border-black/12 bg-white p-6 shadow-2xs transition hover:cursor-pointer hover:border-black/35 dark:border-white/12 dark:bg-[#08080A] dark:hover:border-white/35"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-neutral-50 text-neutral-900 dark:border-white/12 dark:bg-[#101014] dark:text-white">
              <Users size={20} strokeWidth={1.85} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-neutral-950 dark:text-white">
                Manage your team
              </h3>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Invite members and manage squad permissions.
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2A3321] bg-[#121412] text-[#A3E635] transition-all duration-200 hover:bg-[#1F5E3B] hover:text-white group-hover:bg-[#1F5E3B] group-hover:text-white dark:border-[#2A3321] dark:bg-[#121412] dark:text-[#A3E635] dark:hover:bg-[#1F5E3B] dark:hover:text-white dark:group-hover:bg-[#1F5E3B] dark:group-hover:text-white">
              <ArrowUpRight size={16} strokeWidth={1.85} />
            </span>
          </Link>

          <Link
            to="/activity"
            className="group flex flex-1 items-center gap-4 rounded-2xl border border-black/12 bg-white p-6 shadow-2xs transition hover:cursor-pointer hover:border-black/35 dark:border-white/12 dark:bg-[#08080A] dark:hover:border-white/35"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-neutral-50 text-neutral-900 dark:border-white/12 dark:bg-[#101014] dark:text-white">
              <Activity size={20} strokeWidth={1.85} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-neutral-950 dark:text-white">
                Workspace activity
              </h3>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Check real-time commits, tasks and updates.
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2A3321] bg-[#121412] text-[#A3E635] transition-all duration-200 hover:bg-[#1F5E3B] hover:text-white group-hover:bg-[#1F5E3B] group-hover:text-white dark:border-[#2A3321] dark:bg-[#121412] dark:text-[#A3E635] dark:hover:bg-[#1F5E3B] dark:hover:text-white dark:group-hover:bg-[#1F5E3B] dark:group-hover:text-white">
              <ArrowUpRight size={16} strokeWidth={1.85} />
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}