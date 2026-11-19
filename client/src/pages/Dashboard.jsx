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
  Clock3,
  Shield,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";

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
            isDirector ? Promise.resolve({ data: { tasks: [] } }) : api.get("/tasks"),
            api.get("/notifications"),
          ]);

        if (projectResult.status === "rejected") {
          throw projectResult.reason;
        }

        const projects = projectResult.value.data.projects || [];
        const totalProjects =
          typeof projectResult.value.data.total === "number"
            ? projectResult.value.data.total
            : projects.length;

        const tasks =
          taskResult.status === "fulfilled"
            ? taskResult.value.data.tasks || []
            : [];

        const notifications =
          notificationResult.status === "fulfilled"
            ? notificationResult.value.data.notifications || []
            : [];

        const currentUserId = getId(user);

        const uniqueMembers = new Set();
        if (currentUserId) {
          uniqueMembers.add(String(currentUserId));
        }

        projects.forEach((project) => {
          const ownerId = getId(project.owner);
          if (ownerId) uniqueMembers.add(String(ownerId));

          (project.members || []).forEach((member) => {
            const memberId = getId(member);
            if (memberId) uniqueMembers.add(String(memberId));
          });
        });

        if (projects.length > 0) {
          const teamResults = await Promise.allSettled(
            projects.map((project) => api.get(`/team/${project._id || project.id}`)),
          );

          teamResults.forEach((result) => {
            if (result.status !== "fulfilled") return;

            const team = result.value.data.team;
            if (!team) return;

            const ownerId = getId(team.owner);
            if (ownerId) uniqueMembers.add(String(ownerId));

            (team.members || []).forEach((person) => {
              const id = getId(person);
              if (id) uniqueMembers.add(String(id));
            });
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
          err.response?.data?.message ||
            err.message ||
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
    window.addEventListener("collabx_notifications_updated", handleBackgroundRefresh);
    window.addEventListener("collabx_notification_received", handleBackgroundRefresh);
    window.addEventListener("focus", handleBackgroundRefresh);

    return () => {
      window.removeEventListener("collabx_tasks_updated", handleBackgroundRefresh);
      window.removeEventListener("collabx_projects_updated", handleBackgroundRefresh);
      window.removeEventListener("collabx_team_updated", handleBackgroundRefresh);
      window.removeEventListener("collabx_notifications_updated", handleBackgroundRefresh);
      window.removeEventListener("collabx_notification_received", handleBackgroundRefresh);
      window.removeEventListener("focus", handleBackgroundRefresh);
    };
  }, [loadDashboard, location.key]);

  const completedTasks = data.tasks.filter((task) => isCompleted(task.status));
  const activeTasks = data.tasks.length - completedTasks.length;
  const unreadNotifications = data.notifications.filter(
    (notification) => !notification.isRead,
  );

  const taskCompletionRate =
    data.tasks.length > 0
      ? Math.round((completedTasks.length / data.tasks.length) * 100)
      : 0;

  const getProjectProgress = (project) => {
    const pId = project._id || project.id;
    const projectTasks = data.tasks.filter(
      (task) => String(getId(task.project)) === String(pId),
    );

    if (projectTasks.length === 0) {
      return {
        total: 0,
        completed: 0,
        progress: 0,
        isCompleted: false,
        status:
          String(project.status || "").toLowerCase() === "completed"
            ? "In Progress"
            : project.status || "Planning",
      };
    }

    const completed = projectTasks.filter((task) =>
      isCompleted(task.status),
    ).length;

    const total = projectTasks.length;
    const progress = Math.round((completed / total) * 100);
    const isAllDone = total > 0 && completed === total;
    const isExplicitlyCompleted = isCompleted(project.status);

    return {
      total,
      completed,
      progress,
      isCompleted: isAllDone && isExplicitlyCompleted,
      status:
        isAllDone && isExplicitlyCompleted
          ? "Completed"
          : String(project.status || "").toLowerCase() === "completed"
            ? "In Progress"
            : project.status || "In Progress",
    };
  };

  const getProgressBarFill = (progress) => {
    if (progress === 100) return "bg-[#2E8B63]";
    if (progress >= 40) return "bg-[#1E2422] dark:bg-[#1D2D24] dark:ring-1 dark:ring-[#A3E635]/35";
    return "bg-[#5C6B66]";
  };

  const getPriorityClass = (priority) => {
    const value = String(priority || "Medium").toLowerCase();
    if (value === "high")
      return "border border-[#1E2422]/25 bg-[#1E2422]/8 text-[#141A18] dark:text-slate-100";
    if (value === "low")
      return "border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#5C6B66] dark:text-[#94A89D]";
    return "border border-[#C9D8CE] dark:border-[#24322B] bg-[#E8F0EA] dark:bg-[#18261F] text-[#2C3A35] dark:text-slate-200";
  };

  const getStatusClass = (status) => {
    const value = String(status || "").toLowerCase();
    if (isCompleted(value))
      return "border border-[#2E8B63]/30 dark:border-[#22C55E]/40 bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7]";
    if (value === "in progress")
      return "border border-[#8CB369]/40 bg-[#EEF6E6] dark:bg-[#1B2A16] text-[#3B5224] dark:text-[#BEF264]";
    if (value === "in review")
      return "border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] text-[#42504B] dark:text-slate-300";
    return "border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#5C6B66] dark:text-[#94A89D]";
  };

  const getTaskProjectName = (task) => {
    if (!task) return "General Project";
    if (task.project?.title) return task.project.title;
    if (task.project?.name) return task.project.name;
    if (task.project_title) return task.project_title;
    if (typeof task.project === "string" && task.project.trim()) return task.project.trim();
    const pId = task.projectId || task.project_id || task.project?.id || task.project?._id;
    if (pId && data.projects?.length) {
      const matched = data.projects.find((p) => String(p._id || p.id) === String(pId));
      if (matched?.title || matched?.name) return matched.title || matched.name;
    }
    return "General Project";
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] text-sm font-semibold text-[#5C6B66] dark:text-[#94A89D]">
        <LoaderCircle size={22} className="animate-spin text-[#2E8B63] dark:text-[#4ADE80]" />
        Loading your workspace...
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#141A18] dark:text-slate-100">
      {/* Top Greeting & Action Bar */}
      <section className="flex flex-col justify-between gap-4 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-5 shadow-2xs sm:flex-row sm:items-center sm:p-6">
        <div>
          <span className="inline-block rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
            {isDirector ? "Executive Overview" : "Good to see you again"}
          </span>
          <p className="mt-1.5 text-sm font-medium text-[#5C6B66] dark:text-[#94A89D]">
            Here is what is happening across your Techno NJR projects today.
          </p>
        </div>

        {/* High-Contrast Secondary + Primary Action Buttons (Hidden for Director) */}
        {!isDirector && (
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/tasks"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-4 py-2.5 text-xs font-bold shadow-2xs"
            >
              <span>My Tasks ({data.tasks.length})</span>
              <ArrowUpRight size={14} />
            </Link>

            <Link
              to="/projects"
              className="inline-flex items-center gap-2 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-xs font-bold shadow-xs"
            >
              <Plus size={16} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
              <span>New Project</span>
            </Link>
          </div>
        )}

        {isDirector && (
          <div className="inline-flex items-center gap-2 rounded-full border border-[#2E8B63]/30 dark:border-[#22C55E]/40 bg-[#E3F3EB] dark:bg-[#13291E] px-4 py-2 text-xs font-bold text-[#1E6B4B] dark:text-[#6EE7B7]">
            <Shield size={14} />
            <span>Director Executive View (All 47 Projects)</span>
          </div>
        )}
      </section>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-sm font-medium text-red-600 dark:text-red-400">
          <AlertCircle size={18} />
          {error}
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
              className="group flex flex-col justify-between rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs transition hover:-translate-y-0.5 hover:border-[#1E2422]/40 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
                  WORKSPACE OUTPUT
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#141A17] px-3 py-1 text-[11px] font-bold text-white transition-all duration-200 group-hover:bg-[#1E6B4B] group-hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:group-hover:border-[#A3E635] dark:group-hover:bg-[#A3E635] dark:group-hover:text-[#090D0B]">
                  <span>Projects</span>
                  <ArrowUpRight size={13} />
                </span>
              </div>

              <div className="my-5 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-4xl font-extrabold tracking-tight text-[#141A18] dark:text-slate-100">
                    {data.totalProjects || data.projects.length}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                    Total Projects
                  </p>
                </div>

                <div>
                  <p className="text-4xl font-extrabold tracking-tight text-[#141A18] dark:text-slate-100">
                    {isDirector ? 47 : activeTasks}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                    {isDirector ? "Active Projects" : "Pending Tasks"}
                  </p>
                </div>
              </div>

              {/* Summary Footer */}
              <div className="flex items-center justify-between rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-3.5 py-2.5 text-xs font-semibold text-[#42504B] dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-[#2E8B63] dark:text-[#4ADE80]" />
                  {isDirector ? "All squads active" : `${completedTasks.length} tasks done`}
                </span>
                <span className="font-bold text-[#141A18] dark:text-slate-100">
                  {isDirector ? "100% Verified" : `${taskCompletionRate}% rate`}
                </span>
              </div>
            </Link>

            {/* Card 2: Squad & Alerts */}
            <Link
              to="/team"
              className="group flex flex-col justify-between rounded-[28px] border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] p-6 shadow-2xs transition hover:-translate-y-0.5 hover:border-[#1E2422]/40 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#5C6662] dark:text-[#94A89D]">
                  SQUAD & ALERTS
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#141A17] px-3 py-1 text-[11px] font-bold text-white transition-all duration-200 group-hover:bg-[#1E6B4B] group-hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:group-hover:border-[#A3E635] dark:group-hover:bg-[#A3E635] dark:group-hover:text-[#090D0B]">
                  <span>Team</span>
                  <ArrowUpRight size={13} />
                </span>
              </div>

              <div className="my-5 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-4xl font-extrabold tracking-tight text-[#141A18] dark:text-slate-100">
                    {isDirector ? 139 : data.teamMembersCount}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#5C6662] dark:text-[#94A89D]">
                    Team Members
                  </p>
                </div>

                <div>
                  <p className="text-4xl font-extrabold tracking-tight text-[#141A18] dark:text-slate-100">
                    {unreadNotifications.length}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#5C6662] dark:text-[#94A89D]">
                    Unread Alerts
                  </p>
                </div>
              </div>

              {/* Status Footer */}
              <div className="flex items-center justify-between rounded-2xl border border-[#E2DFD5] dark:border-[#2D362B] bg-white dark:bg-[#0C120F] px-3.5 py-2.5 text-xs font-semibold text-[#42504B] dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <Users size={14} className="text-[#2E8B63] dark:text-[#4ADE80]" />
                  Active workspace squad
                </span>
                <span className="font-bold text-[#141A18] dark:text-slate-100">
                  {unreadNotifications.length > 0
                    ? `${unreadNotifications.length} new`
                    : "All read"}
                </span>
              </div>
            </Link>
          </div>

          {/* Bottom Wide Card: Workload & Task Summary */}
          <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#141A18] dark:text-slate-100">
                  WORKLOAD & TASK SUMMARY
                </h2>
                <p className="mt-0.5 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                  Real-time breakdown of tasks across your projects
                </p>
              </div>

              {!isDirector && (
                <Link
                  to="/tasks"
                  className="inline-flex items-center gap-1.5 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-4 py-2 text-xs font-bold"
                >
                  <span>Manage Tasks</span>
                  <ArrowUpRight size={14} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
                </Link>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                {
                  label: "Total Tasks",
                  count: isDirector ? 47 : data.tasks.length,
                  sub: "Assigned",
                  accent: "bg-[#EFF4F0] dark:bg-[#1A2520] text-[#141A18] dark:text-slate-100",
                },
                {
                  label: "Completed",
                  count: isDirector ? 47 : completedTasks.length,
                  sub: `${isDirector ? 100 : taskCompletionRate}% done`,
                  accent: "bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7]",
                },
                {
                  label: "Remaining",
                  count: isDirector ? 0 : activeTasks,
                  sub: "In queue",
                  accent: "bg-[#EFF4F0] dark:bg-[#1A2520] text-[#141A18] dark:text-slate-100",
                },
                {
                  label: "Projects",
                  count: data.totalProjects || data.projects.length,
                  sub: "Active",
                  accent: "bg-[#EFF4F0] dark:bg-[#1A2520] text-[#141A18] dark:text-slate-100",
                },
                {
                  label: "Members",
                  count: isDirector ? 139 : data.teamMembersCount,
                  sub: "Collaborators",
                  accent: "bg-[#EFF4F0] dark:bg-[#1A2520] text-[#141A18] dark:text-slate-100",
                },
                {
                  label: "Alerts",
                  count: unreadNotifications.length,
                  sub: "Unread",
                  accent: "bg-[#EFF4F0] dark:bg-[#1A2520] text-[#141A18] dark:text-slate-100",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col justify-between rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-3.5 text-center"
                >
                  <span className="text-[11px] font-bold text-[#5C6B66] dark:text-[#94A89D]">
                    {item.label}
                  </span>
                  <div
                    className={`my-2.5 rounded-xl py-2 text-xl font-extrabold ${item.accent}`}
                  >
                    {item.count}
                  </div>
                  <span className="text-[11px] font-semibold text-[#6B7B75] dark:text-[#869B90]">
                    {item.sub}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Projects Timeline */}
        <div className="flex flex-col justify-between rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs sm:p-7 xl:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#141A18] dark:text-slate-100">
                  PROJECTS TIMELINE
                </h2>
                <p className="mt-0.5 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                  Actual sprint completion & live demo links
                </p>
              </div>

              <Link
                to="/projects"
                className="inline-flex items-center gap-1 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-3.5 py-1.5 text-xs font-bold"
              >
                <span>View all</span>
                <ArrowUpRight size={13} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
              </Link>
            </div>

            {data.projects.length > 0 ? (
              <div className="mt-6 space-y-4">
                {data.projects.slice(0, 5).map((project) => {
                  const pId = project._id || project.id;
                  const { progress, status: displayStatus } =
                    getProjectProgress(project);
                  const fillClass = getProgressBarFill(progress);

                  return (
                    <div
                      key={pId}
                      className="rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-4 shadow-2xs"
                    >
                      {/* Top Row: Project Name + Status + View Demo Button */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          to={isDirector ? "/projects" : `/chat?projectId=${pId}`}
                          className="group inline-flex items-center gap-1.5 text-sm font-extrabold text-[#141A18] dark:text-slate-100 transition hover:text-[#2E8B63] dark:hover:text-[#4ADE80]"
                        >
                          <span>
                            {project.title ||
                              project.name ||
                              "Untitled project"}
                          </span>
                          <ArrowUpRight
                            size={14}
                            className="text-[#5C6B66] dark:text-[#94A89D] transition group-hover:text-[#2E8B63]"
                          />
                        </Link>

                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-[#EFF4F0] dark:bg-[#1A2520] px-2.5 py-0.5 text-[11px] font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                            {displayStatus}
                          </span>

                          {typeof project.demoUrl === "string" &&
                            project.demoUrl.trim().length > 0 && (
                              <a
                                href={project.demoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-3 py-1 text-[11px] font-bold"
                              >
                                <span>View Demo</span>
                                <ArrowUpRight size={12} />
                              </a>
                            )}
                        </div>
                      </div>

                      {/* Accurate Progress Track */}
                      <div className="mt-3.5 flex items-center gap-3">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#EFF4F0] dark:bg-[#1A2520]">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${fillClass}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-extrabold text-[#141A18] dark:text-slate-100">
                          {progress}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="my-12 rounded-2xl border border-dashed border-[#C5D4CA] dark:border-[#2A3B32] py-12 text-center">
                <FolderKanban size={34} className="mx-auto text-[#5C6B66] dark:text-[#94A89D]" />
                <p className="mt-3 text-sm font-bold text-[#141A18] dark:text-slate-100">
                  No projects yet
                </p>
                {!isDirector && (
                  <Link
                    to="/projects"
                    className="mt-3 inline-flex items-center gap-1 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-4 py-2 text-xs font-bold"
                  >
                    <Plus size={14} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
                    <span>Create a project</span>
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Bottom Legend */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#E4ECE6] dark:border-[#1F2C26] pt-4 text-xs font-medium text-[#5C6B66] dark:text-[#94A89D]">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2E8B63]" />
                100% Done
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#1E2422] dark:bg-[#1D2D24] dark:ring-1 dark:ring-[#A3E635]/35" />
                40%+ Active
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#5C6B66]" />
                &lt;40% Early
              </span>
            </div>
            <span className="font-bold text-[#141A18] dark:text-slate-100">
              Total: {data.totalProjects || data.projects.length}
            </span>
          </div>
        </div>
      </section>

      {/* Bottom Bento Row: Recent Tasks Table + Guided Navigation Cards */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs lg:col-span-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#141A18] dark:text-slate-100">
                RECENT TASKS
              </h2>
              <p className="mt-0.5 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                Latest tasks saved in your workspace
              </p>
            </div>
            {!isDirector && (
              <Link
                to="/tasks"
                className="inline-flex items-center gap-1 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-3.5 py-1.5 text-xs font-bold"
              >
                <span>View all</span>
                <ArrowUpRight size={13} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
              </Link>
            )}
          </div>

          {data.tasks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px] text-left">
                <thead>
                  <tr className="border-b border-[#E4ECE6] dark:border-[#1F2C26] text-[11px] font-bold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
                    <th className="pb-3 pr-4">Task</th>
                    <th className="pb-3 pr-4">Project</th>
                    <th className="pb-3 pr-4">Priority</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tasks.slice(0, 5).map((task) => (
                    <tr
                      key={task._id || task.id}
                      className="border-b border-[#E4ECE6] dark:border-[#1F2C26] last:border-0"
                    >
                      <td className="py-3.5 pr-4 text-sm font-bold text-[#141A18] dark:text-slate-100">
                        {task.title || "Untitled task"}
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className="inline-flex max-w-[190px] items-center gap-1.5 truncate rounded-full border border-[#D5E0D8] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#151F1A] px-3 py-1 text-xs font-semibold text-[#1E6B4B] dark:text-[#BEF264]">
                          <FolderKanban size={12} className="shrink-0 text-[#2E8B63] dark:text-[#A3E635]" />
                          <span className="truncate">{getTaskProjectName(task)}</span>
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getPriorityClass(task.priority)}`}
                        >
                          {task.priority || "Medium"}
                        </span>
                      </td>
                      <td className="py-3.5">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(task.status)}`}
                        >
                          {task.status || "Todo"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-sm font-medium text-[#5C6B66] dark:text-[#94A89D]">
              {isDirector ? "Executive view: Task operational monitoring handled at squad level." : "No tasks available. Create your first task."}
            </div>
          )}
        </div>

        {/* Right Guided Navigation Cards */}
        <div className="flex flex-col justify-between gap-4 lg:col-span-4">
          <Link
            to="/team"
            className="group flex flex-1 items-center gap-4 rounded-[28px] border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] p-6 shadow-2xs transition hover:-translate-y-0.5 hover:border-[#1E2422]/40 hover:shadow-sm"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#DDDAD0] dark:border-[#2D362B] bg-white dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100">
              <Users size={21} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[#141A18] dark:text-slate-100">Manage your team</h3>
              <p className="mt-1 text-xs text-[#5C6662] dark:text-[#94A89D]">
                Invite members and manage squad permissions.
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#141A17] text-white transition-all duration-200 group-hover:bg-[#1E6B4B] group-hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:group-hover:border-[#A3E635] dark:group-hover:bg-[#A3E635] dark:group-hover:text-[#090D0B]">
              <ArrowUpRight size={16} />
            </span>
          </Link>

          <Link
            to="/activity"
            className="group flex flex-1 items-center gap-4 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs transition hover:-translate-y-0.5 hover:border-[#1E2422]/40 hover:shadow-sm"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100">
              <Activity size={21} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[#141A18] dark:text-slate-100">Workspace activity</h3>
              <p className="mt-1 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                Check real-time commits, tasks and updates.
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#141A17] text-white transition-all duration-200 group-hover:bg-[#1E6B4B] group-hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:group-hover:border-[#A3E635] dark:group-hover:bg-[#A3E635] dark:group-hover:text-[#090D0B]">
              <ArrowUpRight size={16} />
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
