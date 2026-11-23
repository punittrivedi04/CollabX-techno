import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  MessageSquare,
  Users,
  Activity,
  Bell,
  Menu,
  X,
  Settings,
  LogOut,
  Code2,
  Plus,
  LoaderCircle,
  AlertCircle,
  ChevronDown,
  GraduationCap,
  Award,
  UserCog,
  Megaphone,
  BarChart3,
  Trophy,
  ChevronsLeftRight,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import SearchableSelect from "../components/portal/SearchableSelect";
import PortalErrorBoundary from "../components/portal/PortalErrorBoundary";
import api from "../services/api";
import {
  getEffectiveRole,
  getHomeRouteForUser,
  getRoleDisplayLabel,
} from "../utils/roles";

const studentRailLinks = [
  { name: "Overview", path: "/dashboard", icon: LayoutDashboard, end: true },
  { name: "Projects", path: "/projects", icon: FolderKanban },
  { name: "Leaderboard", path: "/leaderboard", icon: Trophy },
  { name: "My Tasks", path: "/tasks", icon: CheckSquare },
  { name: "Messages", path: "/chat", icon: MessageSquare },
  { name: "Team", path: "/team", icon: Users },
  { name: "Activity", path: "/activity", icon: Activity },
  { name: "Developer Assist", path: "/developer-assist", icon: Code2 },
  { name: "Profile & Settings", path: "/profile", icon: Settings },
];

const adminRailLinks = [
  { name: "Admin Overview", path: "/admin", icon: LayoutDashboard, end: true },
  { name: "Leaderboard", path: "/leaderboard", icon: Trophy },
  { name: "Students", path: "/admin/students", icon: GraduationCap },
  { name: "Mentors", path: "/admin/mentors", icon: Award },
  { name: "Teams & Projects", path: "/admin/teams", icon: FolderKanban },
  { name: "Role Management", path: "/admin/roles", icon: UserCog },
  {
    name: "Announcements & Logs",
    path: "/admin/announcements",
    icon: Megaphone,
  },
  { name: "Official Chat", path: "/chat", icon: MessageSquare },
  { name: "Profile & Settings", path: "/profile", icon: Settings },
];

const mentorRailLinks = [
  { name: "Mentor Overview", path: "/mentor", icon: LayoutDashboard, end: true },
  { name: "Leaderboard", path: "/leaderboard", icon: Trophy },
  { name: "My Students", path: "/mentor/students", icon: GraduationCap },
  { name: "My Teams", path: "/mentor/teams", icon: FolderKanban },
  { name: "Tasks", path: "/mentor/tasks", icon: CheckSquare },
  { name: "Announcements", path: "/mentor/announcements", icon: Megaphone },
  { name: "Official Chat", path: "/chat", icon: MessageSquare },
  { name: "Profile & Settings", path: "/profile", icon: Settings },
];

const directorRailLinks = [
  { name: "Executive Overview", path: "/director", icon: LayoutDashboard, end: true },
  { name: "Students", path: "/director/students", icon: GraduationCap },
  { name: "Leaderboard", path: "/leaderboard", icon: Trophy },
  { name: "Institute Reports", path: "/director/reports", icon: BarChart3 },
  { name: "Profile & Settings", path: "/profile", icon: Settings },
];

function resolvePageTitle(pathname) {
  const exactTitles = {
    "/dashboard": "OVERVIEW",
    "/leaderboard": "COLLEGE LEADERBOARD",
    "/projects": "PROJECTS",
    "/tasks": "MY TASKS",
    "/chat": "MESSAGES",
    "/team": "TEAM SQUAD",
    "/activity": "ACTIVITY LOG",
    "/notifications": "NOTIFICATIONS",
    "/developer-assist": "DEVELOPER ASSIST",
    "/profile": "USER PROFILE",
    "/admin": "ADMIN OVERVIEW",
    "/admin/students": "STUDENT MANAGEMENT",
    "/admin/mentors": "MENTOR MANAGEMENT",
    "/admin/teams": "TEAMS & PROJECTS",
    "/admin/roles": "ROLE MANAGEMENT",
    "/admin/announcements": "ANNOUNCEMENTS & LOGS",
    "/mentor": "MENTOR OVERVIEW",
    "/mentor/students": "MY STUDENTS",
    "/mentor/teams": "MY TEAMS",
    "/mentor/tasks": "TASKS",
    "/mentor/announcements": "TEAM ANNOUNCEMENTS",
    "/director": "EXECUTIVE OVERVIEW",
    "/director/students": "STUDENT DIRECTORY",
    "/director/reports": "INSTITUTE REPORTS",
  };
  if (exactTitles[pathname]) return exactTitles[pathname];
  if (pathname.startsWith("/admin/students/")) return "STUDENT PROFILE";
  if (pathname.startsWith("/admin/mentors/")) return "MENTOR DETAILS";
  if (pathname.startsWith("/admin/teams/")) return "TEAM DETAILS";
  if (pathname.startsWith("/mentor/students/")) return "STUDENT PROFILE";
  if (pathname.startsWith("/mentor/teams/")) return "TEAM DETAILS";
  if (pathname.startsWith("/director/students/")) return "STUDENT INSPECTION";
  return "WORKSPACE";
}

function getInitials(name = "User") {
  return String(name || "User")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function getTodayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dockExpanded, setDockExpanded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [createError, setCreateError] = useState("");
  const [mentors, setMentors] = useState([]);
  const [loadingMentors, setLoadingMentors] = useState(false);
  const [newProjectForm, setNewProjectForm] = useState({
    name: "",
    description: "",
    status: "Planning",
    priority: "Medium",
    deadline: "",
    mentorId: "",
  });

  const location = useLocation();
  const navigate = useNavigate();

  const { user, logout } = useAuth();

  const effectiveRole = getEffectiveRole(user);
  const isStudent = effectiveRole === "student";
  const homeRoute = getHomeRouteForUser(user);

  const railLinks =
    effectiveRole === "admin"
      ? adminRailLinks
      : effectiveRole === "mentor"
        ? mentorRailLinks
        : effectiveRole === "director"
          ? directorRailLinks
          : studentRailLinks;

  const currentPage = resolvePageTitle(location.pathname);
  const userName = user?.name || "User";
  const userInitials = getInitials(userName);
  const formattedRole = getRoleDisplayLabel(user);
  const userRoll = user?.roll_no || user?.rollNumber;
  const userRoleLabel = `${user?.department ? `${user.department} · ${formattedRole}` : formattedRole
    }${userRoll ? ` · ${userRoll}` : ""}`;

  const fetchUnreadCount = async () => {
    try {
      const response = await api.get("/notifications");
      setUnreadCount(Number(response?.data?.unreadCount) || 0);
    } catch (err) {
      console.error("Unread notification count failed:", err?.message);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const todayStr = getTodayDateString();

  useEffect(() => {
    if (!showCreateModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showCreateModal]);

  useEffect(() => {
    if (!showCreateModal || !isStudent) return;
    let active = true;
    const loadMentors = async () => {
      setLoadingMentors(true);
      try {
        const res = await api.get("/users?role=mentor");
        if (!active) return;
        const list = res?.data?.users || res?.data?.data || [];
        setMentors(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error("Failed to load mentors:", err?.message);
      } finally {
        if (active) setLoadingMentors(false);
      }
    };
    loadMentors();
    return () => {
      active = false;
    };
  }, [showCreateModal, isStudent]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    const projectName = (newProjectForm.name || "").trim();
    if (!projectName) return;

    if (newProjectForm.deadline && newProjectForm.deadline < todayStr) {
      setCreateError(
        `Project deadline cannot be earlier than today (${todayStr}).`,
      );
      return;
    }

    setCreatingProject(true);
    setCreateError("");

    try {
      const payload = {
        name: projectName,
        title: projectName,
        description: newProjectForm.description.trim(),
        status: newProjectForm.status,
        priority: newProjectForm.priority,
        deadline: newProjectForm.deadline || null,
        ...(newProjectForm.mentorId
          ? { mentorId: Number(newProjectForm.mentorId) }
          : {}),
      };

      await api.post("/projects", payload);

      setShowCreateModal(false);
      setNewProjectForm({
        name: "",
        description: "",
        status: "Planning",
        priority: "Medium",
        deadline: "",
        mentorId: "",
      });

      window.dispatchEvent(new CustomEvent("collabx_projects_updated"));
      navigate("/projects");
    } catch (err) {
      setCreateError(
        err?.response?.data?.message ||
        err?.message ||
        "Failed to create project. Please try again.",
      );
    } finally {
      setCreatingProject(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();

    const handleNewNotification = (event) => {
      const notification = event?.detail?.notification;
      if (notification && !notification.isRead) {
        setUnreadCount((previous) => previous + 1);
      }
    };

    const handleCountUpdate = (event) => {
      if (typeof event?.detail?.count === "number") {
        setUnreadCount(event.detail.count);
      } else {
        fetchUnreadCount();
      }
    };

    window.addEventListener(
      "collabx_notification_received",
      handleNewNotification,
    );
    window.addEventListener("collabx_unread_count_updated", handleCountUpdate);
    window.addEventListener("collabx_notifications_updated", fetchUnreadCount);

    return () => {
      window.removeEventListener(
        "collabx_notification_received",
        handleNewNotification,
      );
      window.removeEventListener(
        "collabx_unread_count_updated",
        handleCountUpdate,
      );
      window.removeEventListener(
        "collabx_notifications_updated",
        fetchUnreadCount,
      );
    };
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen bg-[#EBF1EC] text-[#0F172A] transition-colors duration-200">
      {/* Sage-Lime Architectural Grid & Soft Ambient Glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(20, 26, 24, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(20, 26, 24, 0.04) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[340px]"
        style={{
          background:
            "linear-gradient(180deg, rgba(188, 231, 132, 0.28) 0%, rgba(93, 211, 158, 0.10) 55%, rgba(235, 241, 236, 0) 100%)",
        }}
      />

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#141A18]/45 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="flex h-full w-[264px] max-w-[85vw] flex-col justify-between rounded-r-[28px] border-r border-[#D4DFD7] bg-[#FFFFFF] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
              <div className="mb-5 flex items-center justify-between">
                <NavLink
                  to={homeRoute}
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex items-baseline text-lg font-extrabold tracking-tight text-[#141A18]"
                >
                  <span>CollabX</span>
                  <span className="text-[#1E6B4B]">.</span>
                </NavLink>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className="cursor-pointer rounded-full bg-[#EFF4F0] p-2 text-[#42504B] transition hover:bg-[#D4DFD7]"
                >
                  <X size={17} strokeWidth={1.85} />
                </button>
              </div>

              <nav className="space-y-1">
                {railLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={Boolean(item.end)}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-full px-4 py-2 text-xs font-bold transition ${isActive
                          ? "bg-[#1E2422] text-[#BEF264]"
                          : "text-[#42504B] hover:bg-[#EFF4F0]"
                        }`
                      }
                    >
                      <Icon size={16} strokeWidth={1.85} />
                      <span className="truncate">{item.name}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            <div className="mt-4 space-y-2 border-t border-[#E4ECE6] pt-3.5">
              {isStudent && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    setShowCreateModal(true);
                  }}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#141A17] py-2.5 text-xs font-extrabold text-[#BEF264] transition hover:bg-[#1E6B4B] hover:text-white"
                >
                  <Plus size={15} strokeWidth={2} />
                  <span>New Project</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-[#D4DFD7] bg-[#EFF4F0] py-2.5 text-xs font-bold text-[#141A18] transition hover:bg-red-50 hover:text-red-600"
              >
                <LogOut size={15} strokeWidth={1.85} />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 1. FIXED TOP HEADER BAR (No Theme Toggle) */}
      <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between gap-2 border-b border-[#D4DFD7]/80 bg-[#EBF1EC]/90 px-3 backdrop-blur-md transition-colors duration-200 sm:gap-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#D4DFD7] bg-[#FFFFFF] text-[#141A18] shadow-2xs transition hover:border-[#2E8B63]/40 sm:h-10 sm:w-10 lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={17} strokeWidth={1.85} />
          </button>

          <NavLink
            to={homeRoute}
            className="inline-flex shrink-0 items-baseline px-1 py-1 text-lg font-extrabold tracking-tight text-[#141A18] transition-opacity hover:opacity-85 sm:text-xl"
          >
            <span>CollabX</span>
            <span className="text-[#1E6B4B]">.</span>
          </NavLink>

          <div className="hidden h-5 w-px bg-[#C5D4CA] sm:block" />

          <h1 className="truncate text-sm font-extrabold tracking-tight text-[#0F172A] sm:text-xl lg:text-2xl">
            {currentPage}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-[#D4DFD7] bg-[#FFFFFF]/95 px-3.5 py-2 shadow-2xs md:inline-flex">
            <img
              src="/techno-logo.jpeg"
              alt="Techno NJR"
              className="h-4 w-4 rounded-full object-cover"
            />
            <span className="text-xs font-bold text-[#2C3A35]">
              Techno NJR
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate("/notifications")}
            aria-label="Notifications"
            className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#D4DFD7] bg-[#FFFFFF] text-[#141A18] shadow-2xs transition hover:border-[#2E8B63]/50 hover:bg-[#FAFBF9] sm:h-10 sm:w-10"
          >
            <Bell size={16} strokeWidth={1.85} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#22C55E] px-1 text-[9px] font-extrabold text-[#090D0B] ring-2 ring-[#EBF1EC]">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          <div
            onClick={() => navigate("/profile")}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-[#D4DFD7] bg-[#FFFFFF] py-1 pl-2.5 pr-1 shadow-2xs transition hover:border-[#2E8B63]/50 hover:bg-[#FAFBF9] sm:pl-3"
          >
            <div className="hidden text-right md:block">
              <p className="text-[11px] font-bold leading-tight text-[#0F172A]">
                {userName}
              </p>
              <p className="text-[10px] font-medium text-[#5C6B66]">
                {userRoleLabel}
              </p>
            </div>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1E2422] text-xs font-bold text-[#BEF264] sm:h-8 sm:w-8">
              {userInitials}
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out"
            className="hidden h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#D4DFD7] bg-[#FFFFFF] text-[#5C6B66] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 sm:flex"
          >
            <LogOut size={16} strokeWidth={1.85} />
          </button>
        </div>
      </header>

      {/* 2. CURVED LEFT DOCK (Icons Up Top, Actions Pinned Bottom, No Scrollbar) */}
      <aside className="fixed left-4 top-20 z-30 hidden shrink-0 flex-col items-center lg:flex">
        <div
          className={`flex h-[calc(100vh-6.25rem)] flex-col items-center justify-between overflow-visible rounded-[34px] border border-[#D4DFD7] bg-[#FFFFFF]/95 py-2.5 shadow-md shadow-[#141A18]/10 transition-all duration-200 ${dockExpanded ? "w-52 items-stretch px-2.5" : "w-12 px-1.5"
            }`}
        >
          {/* Top Group: Dock Toggle + Nav Links Placed Up High */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setDockExpanded((prev) => !prev)}
              aria-label={dockExpanded ? "Collapse dock" : "Expand dock"}
              title={dockExpanded ? "Collapse dock" : "Expand dock"}
              className={`flex h-9 cursor-pointer items-center justify-center rounded-full border border-[#D4DFD7] bg-[#EFF4F0] text-[#141A18] transition hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white ${dockExpanded ? "w-full justify-between px-3" : "w-9"
                }`}
            >
              <ChevronsLeftRight size={15} strokeWidth={1.85} />
              {dockExpanded && (
                <span className="text-[11px] font-extrabold tracking-wide">
                  Dock
                </span>
              )}
            </button>

            <nav className="mt-3 flex w-full flex-col items-center justify-start gap-1.5">
              {railLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.path}
                    className="group relative flex w-full justify-center"
                  >
                    <NavLink
                      to={item.path}
                      end={Boolean(item.end)}
                      className={({ isActive }) =>
                        `flex items-center rounded-full text-xs font-bold transition-all duration-150 ${dockExpanded
                          ? "w-full justify-start gap-3 px-3 py-2"
                          : "h-9 w-9 justify-center"
                        } ${isActive
                          ? "bg-[#141A17] text-[#BEF264] shadow-sm"
                          : "text-[#5C6B66] hover:bg-[#1E6B4B] hover:text-white"
                        }`
                      }
                    >
                      <Icon size={16} strokeWidth={1.85} className="shrink-0" />
                      {dockExpanded && (
                        <span className="truncate">{item.name}</span>
                      )}
                    </NavLink>

                    {!dockExpanded && (
                      <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#1E2422] px-3 py-1 text-[11px] font-bold text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                        {item.name}
                      </span>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Bottom Group: Optional New Project + Sign Out Stays At Bottom */}
          <div className="flex w-full shrink-0 flex-col items-center gap-1.5">
            {isStudent && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                aria-label="New Project"
                title="New Project"
                className={`flex cursor-pointer items-center rounded-full bg-[#141A17] text-xs font-extrabold text-[#BEF264] transition hover:bg-[#1E6B4B] hover:text-white ${dockExpanded
                    ? "w-full justify-center gap-2 px-3 py-2"
                    : "h-9 w-9 justify-center"
                  }`}
              >
                <Plus size={16} strokeWidth={2} />
                {dockExpanded && <span>New Project</span>}
              </button>
            )}

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign Out"
              title="Sign Out"
              className={`flex cursor-pointer items-center rounded-full border border-[#D4DFD7] bg-[#EFF4F0] text-xs font-bold text-[#5C6B66] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 ${dockExpanded
                  ? "w-full justify-center gap-2 px-3 py-2"
                  : "h-9 w-9 justify-center"
                }`}
            >
              <LogOut size={15} strokeWidth={1.85} />
              {dockExpanded && <span>Sign Out</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* 3. MAIN CONTENT AREA */}
      <div
        className={`relative min-h-screen w-full px-3 pb-8 pt-20 transition-all duration-200 sm:px-6 lg:pr-8 ${dockExpanded ? "lg:pl-60" : "lg:pl-24"
          }`}
      >
        <main className="min-w-0 w-full">
          <PortalErrorBoundary key={location.pathname}>
            <Outlet />
          </PortalErrorBoundary>
        </main>
      </div>

      {/* Global Direct Create Project Modal (Student workspace only) */}
      {showCreateModal &&
        isStudent &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={() => !creatingProject && setShowCreateModal(false)}
          >
            <div
              className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-[#D4DFD7] bg-[#FAFBF9] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[#E4ECE6] px-6 py-5">
                <div>
                  <h2 className="text-xl font-bold text-[#141A18]">
                    Create Project
                  </h2>
                  <p className="mt-1 text-sm text-[#5C6B66]">
                    Project details are saved directly to database.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={creatingProject}
                  onClick={() => setShowCreateModal(false)}
                  aria-label="Close modal"
                  className="cursor-pointer rounded-full bg-[#EFF4F0] p-2 text-[#42504B] transition hover:bg-[#D4DFD7]"
                >
                  <X size={18} strokeWidth={1.85} />
                </button>
              </div>

              <form
                onSubmit={handleCreateProject}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                  {createError && (
                    <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-600">
                      <AlertCircle
                        size={18}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0"
                      />
                      <span>{createError}</span>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B]">
                      Project Name *
                    </label>
                    <input
                      required
                      maxLength={100}
                      placeholder="e.g., Campus Autonomous Rover"
                      value={newProjectForm.name}
                      onChange={(e) =>
                        setNewProjectForm({
                          ...newProjectForm,
                          name: e.target.value,
                        })
                      }
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-white px-4 py-3 text-sm font-medium text-[#141A18] outline-none transition focus:border-[#2E8B63] focus:ring-2 focus:ring-[#22C55E]/25"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B]">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      maxLength={500}
                      placeholder="Describe your project goals, milestones, and tech stack..."
                      value={newProjectForm.description}
                      onChange={(e) =>
                        setNewProjectForm({
                          ...newProjectForm,
                          description: e.target.value,
                        })
                      }
                      className="w-full resize-y rounded-2xl border border-[#D5E0D8] bg-white px-4 py-3 text-sm font-medium text-[#141A18] outline-none transition focus:border-[#2E8B63] focus:ring-2 focus:ring-[#22C55E]/25"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B]">
                        Status
                      </label>
                      <div className="relative">
                        <select
                          value={newProjectForm.status}
                          onChange={(e) =>
                            setNewProjectForm({
                              ...newProjectForm,
                              status: e.target.value,
                            })
                          }
                          className="w-full cursor-pointer appearance-none rounded-2xl border border-[#D5E0D8] bg-white px-4 py-3 text-sm font-medium text-[#141A18] outline-none transition focus:border-[#2E8B63]"
                        >
                          <option value="Planning">Planning</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                          <option value="On Hold">On Hold</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66]" />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B]">
                        Priority
                      </label>
                      <div className="relative">
                        <select
                          value={newProjectForm.priority}
                          onChange={(e) =>
                            setNewProjectForm({
                              ...newProjectForm,
                              priority: e.target.value,
                            })
                          }
                          className="w-full cursor-pointer appearance-none rounded-2xl border border-[#D5E0D8] bg-white px-4 py-3 text-sm font-medium text-[#141A18] outline-none transition focus:border-[#2E8B63]"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66]" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B]">
                      Deadline (Optional)
                    </label>
                    <input
                      type="date"
                      min={todayStr}
                      value={newProjectForm.deadline}
                      onChange={(e) => {
                        setCreateError("");
                        setNewProjectForm({
                          ...newProjectForm,
                          deadline: e.target.value,
                        });
                      }}
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-white px-4 py-3 text-sm font-medium text-[#141A18] outline-none transition focus:border-[#2E8B63]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B]">
                      Invite Faculty Mentor (Optional)
                    </label>
                    <SearchableSelect
                      value={newProjectForm.mentorId}
                      onChange={(val) =>
                        setNewProjectForm({
                          ...newProjectForm,
                          mentorId: val,
                        })
                      }
                      disabled={loadingMentors}
                      allowEmpty
                      emptyOptionLabel="No mentor invited yet"
                      placeholder={
                        loadingMentors
                          ? "Loading faculty mentors..."
                          : "Search and select a faculty mentor..."
                      }
                      searchPlaceholder="Type mentor name or email..."
                      options={mentors.map((m) => ({
                        value: String(m.id || m._id),
                        label: m.name,
                        sublabel: m.email,
                      }))}
                    />
                    <p className="mt-1.5 text-[11px] font-medium text-[#5C6B66]">
                      The selected faculty mentor will receive an invitation and
                      must accept before being officially assigned.
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#E4ECE6] px-6 py-4 sm:flex-row sm:justify-end sm:gap-3">
                  <button
                    type="button"
                    disabled={creatingProject}
                    onClick={() => setShowCreateModal(false)}
                    className="w-full cursor-pointer rounded-full border border-[#1E2422]/25 bg-white px-5 py-2.5 text-sm font-bold text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white sm:w-auto"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={creatingProject || !newProjectForm.name.trim()}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#141A17] px-6 py-2.5 text-sm font-bold text-white shadow-xs transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white disabled:opacity-50 sm:w-auto"
                  >
                    {creatingProject && (
                      <LoaderCircle size={16} className="animate-spin" />
                    )}
                    <span>Create &amp; Launch Workspace</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}