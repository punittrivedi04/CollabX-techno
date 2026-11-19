import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import {
  Plus,
  Search,
  CalendarDays,
  Users,
  FolderKanban,
  X,
  Trash2,
  Pencil,
  LoaderCircle,
  AlertCircle,
  CheckCircle2,
  Clock3,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Presentation,
  Upload,
  ArrowUpRight,
  Shield,
  Trophy,
  Lock,
  Award,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import ErrorBoundary from "../components/ErrorBoundary";
import SearchableSelect from "../components/portal/SearchableSelect";

const hasProjectDeliverables = (project) => {
  if (!project) return false;
  if (Array.isArray(project.deliverables) && project.deliverables.length > 0) {
    return true;
  }
  const hasString = (val) => typeof val === "string" && val.trim().length > 0;
  return Boolean(
    hasString(project.githubUrl) ||
      hasString(project.demoUrl) ||
      hasString(project.pptUrl),
  );
};

function GithubIcon({ size = 15, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

const emptyForm = {
  name: "",
  description: "",
  status: "Planning",
  priority: "Medium",
  deadline: "",
  mentorId: "",
};

const statusStyles = {
  "In Progress": "bg-[#EEF6E6] dark:bg-[#1B2A16] text-[#2C3A35] dark:text-slate-200 border-[#C5D8B6] dark:border-[#2B3F22]",
  Planning: "bg-[#EFF4F0] dark:bg-[#0C120F] text-[#42504B] dark:text-slate-300 border-[#D4DFD7] dark:border-[#24322B]",
  Completed: "bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7] border-[#2E8B63]/30 dark:border-[#22C55E]/40",
  "On Hold": "bg-[#F2F0E9] dark:bg-[#1B201A] text-[#5C6662] dark:text-[#94A89D] border-[#DDDAD0] dark:border-[#2D362B]",
};

const PAGE_SIZE = 10;

const getError = (error) =>
  error.response?.data?.message || error.message || "Something went wrong.";

const isCompleted = (status) =>
  ["completed", "done"].includes(String(status || "").toLowerCase());

// Dual Condition Gatekeeper: 100% tasks completed (at least 1 task) AND project status saved as Completed
const isProjectUploadUnlocked = (project, stats) => {
  const hasTasks = Boolean(stats && stats.total > 0);
  const allTasksCompleted = Boolean(hasTasks && stats.completed === stats.total);
  const isStatusCompleted = isCompleted(project?.status);
  return allTasksCompleted && isStatusCompleted;
};

const getProgressColor = (progress) => {
  if (progress === 100) {
    return {
      bar: "bg-[#2E8B63]",
      text: "text-[#1E6B4B] dark:text-[#6EE7B7]",
    };
  }
  if (progress >= 40) {
    return {
      bar: "bg-[#1E2422] dark:bg-[#1D2D24] dark:ring-1 dark:ring-[#A3E635]/35",
      text: "text-[#141A18] dark:text-slate-100",
    };
  }
  return {
    bar: "bg-[#5C6B66]",
    text: "text-[#42504B] dark:text-slate-300",
  };
};

const dateForInput = (date) => {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const getTodayDateString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function Projects() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isDirector =
    String(user?.role || "").toLowerCase().trim() === "director";

  const [allProjects, setAllProjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");

  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [modalError, setModalError] = useState("");
  const [mentors, setMentors] = useState([]);

  const [showLinksModal, setShowLinksModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [allProjectsList, setAllProjectsList] = useState([]);
  const [linksForm, setLinksForm] = useState({
    description: "",
    githubUrl: "",
    demoUrl: "",
    pptUrl: "",
  });
  const [savingLinks, setSavingLinks] = useState(false);

  const todayStr = getTodayDateString();

  useEffect(() => {
    if (!showModal && !showLinksModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showModal, showLinksModal]);

  const openProjectChat = (projectId) => {
    if (isDirector) return;
    navigate(`/chat?projectId=${projectId}`);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Load Projects from Database
  useEffect(() => {
    let cancelled = false;

    const loadProjects = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await api.get("/projects", {
          params: { limit: 100 },
        });

        if (cancelled) return;

        const data = response.data;
        const projectList = data.projects || data.data || [];
        setAllProjects(projectList);
      } catch (err) {
        if (!cancelled) {
          setError(getError(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Listen to Global Project Updates (e.g. from Sidebar + Modal)
  useEffect(() => {
    const handleUpdate = () => {
      setRefreshKey((k) => k + 1);
    };

    window.addEventListener("collabx_projects_updated", handleUpdate);
    return () => {
      window.removeEventListener("collabx_projects_updated", handleUpdate);
    };
  }, []);

  // Load Tasks
  useEffect(() => {
    let cancelled = false;

    const loadTasks = async () => {
      if (isDirector) return;
      try {
        const response = await api.get("/tasks");

        if (!cancelled) {
          setTasks(response.data.tasks || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getError(err));
        }
      }
    };

    loadTasks();

    return () => {
      cancelled = true;
    };
  }, [isDirector]);

  // Calculate project task progress
  const projectStats = useMemo(() => {
    const result = {};

    for (const project of allProjects) {
      const pId = String(project._id || project.id);
      result[pId] = {
        total: 0,
        completed: 0,
        progress: typeof project.progress === "number" ? project.progress : 0,
        isTasksCompleted: false,
        isExplicitlyCompleted: isCompleted(project.status),
        isCompleted: false,
        status: project.status || "Planning",
      };
    }

    for (const task of tasks) {
      const projectId = String(task.project?._id || task.project?.id || task.project || "");
      if (!projectId || !result[projectId]) continue;

      result[projectId].total += 1;
      if (isCompleted(task.status)) {
        result[projectId].completed += 1;
      }
    }

    for (const [projectId, stats] of Object.entries(result)) {
      const project = allProjects.find(
        (p) => String(p._id || p.id) === projectId,
      );

      const isExplicitlyCompleted = isCompleted(project?.status);

      if (stats.total > 0) {
        stats.progress = Math.round((stats.completed / stats.total) * 100);
        stats.isTasksCompleted = stats.total > 0 && stats.completed === stats.total;
        stats.isExplicitlyCompleted = isExplicitlyCompleted;
        // Strict Gatekeeper: Having 100% task completion alone must NOT automatically mark status as Completed
        stats.isCompleted = stats.isTasksCompleted && isExplicitlyCompleted;
        stats.status = project?.status || "Planning";
      } else {
        stats.progress = 0;
        stats.isTasksCompleted = false; // at least 1 task must exist
        stats.isExplicitlyCompleted = isExplicitlyCompleted;
        stats.isCompleted = false;
        stats.status = project?.status || "Planning";
      }
    }

    return result;
  }, [allProjects, tasks]);

  // Accurate KPI Calculations across entire project library
  const totalProjectsCount = allProjects.length;

  const activeProjectsCount = useMemo(() => {
    return allProjects.filter((project) => {
      const st = String(project.status || "").trim().toLowerCase();
      return st === "in progress";
    }).length;
  }, [allProjects]);

  const completedProjectsCount = useMemo(() => {
    return allProjects.filter((project) => {
      const pId = String(project._id || project.id);
      return projectStats[pId]?.isCompleted;
    }).length;
  }, [allProjects, projectStats]);

  // Strict Filter Predicate: Name/Keyword + Status + Priority
  const filteredProjects = useMemo(() => {
    return allProjects.filter((project) => {
      const term = debouncedSearch.toLowerCase().trim();
      const projectName = (project.name || project.title || "").toLowerCase();
      const projectDesc = (project.description || "").toLowerCase();
      const matchesSearch =
        !term || projectName.includes(term) || projectDesc.includes(term);

      const normStatus = String(project.status || "Planning").trim().toLowerCase();
      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Completed"
          ? normStatus === "completed" || normStatus === "done"
          : normStatus === statusFilter.trim().toLowerCase());

      const normPriority = String(project.priority || "Medium").trim().toLowerCase();
      const matchesPriority =
        priorityFilter === "All" ||
        normPriority === priorityFilter.trim().toLowerCase();

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [allProjects, debouncedSearch, statusFilter, priorityFilter]);

  // Pagination for Filtered Results
  const totalFiltered = filteredProjects.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const pageNumbers = useMemo(() => {
    if (!totalPages || totalPages <= 1) return [];

    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  const openCreateModal = () => {
    if (isDirector) return;
    setEditingId(null);
    setModalError("");
    setForm(emptyForm);
    setShowModal(true);
    if (mentors.length === 0) {
      api
        .get("/users", { params: { role: "mentor" } })
        .then((res) => setMentors(res.data?.users || []))
        .catch(() => {});
    }
  };

  const openEditModal = (project) => {
    if (isDirector) return;
    const pId = String(project._id || project.id);
    setEditingId(pId);
    setModalError("");

    const stats = projectStats[pId];
    const canComplete = Boolean(stats && stats.total >= 1 && stats.completed === stats.total);

    let initialStatus = project.status || "Planning";
    if (String(initialStatus).toLowerCase() === "completed" && !canComplete) {
      initialStatus = stats && stats.completed > 0 ? "In Progress" : "Planning";
    }

    setForm({
      name: project.name || project.title || "",
      description: project.description || "",
      status: initialStatus,
      priority: project.priority || "Medium",
      deadline: dateForInput(project.deadline),
    });

    setShowModal(true);
  };

  const editingStats = editingId ? projectStats[String(editingId)] : null;
  const canMarkEditingProjectCompleted = Boolean(
    editingStats && editingStats.total >= 1 && editingStats.completed === editingStats.total
  );

  const handleSubmit = async (event) => {
    event.preventDefault();

    const projectName = (form.name || "").trim();
    if (!projectName) return;

    if (form.deadline && form.deadline < todayStr) {
      setModalError(
        `Project deadline cannot be earlier than today (${todayStr}).`,
      );
      return;
    }

    if (form.status === "Completed" && !canMarkEditingProjectCompleted) {
      setModalError(
        "Complete all project tasks first to mark project as Completed",
      );
      return;
    }

    setSaving(true);
    setError("");
    setModalError("");

    const payload = {
      name: projectName,
      title: projectName,
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      deadline: form.deadline || null,
      ...(!editingId && form.mentorId ? { mentorId: Number(form.mentorId) } : {}),
    };

    try {
      if (editingId) {
        await api.put(`/projects/${editingId}`, payload);
      } else {
        await api.post("/projects", payload);
      }

      setShowModal(false);
      setEditingId(null);
      setForm(emptyForm);

      setRefreshKey((current) => current + 1);
      window.dispatchEvent(new CustomEvent("collabx_projects_updated"));
    } catch (err) {
      const errMsg = getError(err);
      setError(errMsg);
      setModalError(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const currentUserId = String(user?._id || user?.id || "");

  const isUserProject = (p) => {
    if (!p) return false;
    if (isDirector) return true;
    if (!currentUserId) return true;
    const ownerId = String(p.owner?._id || p.owner?.id || p.owner || "");
    if (ownerId && ownerId === currentUserId) return true;
    if (Array.isArray(p.members)) {
      if (p.members.some((m) => String(m?._id || m?.id || m) === currentUserId))
        return true;
    }
    if (Array.isArray(p.teamMembers)) {
      if (
        p.teamMembers.some(
          (m) =>
            String(m?._id || m?.id || m?.user?._id || m?.user || m) ===
            currentUserId,
        )
      )
        return true;
    }
    return false;
  };

  const dropdownProjects = useMemo(() => {
    const map = new Map();
    (allProjectsList || []).forEach((p) => {
      const id = p?._id || p?.id;
      if (id && isUserProject(p)) map.set(String(id), p);
    });
    (allProjects || []).forEach((p) => {
      const id = p?._id || p?.id;
      if (id && !map.has(String(id)) && isUserProject(p))
        map.set(String(id), p);
    });
    return Array.from(map.values());
  }, [allProjectsList, allProjects, currentUserId]);

  const fetchAllProjectsForDropdown = async () => {
    try {
      const res = await api.get("/projects", { params: { limit: 50 } });
      if (res.data?.projects) {
        const userProjects = res.data.projects.filter(isUserProject);
        setAllProjectsList(userProjects);
        return userProjects;
      }
    } catch {
      // fallback
    }
    return allProjects.filter(isUserProject);
  };

  const openLinksModal = async (targetProject = null) => {
    if (isDirector) return;
    let list = dropdownProjects;
    if (list.length === 0) {
      list = await fetchAllProjectsForDropdown();
    }

    const proj =
      targetProject ||
      (selectedProjectId
        ? list.find((p) => String(p._id || p.id) === String(selectedProjectId))
        : null) ||
      list[0] ||
      null;

    if (proj) {
      setSelectedProjectId(proj._id || proj.id);
      setLinksForm({
        description: proj.description || "",
        githubUrl: proj.githubUrl || "",
        demoUrl: proj.demoUrl || "",
        pptUrl: proj.pptUrl || "",
      });
    } else {
      setSelectedProjectId("");
      setLinksForm({
        description: "",
        githubUrl: "",
        demoUrl: "",
        pptUrl: "",
      });
    }

    setShowLinksModal(true);
    fetchAllProjectsForDropdown();
  };

  const handleSaveLinks = async (event) => {
    event.preventDefault();
    if (!selectedProjectId) {
      setError("Please select a project to upload.");
      return;
    }

    setSavingLinks(true);
    setError("");

    try {
      const payload = {
        description: linksForm.description.trim(),
        githubUrl: linksForm.githubUrl.trim(),
        demoUrl: linksForm.demoUrl.trim(),
        pptUrl: linksForm.pptUrl.trim(),
      };

      const response = await api.put(
        `/projects/${selectedProjectId}`,
        payload,
      );
      const updatedProject = response.data?.project || payload;

      setAllProjects((current) =>
        current.map((p) =>
          String(p._id || p.id) === String(selectedProjectId)
            ? { ...p, ...payload, ...updatedProject }
            : p,
        ),
      );

      setShowLinksModal(false);
      setRefreshKey((k) => k + 1);
      window.dispatchEvent(new CustomEvent("collabx_projects_updated"));
    } catch (err) {
      setError(getError(err));
    } finally {
      setSavingLinks(false);
    }
  };

  const deleteProject = async (id) => {
    if (isDirector) return;
    if (!window.confirm("Delete this project? This action cannot be undone.")) {
      return;
    }

    setError("");

    try {
      await api.delete(`/projects/${id}`);

      setAllProjects((current) =>
        current.filter((p) => String(p._id || p.id) !== String(id)),
      );

      setTasks((current) =>
        current.filter((task) => (task.project?._id || task.project) !== id),
      );
      window.dispatchEvent(new CustomEvent("collabx_projects_updated"));
    } catch (err) {
      setError(getError(err));
    }
  };

  return (
    <ErrorBoundary>
      <div className="space-y-6 text-[#141A18] dark:text-slate-100">
        {/* Top Action Bar */}
        <div className="flex flex-col justify-between gap-4 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-5 shadow-2xs sm:flex-row sm:items-center sm:p-6">
          <div>
            <span className="inline-block rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
              Squad Deliverables
            </span>
            <p className="mt-1.5 text-sm font-medium text-[#5C6B66] dark:text-[#94A89D]">
              Manage active builds, track sprint progress, and upload demo links.
            </p>
          </div>

          {!isDirector ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => openLinksModal()}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-sm font-bold shadow-2xs"
              >
                <Upload size={16} />
                Upload Project
              </button>

              <button
                onClick={openCreateModal}
                className="inline-flex items-center justify-center gap-2 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-sm font-bold shadow-xs"
              >
                <Plus size={17} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
                Create Project
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-[#2E8B63]/30 dark:border-[#22C55E]/40 bg-[#E3F3EB] dark:bg-[#13291E] px-4 py-2 text-xs font-bold text-[#1E6B4B] dark:text-[#6EE7B7]">
              <Shield size={14} />
              <span>Director Executive View Only (47 Projects)</span>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-sm font-medium text-red-600 dark:text-red-400">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={17} />
            </button>
          </div>
        )}

        {/* Calm Bento Stat Cards (Accurate Counts) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              label: "Total Projects",
              value: totalProjectsCount,
              Icon: FolderKanban,
              badgeBg: "border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100",
              cardBg: "border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815]",
            },
            {
              label: "In Progress",
              value: activeProjectsCount,
              Icon: Clock3,
              badgeBg: "border border-[#E2DFD5] dark:border-[#2D362B] bg-white dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100",
              cardBg: "border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A]",
            },
            {
              label: "Completed",
              value: completedProjectsCount,
              Icon: CheckCircle2,
              badgeBg: "border border-[#2E8B63]/25 bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7]",
              cardBg: "border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815]",
            },
          ].map(({ label, value, Icon, badgeBg, cardBg }) => (
            <div
              key={label}
              className={`rounded-[28px] border ${cardBg} p-6 shadow-2xs`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
                  {label}
                </p>
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${badgeBg}`}
                >
                  <Icon size={18} />
                </div>
              </div>

              <p className="mt-4 text-4xl font-extrabold tracking-tight text-[#141A18] dark:text-slate-100">
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Search, Status, and Priority Filter Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75] dark:text-[#869B90]"
            />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects by name or keyword..."
              className="w-full rounded-full border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] py-3 pl-11 pr-5 text-sm font-medium text-[#141A18] dark:text-slate-100 shadow-2xs outline-none transition placeholder:text-[#8E9E97] dark:placeholder:text-[#687E73] focus:border-[#2E8B63] dark:focus:border-[#22C55E] focus:bg-white dark:focus:bg-[#0C120F] focus:ring-2 focus:ring-[#5dd39e]/25"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full appearance-none rounded-full border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] py-3 pl-5 pr-11 text-sm font-semibold text-[#141A18] dark:text-slate-100 shadow-2xs outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E] focus:bg-white dark:focus:bg-[#0C120F] cursor-pointer sm:w-auto"
            >
              <option value="All">All Status</option>
              <option value="Planning">Planning</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
          </div>

          {/* Priority Filter */}
          <div className="relative">
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="w-full appearance-none rounded-full border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] py-3 pl-5 pr-11 text-sm font-semibold text-[#141A18] dark:text-slate-100 shadow-2xs outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E] focus:bg-white dark:focus:bg-[#0C120F] cursor-pointer sm:w-auto"
            >
              <option value="All">All Priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="flex items-center justify-center gap-3 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] py-20 text-sm font-semibold text-[#5C6B66] dark:text-[#94A89D]">
            <LoaderCircle className="animate-spin text-[#2E8B63] dark:text-[#4ADE80]" size={22} />
            Loading projects from database...
          </div>
        ) : paginatedProjects.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-[#C5D4CA] dark:border-[#2A3B32] bg-[#FAFBF9] dark:bg-[#111815] py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EFF4F0] dark:bg-[#1A2520] text-[#5C6B66] dark:text-[#94A89D]">
              <FolderKanban size={28} />
            </div>

            <h3 className="mt-4 text-lg font-bold text-[#141A18] dark:text-slate-100">
              No projects found
            </h3>

            <p className="mt-1 text-sm text-[#5C6B66] dark:text-[#94A89D]">
              {search || statusFilter !== "All" || priorityFilter !== "All"
                ? "No projects match your current filters. Try changing your search or filters."
                : "Create a project to start organizing your work."}
            </p>

            {search || statusFilter !== "All" || priorityFilter !== "All" ? (
              <button
                onClick={() => {
                  setSearch("");
                  setStatusFilter("All");
                  setPriorityFilter("All");
                  setPage(1);
                }}
                className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-xs font-bold"
              >
                Reset Filters
              </button>
            ) : !isDirector && (
              <button
                onClick={openCreateModal}
                className="mt-5 inline-flex items-center gap-1.5 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-xs font-bold"
              >
                <Plus size={15} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
                Create your first project
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {paginatedProjects.map((project) => {
                const pId = project._id || project.id;
                const stats = projectStats[pId] || {
                  total: 0,
                  completed: 0,
                  progress: 0,
                  status: project.status || "Planning",
                };

                const progressColor = getProgressColor(stats.progress);

                const memberCount =
                  project.memberCount ??
                  ((project.members?.length || 0) + (project.owner ? 1 : 0));

                const isUnlocked = isProjectUploadUnlocked(project, stats);
                const rawStatus = project.status || "Planning";
                const displayStatus = String(rawStatus).toLowerCase() === "completed" && !stats.isTasksCompleted
                  ? (stats.completed > 0 ? "In Progress" : "Planning")
                  : rawStatus;

                return (
                  <div
                    key={pId}
                    onClick={() => openProjectChat(pId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openProjectChat(pId);
                      }
                    }}
                    className={`group rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs transition sm:p-7 ${
                      !isDirector ? "cursor-pointer hover:border-[#1E2422]/40 hover:shadow-sm" : ""
                    }`}
                  >
                    {/* Project Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100">
                          <FolderKanban size={21} />
                        </div>

                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-bold text-[#141A18] dark:text-slate-100">
                            {project.title || project.name}
                          </h3>

                          <p className="mt-0.5 text-xs font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                            {project.priority || "Medium"} priority
                          </p>
                        </div>
                      </div>

                      {/* Edit and Delete (Hidden for Director) */}
                      {!isDirector && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(project);
                            }}
                            title="Edit project"
                            className="rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] p-2"
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteProject(pId);
                            }}
                            title="Delete project"
                            className="rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-2 text-[#42504B] dark:text-slate-300 transition hover:border-red-300 dark:hover:border-red-800/70 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <p className="mt-4 min-h-10 text-sm leading-relaxed text-[#42504B] dark:text-slate-300 line-clamp-2">
                      {project.description || "No description added."}
                    </p>

                    {/* Status, Leaderboard and Members */}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3.5 py-1 text-xs font-semibold ${
                            statusStyles[displayStatus] || statusStyles.Planning
                          }`}
                        >
                          {displayStatus}
                        </span>

                        {(project.isOnLeaderboard || project.is_on_leaderboard) && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate("/leaderboard");
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-amber-300/40 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition"
                            title="Live on College Leaderboard! Click to view."
                          >
                            <Trophy size={11} className="text-amber-500" />
                            <span>On Leaderboard</span>
                          </span>
                        )}
                      </div>

                      <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E4ECE6] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-3 py-1 text-xs font-semibold text-[#42504B] dark:text-slate-300">
                        <Users size={13} />
                        <span>{memberCount} members</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-5 rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-4">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                          Task completion ({stats.completed}/{stats.total})
                        </span>

                        <span
                          className={`font-extrabold ${progressColor.text}`}
                        >
                          {stats.progress}%
                        </span>
                      </div>

                      <div className="h-2.5 overflow-hidden rounded-full bg-[#EFF4F0] dark:bg-[#1A2520]">
                        <div
                          className={`h-full rounded-full transition-all ${progressColor.bar}`}
                          style={{ width: `${stats.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Project Deliverables / Links Section */}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#E4ECE6] dark:border-[#1F2C26] pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {typeof project?.githubUrl === "string" &&
                          project.githubUrl.trim().length > 0 && (
                            <a
                              href={project.githubUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-3.5 py-1.5 text-xs font-bold"
                              title="Open GitHub Repository"
                            >
                              <GithubIcon size={13} />
                              <span>GitHub</span>
                            </a>
                          )}

                        {typeof project?.demoUrl === "string" &&
                          project.demoUrl.trim().length > 0 && (
                            <a
                              href={project.demoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-3.5 py-1.5 text-xs font-bold"
                              title="Open Live Hosted Demo"
                            >
                              <span>View Demo</span>
                              <ArrowUpRight size={13} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
                            </a>
                          )}

                        {typeof project?.pptUrl === "string" &&
                          project.pptUrl.trim().length > 0 && (
                            <a
                              href={project.pptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-3.5 py-1.5 text-xs font-bold"
                              title="Open Presentation Slides / PPT"
                            >
                              <Presentation size={13} />
                              <span>PPT</span>
                            </a>
                          )}
                      </div>

                      {/* Upload / Edit Project Button (Strict Dual Condition Gatekeeper) */}
                      {!isDirector && (
                        <button
                          type="button"
                          disabled={!isUnlocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isUnlocked) return;
                            openLinksModal(project);
                          }}
                          className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ${
                            isUnlocked
                              ? "border-[#1E2422]/25 bg-white text-[#141A18] hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] cursor-pointer"
                              : "border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#151D19] text-[#7E8B85] dark:text-[#67776F] cursor-not-allowed opacity-60"
                          }`}
                          title={
                            !isUnlocked
                              ? "Upload locked: Requires 100% tasks completed (at least 1 task) AND project status explicitly saved as 'Completed'."
                              : hasProjectDeliverables(project)
                                ? "Edit project"
                                : "Upload project"
                          }
                        >
                          {!isUnlocked ? (
                            <Lock size={12} className="opacity-70" />
                          ) : hasProjectDeliverables(project) ? (
                            <Pencil size={12} />
                          ) : (
                            <Upload size={12} />
                          )}
                          <span>
                            {hasProjectDeliverables(project)
                              ? "Edit Project"
                              : "Upload Project"}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Faculty Mentor Review (Restricted / Private to Team Members) */}
                    {project.mentorReview && (
                      <div className="mt-4 rounded-2xl border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0]/60 dark:bg-[#0C120F] p-4 text-xs">
                        <div className="flex items-center justify-between gap-2 border-b border-[#D4DFD7] dark:border-[#1F2C26] pb-2 text-[11px] font-bold">
                          <span className="flex items-center gap-1.5 uppercase tracking-wider text-[#15803D] dark:text-[#A3E635]">
                            <Award size={13} /> Faculty Mentor Review
                          </span>
                          <span className="text-[#5C6B66] dark:text-[#94A89D]">
                            {project.reviewedAt ? new Date(project.reviewedAt).toLocaleDateString() : "Verified"}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[#141A18] dark:text-slate-200 font-medium whitespace-pre-wrap">
                          &ldquo;{project.mentorReview}&rdquo;
                        </p>
                      </div>
                    )}

                    {/* Deadline and Created Date */}
                    <div className="mt-4 flex items-center justify-between text-xs font-medium text-[#5C6B66] dark:text-[#94A89D]">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays size={14} />
                        {project.deadline
                          ? new Date(project.deadline).toLocaleDateString()
                          : "No deadline"}
                      </div>

                      <span>
                        Created{" "}
                        {new Date(project.createdAt || project.created_at || Date.now()).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Open Project Chat (Hidden for Director) */}
                    {!isDirector && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openProjectChat(pId);
                        }}
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] py-3 text-sm font-bold"
                      >
                        <MessageSquare size={16} />
                        <span>Open Project Chat</span>
                        <ArrowUpRight size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col items-center justify-between gap-4 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-4 sm:flex-row">
                <p className="text-sm text-[#5C6B66] dark:text-[#94A89D]">
                  Showing{" "}
                  <span className="font-bold text-[#141A18] dark:text-slate-100">
                    {(currentPage - 1) * PAGE_SIZE + 1}
                  </span>
                  {" - "}
                  <span className="font-bold text-[#141A18] dark:text-slate-100">
                    {Math.min(currentPage * PAGE_SIZE, totalFiltered)}
                  </span>
                  {" of "}
                  <span className="font-bold text-[#141A18] dark:text-slate-100">
                    {totalFiltered}
                  </span>
                  {" projects"}
                </p>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage === 1 || loading}
                    aria-label="Previous page"
                    className="rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] p-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={18} />
                  </button>

                  {pageNumbers.map((number) => (
                    <button
                      key={number}
                      onClick={() => setPage(number)}
                      disabled={loading}
                      className={`h-9 min-w-9 rounded-full px-3 text-sm font-bold transition ${
                        currentPage === number
                          ? "bg-[#1E2422] dark:bg-[#1D2D24] dark:ring-1 dark:ring-[#A3E635]/35 text-white"
                          : "text-[#5C6B66] dark:text-[#94A89D] hover:bg-white dark:hover:bg-[#1E2A24] hover:text-[#141A18] dark:hover:text-slate-100"
                      }`}
                    >
                      {number}
                    </button>
                  ))}

                  <button
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={currentPage >= totalPages || loading}
                    aria-label="Next page"
                    className="rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] p-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Create / Edit Project Modal (Rendered via Portal above z-40 Header) */}
        {showModal &&
          !isDirector &&
          createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
              onClick={() => !saving && setShowModal(false)}
            >
              <div
                className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-[#D4DFD7] bg-[#FAFBF9] shadow-2xl dark:border-[#1F2C26] dark:bg-[#111815]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Pinned Non-Scrolling Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-[#E4ECE6] px-6 py-5 dark:border-[#1F2C26]">
                  <div>
                    <h2 className="text-xl font-bold text-[#141A18] dark:text-slate-100">
                      {editingId ? "Edit Project" : "Create Project"}
                    </h2>

                    <p className="mt-1 text-sm text-[#5C6B66] dark:text-[#94A89D]">
                      Project details are saved to database.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setShowModal(false)}
                    aria-label="Close modal"
                    className="rounded-full bg-[#EFF4F0] dark:bg-[#1A2520] p-2 text-[#42504B] dark:text-slate-300 transition hover:bg-[#D4DFD7] dark:hover:bg-[#26352D]"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  {/* Internal Scrollable Form Body */}
                  <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 scrollbar-thin">
                    {modalError && (
                      <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                        <AlertCircle size={18} className="mt-0.5 shrink-0" />
                        <span>{modalError}</span>
                      </div>
                    )}

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                        Project Name *
                      </label>
                      <input
                        required
                        maxLength={100}
                        placeholder="e.g., Autonomous Rover"
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        className="w-full rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                        Description
                      </label>
                      <textarea
                        rows={3}
                        maxLength={500}
                        placeholder="Describe your project goals..."
                        value={form.description}
                        onChange={(e) =>
                          setForm({ ...form, description: e.target.value })
                        }
                        className="w-full resize-y rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                          Status
                        </label>
                        <div className="relative">
                          <select
                            value={form.status}
                            onChange={(e) =>
                              setForm({ ...form, status: e.target.value })
                            }
                            className="w-full appearance-none rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E] cursor-pointer"
                          >
                            <option value="Planning">Planning</option>
                            <option value="In Progress">In Progress</option>
                            <option
                              value="Completed"
                              disabled={!canMarkEditingProjectCompleted}
                            >
                              Completed{!canMarkEditingProjectCompleted ? " (Locked)" : ""}
                            </option>
                            <option value="On Hold">On Hold</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
                        </div>
                        {!canMarkEditingProjectCompleted && (
                          <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                            Complete all project tasks first to mark project as Completed
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                          Priority
                        </label>
                        <div className="relative">
                          <select
                            value={form.priority}
                            onChange={(e) =>
                              setForm({ ...form, priority: e.target.value })
                            }
                            className="w-full appearance-none rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E] cursor-pointer"
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
                        Deadline
                      </label>
                      <input
                        type="date"
                        min={todayStr}
                        value={form.deadline}
                        onChange={(e) => {
                          setModalError("");
                          setForm({ ...form, deadline: e.target.value });
                        }}
                        className="w-full rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
                      />
                    </div>

                    {!editingId && (
                      <div>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                          Invite Faculty Mentor (Optional)
                        </label>
                        <SearchableSelect
                          options={mentors.map((m) => ({
                            value: String(m.id),
                            label: m.name,
                            sublabel: m.email,
                          }))}
                          value={form.mentorId}
                          onChange={(val) => setForm({ ...form, mentorId: val })}
                          placeholder="Search & invite a mentor..."
                          searchPlaceholder="Type mentor name or email..."
                          allowEmpty
                          emptyOptionLabel="No mentor invitation yet"
                        />
                        <p className="mt-1.5 text-[11px] text-[#5C6B66] dark:text-[#94A89D]">
                          A pending invitation will be sent — the mentor is assigned once they accept from their Mentor Portal.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Pinned Footer */}
                  <div className="flex shrink-0 justify-end gap-3 border-t border-[#E4ECE6] px-6 py-4 dark:border-[#1F2C26]">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setShowModal(false)}
                      className="rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-sm font-bold"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={saving || !form.name.trim()}
                      className="inline-flex items-center gap-2 rounded-full bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-6 py-2.5 text-sm font-bold shadow-xs disabled:opacity-50"
                    >
                      {saving && (
                        <LoaderCircle size={16} className="animate-spin" />
                      )}
                      {editingId ? "Update Project" : "Create Project"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )}

        {/* Upload / Edit Links & Deliverables Modal (Rendered via Portal above z-40 Header) */}
        {showLinksModal &&
          !isDirector &&
          createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
              onClick={() => !savingLinks && setShowLinksModal(false)}
            >
              <div
                className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-[#D4DFD7] bg-[#FAFBF9] shadow-2xl dark:border-[#1F2C26] dark:bg-[#111815]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Pinned Non-Scrolling Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-[#E4ECE6] px-6 py-5 dark:border-[#1F2C26]">
                  <div>
                    <h2 className="text-xl font-bold text-[#141A18] dark:text-slate-100">
                      Upload Project Deliverables
                    </h2>
                    <p className="mt-1 text-sm text-[#5C6B66] dark:text-[#94A89D]">
                      Add or update GitHub repo, hosted demo, and presentation links.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={savingLinks}
                    onClick={() => setShowLinksModal(false)}
                    aria-label="Close modal"
                    className="rounded-full bg-[#EFF4F0] dark:bg-[#1A2520] p-2 text-[#42504B] dark:text-slate-300 transition hover:bg-[#D4DFD7] dark:hover:bg-[#26352D]"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form
                  onSubmit={handleSaveLinks}
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  {/* Internal Scrollable Form Body */}
                  <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 scrollbar-thin">
                    {(() => {
                      const selectedProj = dropdownProjects.find(
                        (p) => String(p._id || p.id) === String(selectedProjectId),
                      );
                      const selectedProjStats = selectedProjectId ? projectStats[String(selectedProjectId)] : null;
                      const isSelectedProjUnlocked = isProjectUploadUnlocked(selectedProj, selectedProjStats);

                      if (!isSelectedProjUnlocked && selectedProj) {
                        return (
                          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 p-4 text-xs">
                            <div className="flex items-start gap-2.5">
                              <Lock size={16} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
                              <div>
                                <p className="font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                                  Upload Deliverables Locked
                                </p>
                                <p className="mt-0.5 text-[#5C6B66] dark:text-[#94A89D]">
                                  This project does not meet the requirements to upload deliverables. Both conditions must be met:
                                </p>
                                <ul className="mt-2.5 space-y-1.5 font-semibold">
                                  <li className={`flex items-center gap-1.5 ${selectedProjStats?.total > 0 && selectedProjStats?.completed === selectedProjStats?.total ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300"}`}>
                                    {selectedProjStats?.total > 0 && selectedProjStats?.completed === selectedProjStats?.total ? <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" /> : <AlertCircle size={13} />}
                                    <span>100% Tasks Completed ({selectedProjStats?.completed || 0}/{selectedProjStats?.total || 0} tasks — min 1 required)</span>
                                  </li>
                                  <li className={`flex items-center gap-1.5 ${isCompleted(selectedProj?.status) ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300"}`}>
                                    {isCompleted(selectedProj?.status) ? <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" /> : <AlertCircle size={13} />}
                                    <span>Project Status saved as &ldquo;Completed&rdquo; (Current: {selectedProj?.status || "Planning"})</span>
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                        Select Project *
                      </label>
                      <div className="relative">
                        <select
                          value={selectedProjectId}
                          onChange={(e) => {
                            const pId = e.target.value;
                            setSelectedProjectId(pId);
                            const proj = dropdownProjects.find(
                              (p) => String(p._id || p.id) === String(pId),
                            );
                            if (proj) {
                              setLinksForm({
                                description: proj.description || "",
                                githubUrl: proj.githubUrl || "",
                                demoUrl: proj.demoUrl || "",
                                pptUrl: proj.pptUrl || "",
                              });
                            }
                          }}
                          className="w-full appearance-none rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E] cursor-pointer"
                        >
                          {dropdownProjects.map((p) => (
                            <option
                              key={p._id || p.id}
                              value={p._id || p.id}
                            >
                              {p.name || p.title}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                        Project Summary / Description
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Short description of the deliverable..."
                        value={linksForm.description}
                        onChange={(e) =>
                          setLinksForm({
                            ...linksForm,
                            description: e.target.value,
                          })
                        }
                        className="w-full resize-y rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                        GitHub Repository URL
                      </label>
                      <input
                        type="url"
                        placeholder="https://github.com/organization/repo"
                        value={linksForm.githubUrl}
                        onChange={(e) =>
                          setLinksForm({
                            ...linksForm,
                            githubUrl: e.target.value,
                          })
                        }
                        className="w-full rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                        Live Hosted Demo URL
                      </label>
                      <input
                        type="url"
                        placeholder="https://your-demo-app.vercel.app"
                        value={linksForm.demoUrl}
                        onChange={(e) =>
                          setLinksForm({
                            ...linksForm,
                            demoUrl: e.target.value,
                          })
                        }
                        className="w-full rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                        Presentation Slides / PPT URL
                      </label>
                      <input
                        type="url"
                        placeholder="https://docs.google.com/presentation/d/..."
                        value={linksForm.pptUrl}
                        onChange={(e) =>
                          setLinksForm({
                            ...linksForm,
                            pptUrl: e.target.value,
                          })
                        }
                        className="w-full rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
                      />
                    </div>
                  </div>

                  {/* Pinned Footer */}
                  <div className="flex shrink-0 justify-end gap-3 border-t border-[#E4ECE6] px-6 py-4 dark:border-[#1F2C26]">
                    <button
                      type="button"
                      disabled={savingLinks}
                      onClick={() => setShowLinksModal(false)}
                      className="rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-sm font-bold"
                    >
                      Cancel
                    </button>

                    {(() => {
                      const selectedProj = dropdownProjects.find(
                        (p) => String(p._id || p.id) === String(selectedProjectId),
                      );
                      const selectedProjStats = selectedProjectId ? projectStats[String(selectedProjectId)] : null;
                      const isUnlocked = isProjectUploadUnlocked(selectedProj, selectedProjStats);

                      return (
                        <button
                          type="submit"
                          disabled={savingLinks || !selectedProjectId || !isUnlocked}
                          title={!isUnlocked ? "Upload locked: Requires 100% tasks completed AND project status saved as 'Completed'." : undefined}
                          className="inline-flex items-center gap-2 rounded-full bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-6 py-2.5 text-sm font-bold shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingLinks && (
                            <LoaderCircle size={16} className="animate-spin" />
                          )}
                          Save Deliverables
                        </button>
                      );
                    })()}
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </ErrorBoundary>
  );
}
