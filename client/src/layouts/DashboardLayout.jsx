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
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import ThemeSwitcher from "../components/ThemeSwitcher";
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
  { name: "Announcements & Logs", path: "/admin/announcements", icon: Megaphone },
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
    "/director/reports": "INSTITUTE REPORTS",
  };
  if (exactTitles[pathname]) return exactTitles[pathname];
  if (pathname.startsWith("/admin/students/")) return "STUDENT PROFILE";
  if (pathname.startsWith("/admin/mentors/")) return "MENTOR DETAILS";
  if (pathname.startsWith("/admin/teams/")) return "TEAM DETAILS";
  if (pathname.startsWith("/mentor/students/")) return "STUDENT PROFILE";
  if (pathname.startsWith("/mentor/teams/")) return "TEAM DETAILS";
  return "WORKSPACE";
}

function getInitials(name = "User") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function getTodayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Global Create Project Modal State
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
  const { isDark } = useTheme();

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
  const userRoleLabel = `${
    user?.department ? `${user.department} · ${formattedRole}` : formattedRole
  }${userRoll ? ` · ${userRoll}` : ""}`;

  const fetchUnreadCount = async () => {
    try {
      const response = await api.get("/notifications");
      setUnreadCount(response.data.unreadCount || 0);
    } catch (error) {
      console.error("Unread notification count failed:", error.message);
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
        const list = res.data?.users || res.data?.data || [];
        setMentors(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error("Failed to load mentors:", err.message);
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
        err.response?.data?.message ||
          err.message ||
          "Failed to create project. Please try again.",
      );
    } finally {
      setCreatingProject(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();

    const handleNewNotification = (event) => {
      const notification = event.detail?.notification;
      if (notification && !notification.isRead) {
        setUnreadCount((previous) => previous + 1);
      }
    };

    const handleCountUpdate = (event) => {
      if (typeof event.detail?.count === "number") {
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
    <div
      className={`relative min-h-screen overflow-x-hidden transition-colors duration-200 ${
        isDark
          ? "bg-[#080C0A] text-slate-100"
          : "bg-[#EBF1EC] text-[#0F172A]"
      }`}
    >
      {/* Sage-Lime Architectural Grid & Soft Ambient Glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: isDark
            ? "linear-gradient(to right, rgba(163, 230, 53, 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(163, 230, 53, 0.045) 1px, transparent 1px)"
            : "linear-gradient(to right, rgba(20, 26, 24, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(20, 26, 24, 0.04) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[340px]"
        style={{
          background: isDark
            ? "linear-gradient(180deg, rgba(34, 197, 94, 0.14) 0%, rgba(163, 230, 53, 0.05) 55%, rgba(8, 12, 10, 0) 100%)"
            : "linear-gradient(180deg, rgba(188, 231, 132, 0.28) 0%, rgba(93, 211, 158, 0.10) 55%, rgba(235, 241, 236, 0) 100%)",
        }}
      />

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#141A18]/40 backdrop-blur-xs dark:bg-black/65 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className={`flex h-full w-[260px] flex-col justify-between border-r p-5 shadow-2xl ${
              isDark
                ? "border-[#1F2C26] bg-[#111815]"
                : "border-[#D4DFD7] bg-[#FFFFFF]"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <div className="mb-6 flex items-center justify-between">
                <div className="inline-flex items-center gap-2 rounded-full bg-[#BEF264] px-3.5 py-1.5 text-sm font-bold text-[#141A18] dark:bg-[#A3E635]">
                  <img
                    src="/collabx-logo.jpeg"
                    alt="CollabX"
                    className="h-5 w-5 rounded-full object-cover"
                  />
                  <span>CollabX</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-full bg-[#EFF4F0] p-2 text-[#42504B] dark:bg-[#1A2520] dark:text-slate-300"
                >
                  <X size={17} />
                </button>
              </div>

              <nav className="space-y-1.5">
                {railLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={Boolean(item.end)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-full px-4 py-2.5 text-xs font-bold transition ${
                          isActive
                            ? "bg-[#1E2422] text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]"
                            : "text-[#42504B] hover:bg-[#EFF4F0] dark:text-[#94A89D] dark:hover:bg-[#1A2520] dark:hover:text-slate-100"
                        }`
                      }
                    >
                      <Icon size={16} />
                      <span>{item.name}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-[#D4DFD7] bg-[#EFF4F0] px-3 py-2 dark:border-[#24322B] dark:bg-[#0C120F]">
                <span className="text-xs font-bold text-[#42504B] dark:text-slate-300">
                  Theme
                </span>
                <ThemeSwitcher />
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-[#D4DFD7] bg-[#EFF4F0] py-2.5 text-xs font-bold text-[#141A18] hover:bg-red-50 hover:text-red-600 dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-200 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 1. FIXED TOP HEADER BAR (64px / h-16, permanently pinned) */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 h-16 flex items-center justify-between gap-3 px-4 backdrop-blur-md border-b transition-colors duration-200 sm:px-6 lg:px-8 ${
          isDark
            ? "bg-[#080C0A]/92 border-[#1F2C26]"
            : "bg-[#EBF1EC]/90 border-[#D4DFD7]/80"
        }`}
      >
        {/* Left: Mobile Menu + CollabX Brand Pill + Current Page Title */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-2xs lg:hidden ${
              isDark
                ? "border-[#1F2C26] bg-[#111815] text-slate-100"
                : "border-[#D4DFD7] bg-[#FFFFFF] text-[#141A18]"
            }`}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <NavLink
            to={homeRoute}
            className="inline-flex shrink-0 items-center gap-2.5 rounded-full border border-[#141A18]/10 bg-[#BEF264] py-1.5 pl-2 pr-4 shadow-2xs transition hover:brightness-95 dark:border-[#A3E635]/30 dark:bg-[#A3E635]"
          >
            <img
              src="/collabx-logo.jpeg"
              alt="CollabX"
              className="h-7 w-7 rounded-full object-cover"
            />
            <span className="text-sm font-extrabold tracking-tight text-[#141A18]">
              CollabX
            </span>
          </NavLink>

          <div
            className={`hidden h-5 w-px sm:block ${
              isDark ? "bg-[#1F2A24]" : "bg-[#C5D4CA]"
            }`}
          />

          <h1
            className={`truncate text-lg font-extrabold tracking-tight sm:text-2xl ${
              isDark ? "text-slate-100" : "text-[#0F172A]"
            }`}
          >
            {currentPage}
          </h1>
        </div>

        {/* Right: Techno NJR Badge + Theme Switcher + Notifications + User Profile + Logout */}
        <div className="flex shrink-0 items-center gap-2">
          <div
            className={`hidden items-center gap-2 rounded-full border px-3.5 py-2 shadow-2xs sm:inline-flex ${
              isDark
                ? "border-[#1F2C26] bg-[#111815]"
                : "border-[#D4DFD7] bg-[#FFFFFF]/95"
            }`}
          >
            <img
              src="/techno-logo.jpeg"
              alt="Techno NJR"
              className="h-4 w-4 rounded-full object-cover"
            />
            <span
              className={`text-xs font-bold ${
                isDark ? "text-slate-200" : "text-[#2C3A35]"
              }`}
            >
              Techno NJR
            </span>
          </div>

          <ThemeSwitcher />

          <button
            type="button"
            onClick={() => navigate("/notifications")}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-2xs transition ${
              isDark
                ? "border-[#1F2C26] bg-[#111815] text-slate-100 hover:border-[#22C55E]/50 hover:bg-[#161F1B]"
                : "border-[#D4DFD7] bg-[#FFFFFF] text-[#141A18] hover:border-[#2E8B63]/50 hover:bg-[#FAFBF9]"
            }`}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span
                className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#22C55E] px-1 text-[9px] font-extrabold text-[#090D0B] ring-2 ${
                  isDark ? "ring-[#080C0A]" : "ring-[#EBF1EC]"
                }`}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          <div
            onClick={() => navigate("/profile")}
            className={`flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-3 pr-1 shadow-2xs transition ${
              isDark
                ? "border-[#1F2C26] bg-[#111815] hover:border-[#22C55E]/50 hover:bg-[#161F1B]"
                : "border-[#D4DFD7] bg-[#FFFFFF] hover:border-[#2E8B63]/50 hover:bg-[#FAFBF9]"
            }`}
          >
            <div className="hidden text-right md:block">
              <p
                className={`text-[11px] font-bold leading-tight ${
                  isDark ? "text-slate-100" : "text-[#0F172A]"
                }`}
              >
                {userName}
              </p>
              <p
                className={`text-[10px] font-medium ${
                  isDark ? "text-[#94A89D]" : "text-[#5C6B66]"
                }`}
              >
                {userRoleLabel}
              </p>
            </div>
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                isDark
                  ? "bg-[#A3E635] text-[#090D0B]"
                  : "bg-[#1E2422] text-[#BEF264]"
              }`}
            >
              {userInitials}
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border transition sm:flex ${
              isDark
                ? "border-[#1F2C26] bg-[#111815] text-[#94A89D] hover:border-red-900/60 hover:bg-red-950/40 hover:text-red-400"
                : "border-[#D4DFD7] bg-[#FFFFFF] text-[#5C6B66] hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            }`}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* 2. FIXED LEFT ICON SIDEBAR RAIL (permanently pinned at top-20 left-4) */}
      <aside className="fixed top-20 left-4 z-30 hidden w-12 shrink-0 flex-col items-center gap-4 lg:flex">
        <div
          className={`flex flex-col items-center gap-2 rounded-full border p-1.5 shadow-xs transition-colors duration-200 ${
            isDark
              ? "border-[#1F2C26] bg-[#111815]/95"
              : "border-[#D4DFD7] bg-[#FFFFFF]/95"
          }`}
        >
          {railLinks.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.path} className="relative group">
                <NavLink
                  to={item.path}
                  end={Boolean(item.end)}
                  className={({ isActive }) =>
                    `flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
                      isActive
                        ? isDark
                          ? "bg-[#A3E635] text-[#090D0B] shadow-2xs"
                          : "bg-[#141A17] text-[#BEF264] shadow-2xs"
                        : isDark
                          ? "text-[#94A89D] hover:bg-[#1E2B24] hover:text-[#A3E635]"
                          : "text-[#5C6B66] hover:bg-[#1E6B4B] hover:text-white"
                    }`
                  }
                >
                  <Icon size={16} />
                </NavLink>
                {/* Single crisp tooltip positioned cleanly to the right */}
                <span
                  className={`pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold opacity-0 shadow-md transition-opacity group-hover:opacity-100 ${
                    isDark
                      ? "border border-[#26352D] bg-[#161F1B] text-slate-100"
                      : "bg-[#1E2422] text-white"
                  }`}
                >
                  {item.name}
                </span>
              </div>
            );
          })}
        </div>

        {isStudent && (
          <div className="relative group">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className={`flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-all duration-200 hover:scale-105 ${
                isDark
                  ? "border border-[#2E4237] bg-[#1B2822] text-[#A3E635] hover:border-[#A3E635] hover:bg-[#A3E635] hover:text-[#090D0B]"
                  : "bg-[#141A17] text-[#BEF264] hover:bg-[#1E6B4B] hover:text-white"
              }`}
            >
              <Plus size={18} />
            </button>
            <span
              className={`pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold opacity-0 shadow-md transition-opacity group-hover:opacity-100 ${
                isDark
                  ? "border border-[#26352D] bg-[#161F1B] text-slate-100"
                  : "bg-[#1E2422] text-white"
              }`}
            >
              New Project
            </span>
          </div>
        )}
      </aside>

      {/* 3. PROPER MAIN CONTENT OFFSETS (Zero Overlap, pt-20 + lg:pl-24) */}
      <div className="relative w-full min-h-screen pt-20 pb-8 px-4 sm:px-6 lg:pl-24 lg:pr-8">
        <main className="min-w-0 w-full">
          <PortalErrorBoundary key={location.pathname}>
            <Outlet />
          </PortalErrorBoundary>
        </main>
      </div>

      {/* Global Direct Create Project Modal (Student workspace only — Rendered via Portal above z-40 Header) */}
      {showCreateModal &&
        isStudent &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={() => !creatingProject && setShowCreateModal(false)}
          >
            <div
              className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-[#D4DFD7] bg-[#FAFBF9] shadow-2xl dark:border-[#1F2C26] dark:bg-[#111815]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Pinned Non-Scrolling Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-[#E4ECE6] px-6 py-5 dark:border-[#1F2C26]">
                <div>
                  <h2 className="text-xl font-bold text-[#141A18] dark:text-slate-100">
                    Create Project
                  </h2>
                  <p className="mt-1 text-sm text-[#5C6B66] dark:text-[#94A89D]">
                    Project details are saved directly to database.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={creatingProject}
                  onClick={() => setShowCreateModal(false)}
                  aria-label="Close modal"
                  className="rounded-full bg-[#EFF4F0] p-2 text-[#42504B] transition hover:bg-[#D4DFD7] dark:bg-[#1A2520] dark:text-slate-300 dark:hover:bg-[#26352D]"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={handleCreateProject}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                {/* Scrollable Form Body */}
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 scrollbar-thin">
                  {createError && (
                    <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                      <AlertCircle size={18} className="mt-0.5 shrink-0" />
                      <span>{createError}</span>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
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
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-white px-4 py-3 text-sm font-medium text-[#141A18] outline-none transition focus:border-[#2E8B63] focus:ring-2 focus:ring-[#22C55E]/25 dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100 dark:placeholder:text-[#687E73] dark:focus:border-[#22C55E]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
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
                      className="w-full resize-y rounded-2xl border border-[#D5E0D8] bg-white px-4 py-3 text-sm font-medium text-[#141A18] outline-none transition focus:border-[#2E8B63] focus:ring-2 focus:ring-[#22C55E]/25 dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100 dark:placeholder:text-[#687E73] dark:focus:border-[#22C55E]"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
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
                          className="w-full appearance-none rounded-2xl border border-[#D5E0D8] bg-white px-4 py-3 text-sm font-medium text-[#141A18] outline-none transition focus:border-[#2E8B63] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100 dark:focus:border-[#22C55E] cursor-pointer"
                        >
                          <option value="Planning">Planning</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                          <option value="On Hold">On Hold</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
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
                          className="w-full appearance-none rounded-2xl border border-[#D5E0D8] bg-white px-4 py-3 text-sm font-medium text-[#141A18] outline-none transition focus:border-[#2E8B63] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100 dark:focus:border-[#22C55E] cursor-pointer"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
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
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-white px-4 py-3 text-sm font-medium text-[#141A18] outline-none transition focus:border-[#2E8B63] dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100 dark:focus:border-[#22C55E]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
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
                    <p className="mt-1.5 text-[11px] font-medium text-[#5C6B66] dark:text-[#94A89D]">
                      The selected faculty mentor will receive an invitation and must accept before being officially assigned.
                    </p>
                  </div>
                </div>

                {/* Pinned Footer */}
                <div className="flex shrink-0 justify-end gap-3 border-t border-[#E4ECE6] px-6 py-4 dark:border-[#1F2C26]">
                  <button
                    type="button"
                    disabled={creatingProject}
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-full border border-[#1E2422]/25 bg-white px-5 py-2.5 text-sm font-bold text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B]"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={creatingProject || !newProjectForm.name.trim()}
                    className="inline-flex items-center gap-2 rounded-full bg-[#141A17] px-6 py-2.5 text-sm font-bold text-white shadow-xs transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] disabled:opacity-50"
                  >
                    {creatingProject && (
                      <LoaderCircle size={16} className="animate-spin" />
                    )}
                    Create & Launch Workspace
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
