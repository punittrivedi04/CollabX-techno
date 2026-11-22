import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Search,
  CalendarDays,
  UserRound,
  FolderKanban,
  X,
  Trash2,
  Pencil,
  LoaderCircle,
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock3,
  RefreshCw,
  ChevronDown,
  Shield,
} from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

const emptyForm = {
  title: "",
  description: "",
  projectId: "",
  assignedTo: "",
  status: "Todo",
  priority: "Medium",
  dueDate: "",
};

const columns = [
  {
    id: "Todo",
    label: "To Do",
    icon: Circle,
    badge: "border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#42504B] dark:text-slate-300",
  },
  {
    id: "In Progress",
    label: "In Progress",
    icon: Clock3,
    badge: "border border-[#C5D8B6] dark:border-[#2B3F22] bg-[#EEF6E6] dark:bg-[#1B2A16] text-[#2C3A35] dark:text-slate-200",
  },
  {
    id: "In Review",
    label: "In Review",
    icon: RefreshCw,
    badge: "border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] text-[#42504B] dark:text-slate-300",
  },
  {
    id: "Completed",
    label: "Completed",
    icon: CheckCircle2,
    badge: "border border-[#2E8B63]/30 dark:border-[#22C55E]/40 bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7]",
  },
];

const priorityStyles = {
  High: "border border-[#1E2422]/25 bg-[#1E2422]/8 text-[#141A18] dark:text-slate-100",
  Medium: "border border-[#C9D8CE] dark:border-[#24322B] bg-[#E8F0EA] dark:bg-[#18261F] text-[#2C3A35] dark:text-slate-200",
  Low: "border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#5C6B66] dark:text-[#94A89D]",
};

const getError = (error) =>
  error.response?.data?.message || error.message || "Something went wrong.";

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

const getId = (value) =>
  typeof value === "object" && value !== null ? value._id || value.id : value;

export default function Tasks() {
  const { user } = useAuth();
  const currentUserId = String(user?._id || user?.id || "");
  const userRole = String(user?.role || "").toLowerCase().trim();
  const isAdmin = userRole === "admin" || userRole === "coordinator";
  const isMentor = userRole === "mentor";
  const isDirector = userRole === "director";

  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [projectFilter, setProjectFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [modalError, setModalError] = useState("");

  const todayStr = getTodayDateString();

  const userOwnedProjects = useMemo(() => {
    return projects.filter(
      (p) => String(p.owner_id || p.owner?.id || p.owner?._id || p.owner || "") === currentUserId,
    );
  }, [projects, currentUserId]);

  const canCreateTask = !isDirector && (isAdmin || isMentor || projects.length > 0);

  const selectedProject = useMemo(
    () =>
      projects.find(
        (item) => String(item._id || item.id) === String(form.projectId),
      ),
    [projects, form.projectId],
  );

  const selectedProjectCreatedDate = dateForInput(
    selectedProject?.createdAt || selectedProject?.created_at,
  );

  // Minimum allowed due date = max(todayStr, selectedProjectCreatedDate)
  const minDueDate =
    selectedProjectCreatedDate && selectedProjectCreatedDate > todayStr
      ? selectedProjectCreatedDate
      : todayStr;

  useEffect(() => {
    if (!showModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showModal]);

  const loadData = async () => {
    if (isDirector) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [taskResponse, projectResponse] = await Promise.all([
        api.get("/tasks"),
        api.get("/projects"),
      ]);

      setTasks(taskResponse.data.tasks || []);
      setProjects(projectResponse.data.projects || []);
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isDirector]);

  const filteredTasks = useMemo(() => {
    const term = search.toLowerCase();

    return tasks.filter((task) => {
      const matchesSearch =
        task.title?.toLowerCase().includes(term) ||
        task.description?.toLowerCase().includes(term) ||
        task.project?.name?.toLowerCase().includes(term) ||
        task.assignedTo?.name?.toLowerCase().includes(term);

      const matchesPriority =
        priorityFilter === "All" || task.priority === priorityFilter;

      const matchesProject =
        projectFilter === "All" || String(getId(task.project)) === String(projectFilter);

      return matchesSearch && matchesPriority && matchesProject;
    });
  }, [tasks, search, priorityFilter, projectFilter]);

  const getProjectMembers = (projectId) => {
    const project = projects.find((item) => String(item._id || item.id) === String(projectId));
    if (!project) return [];

    const people = [
      ...(project.owner ? [project.owner] : []),
      ...(project.members || []),
    ];

    const uniquePeople = new Map();

    people.forEach((person) => {
      const pId = getId(person);
      if (pId) uniquePeople.set(String(pId), person);
    });

    // Ensure current user is selectable for self-assignment if part of the project
    if (user && currentUserId && !uniquePeople.has(currentUserId)) {
      const isUserInProject =
        String(project.owner_id || project.owner?.id || project.owner?._id || project.owner || "") === currentUserId ||
        (Array.isArray(project.members) && project.members.some((m) => String(m.id || m._id) === currentUserId));
      if (isUserInProject) {
        uniquePeople.set(currentUserId, user);
      }
    }

    return Array.from(uniquePeople.values());
  };

  const openCreateModal = () => {
    setEditingId(null);
    setModalError("");
    setForm({
      ...emptyForm,
      projectId: projects[0]?._id || projects[0]?.id || "",
    });
    setShowModal(true);
  };

  const openEditModal = (task) => {
    setEditingId(task._id || task.id);
    setModalError("");

    setForm({
      title: task.title || "",
      description: task.description || "",
      projectId: getId(task.project) || "",
      assignedTo: getId(task.assignedTo) || "",
      status: task.status || "Todo",
      priority: task.priority || "Medium",
      dueDate: dateForInput(task.dueDate),
    });

    setShowModal(true);
  };

  const handleProjectChange = (projectId) => {
    setModalError("");
    setForm((current) => ({
      ...current,
      projectId,
      assignedTo: "",
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    if (!form.title.trim() || !form.projectId) return;

    if (form.dueDate && form.dueDate < minDueDate) {
      setModalError(
        selectedProjectCreatedDate && selectedProjectCreatedDate > todayStr
          ? `Task due date cannot be earlier than the project's creation date (${selectedProjectCreatedDate}).`
          : `Task due date cannot be earlier than today (${todayStr}).`,
      );
      return;
    }

    setSaving(true);
    setError("");
    setModalError("");

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      assignedTo: form.assignedTo || null,
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate || null,
    };

    try {
      if (editingId) {
        await api.put(`/tasks/${editingId}`, payload);
      } else {
        await api.post("/tasks", {
          ...payload,
          projectId: form.projectId,
        });
      }

      setShowModal(false);
      setEditingId(null);
      setForm(emptyForm);

      await loadData();
      window.dispatchEvent(new CustomEvent("collabx_tasks_updated"));
    } catch (err) {
      setError(getError(err));
    } finally {
      setSaving(false);
    }
  };

  const changeTaskStatus = async (taskId, status) => {
    setError("");

    try {
      const response = await api.put(`/tasks/${taskId}`, { status });

      setTasks((current) =>
        current.map((task) =>
          String(task._id || task.id) === String(taskId) ? response.data.task : task,
        ),
      );
      window.dispatchEvent(new CustomEvent("collabx_tasks_updated"));
    } catch (err) {
      setError(getError(err));
    }
  };

  const deleteTask = async (taskId) => {
    if (!window.confirm("Delete this task permanently?")) return;

    setError("");

    try {
      await api.delete(`/tasks/${taskId}`);

      setTasks((current) => current.filter((task) => String(task._id || task.id) !== String(taskId)));
      window.dispatchEvent(new CustomEvent("collabx_tasks_updated"));
    } catch (err) {
      setError(getError(err));
    }
  };

  if (isDirector) {
    return (
      <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-8 text-center shadow-2xs">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7]">
          <Shield size={32} />
        </div>
        <h2 className="mt-4 text-xl font-extrabold text-[#141A18] dark:text-slate-100">
          Director Executive Mode
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#5C6B66] dark:text-[#94A89D]">
          The Director account has high-level read-only oversight across all 47 projects and 139 users. Operational sprint tasks are managed directly by project teams.
        </p>
      </div>
    );
  }

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(
    (task) => task.status === "Completed",
  ).length;
  const pendingTasks = tasks.filter(
    (task) => task.status !== "Completed",
  ).length;

  return (
    <div className="space-y-6 text-[#141A18] dark:text-slate-100">
      {/* Top Action Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-5 shadow-2xs sm:flex-row sm:items-center sm:p-6">
        <div>
          <span className="inline-block rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
            Sprint Board
          </span>
          <p className="mt-1.5 text-sm font-medium text-[#5C6B66] dark:text-[#94A89D]">
            Organize tasks, manage priorities and move deliverables across stages.
          </p>
        </div>

        {canCreateTask && (
          <button
            onClick={openCreateModal}
            disabled={projects.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-sm font-bold shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={17} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" /> Create Task
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-sm font-medium text-red-600 dark:text-red-400">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={17} />
          </button>
        </div>
      )}

      {/* Calm Bento Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            label: "Total Tasks",
            value: totalTasks,
            Icon: FolderKanban,
            badge: "border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100",
            bg: "border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815]",
          },
          {
            label: "Pending Tasks",
            value: pendingTasks,
            Icon: Clock3,
            badge: "border border-[#E2DFD5] dark:border-[#2D362B] bg-white dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100",
            bg: "border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A]",
          },
          {
            label: "Completed Tasks",
            value: completedTasks,
            Icon: CheckCircle2,
            badge: "border border-[#2E8B63]/25 bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7]",
            bg: "border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815]",
          },
        ].map(({ label, value, Icon, badge, bg }) => (
          <div
            key={label}
            className={`rounded-[28px] border ${bg} p-6 shadow-2xs`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
                {label}
              </p>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${badge}`}
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

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75] dark:text-[#869B90]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks by title, assignee or project..."
            className="w-full rounded-full border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] py-3 pl-11 pr-5 text-sm font-medium text-[#141A18] dark:text-slate-100 shadow-2xs outline-none transition placeholder:text-[#8E9E97] dark:placeholder:text-[#687E73] focus:border-[#2E8B63] dark:focus:border-[#22C55E] focus:bg-white dark:focus:bg-[#0C120F] focus:ring-2 focus:ring-[#5dd39e]/25"
          />
        </div>

        <div className="relative">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="w-full appearance-none rounded-full border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] py-3 pl-5 pr-11 text-sm font-semibold text-[#141A18] dark:text-slate-100 shadow-2xs outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E] focus:bg-white dark:focus:bg-[#0C120F] cursor-pointer lg:w-auto"
          >
            <option value="All">All Projects</option>
            {projects.map((project) => (
              <option key={project._id || project.id} value={project._id || project.id}>
                {project.name || project.title}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
        </div>

        <div className="relative">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full appearance-none rounded-full border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] py-3 pl-5 pr-11 text-sm font-semibold text-[#141A18] dark:text-slate-100 shadow-2xs outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E] focus:bg-white dark:focus:bg-[#0C120F] cursor-pointer lg:w-auto"
          >
            <option value="All">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
        </div>
      </div>

      {/* Kanban Columns */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] py-20 text-sm font-semibold text-[#5C6B66] dark:text-[#94A89D]">
          <LoaderCircle className="animate-spin text-[#2E8B63] dark:text-[#4ADE80]" size={22} />
          Loading tasks from database...
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[#C5D4CA] dark:border-[#2A3B32] bg-[#FAFBF9] dark:bg-[#111815] py-16 text-center">
          <FolderKanban size={35} className="mx-auto text-[#5C6B66] dark:text-[#94A89D]" />
          <h3 className="mt-4 font-bold text-[#141A18] dark:text-slate-100">
            Create a project first
          </h3>
          <p className="mt-1 text-sm text-[#5C6B66] dark:text-[#94A89D]">
            Tasks must belong to a project.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
          {columns.map((column) => {
            const columnTasks = filteredTasks.filter(
              (task) => task.status === column.id,
            );
            const ColumnIcon = column.icon;

            return (
              <div
                key={column.id}
                className="min-h-[380px] rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-4 shadow-2xs"
              >
                <div className="mb-4 flex items-center justify-between px-1 pt-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full ${column.badge}`}
                    >
                      <ColumnIcon size={14} />
                    </span>
                    <h3 className="text-sm font-extrabold text-[#141A18] dark:text-slate-100">
                      {column.label}
                    </h3>
                  </div>

                  <span className="rounded-full border border-[#E4ECE6] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-2.5 py-0.5 text-xs font-bold text-[#42504B] dark:text-slate-300">
                    {columnTasks.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {columnTasks.map((task) => {
                    const tId = task._id || task.id;
                    const taskProjId = getId(task.project) || task.projectId || task.project_id;
                    const taskProj = projects.find((p) => String(p._id || p.id) === String(taskProjId));
                    const projOwnerId = String(
                      taskProj?.owner_id ||
                      taskProj?.owner?.id ||
                      taskProj?.owner?._id ||
                      taskProj?.owner ||
                      task.project_owner_id ||
                      task.projectOwnerId ||
                      ""
                    );
                    const isMemberLeader = Boolean(
                      taskProj?.members?.some(
                        (m) =>
                          String(m.id || m._id) === currentUserId &&
                          String(m.role || "").toLowerCase() === "leader"
                      )
                    );
                    const isTaskLeader = isAdmin || isMentor || (projOwnerId && projOwnerId === currentUserId) || isMemberLeader;

                    return (
                      <div
                        key={tId}
                        className="rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-4 shadow-2xs transition hover:border-[#1E2422]/30"
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <span
                            className={`rounded-full px-3 py-0.5 text-[11px] font-semibold ${priorityStyles[task.priority] || priorityStyles.Medium}`}
                          >
                            {task.priority}
                          </span>

                          {isTaskLeader && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openEditModal(task)}
                                title="Edit task"
                                className="rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] p-1.5"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => deleteTask(tId)}
                                title="Delete task"
                                className="rounded-full border border-[#E4ECE6] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-1.5 text-[#42504B] dark:text-slate-300 transition hover:border-red-300 dark:hover:border-red-800/70 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>

                        <h4 className="text-sm font-bold leading-snug text-[#141A18] dark:text-slate-100">
                          {task.title}
                        </h4>

                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#5C6B66] dark:text-[#94A89D]">
                          {task.description || "No description added."}
                        </p>

                        <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#42504B] dark:text-slate-300">
                          <FolderKanban size={13} className="text-[#2E8B63] dark:text-[#4ADE80]" />
                          <span className="truncate">
                            {task.project?.name || task.project?.title || "Project"}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E4ECE6] dark:border-[#1F2C26] pt-3">
                          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-[#42504B] dark:text-slate-300">
                            <UserRound size={13} />
                            <span className="truncate">
                              {task.assignedTo?.name || "Unassigned"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                            <CalendarDays size={13} />
                            {task.dueDate
                              ? new Date(task.dueDate).toLocaleDateString()
                              : "No date"}
                          </div>
                        </div>

                        <div className="relative mt-3">
                          <select
                            value={task.status}
                            onChange={(e) =>
                              changeTaskStatus(tId, e.target.value)
                            }
                            className="w-full appearance-none rounded-full border border-[#1E2422]/20 bg-[#FAFBF9] dark:bg-[#111815] py-2 pl-3.5 pr-8 text-xs font-bold text-[#141A18] dark:text-slate-100 outline-none transition hover:border-[#1E2422] dark:hover:border-[#A3E635]/60 focus:border-[#2E8B63] dark:focus:border-[#22C55E] cursor-pointer"
                          >
                            {columns.map((item) => (
                              <option key={item.id} value={item.id}>
                                Move to: {item.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#42504B] dark:text-slate-300" />
                        </div>
                      </div>
                    );
                  })}

                  {columnTasks.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[#D4DFD7] dark:border-[#1F2C26] py-10 text-center text-xs font-medium text-[#5C6B66] dark:text-[#94A89D]">
                      No tasks here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Task Modal (Rendered via Portal above z-40 Header) */}
      {showModal &&
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
                    {editingId ? "Edit Task" : "Create Task"}
                  </h2>
                  <p className="mt-1 text-sm text-[#5C6B66] dark:text-[#94A89D]">
                    Task details are saved to database.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowModal(false)}
                  aria-label="Close modal"
                  className="rounded-full bg-[#EFF4F0] p-2 text-[#5C6B66] transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:bg-[#1A2520] dark:text-[#94A89D] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B]"
                >
                  <X size={19} />
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
                      Task title *
                    </label>
                    <input
                      required
                      maxLength={150}
                      value={form.title}
                      onChange={(e) =>
                        setForm({ ...form, title: e.target.value })
                      }
                      placeholder="e.g. Build authentication API"
                      className="w-full rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none focus:border-[#2E8B63] dark:focus:border-[#22C55E] focus:bg-white dark:focus:bg-[#0C120F]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      placeholder="Describe what needs to be done..."
                      className="w-full resize-none rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none focus:border-[#2E8B63] dark:focus:border-[#22C55E] focus:bg-white dark:focus:bg-[#0C120F]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                      Project *
                    </label>
                    <div className="relative">
                      <select
                        required
                        disabled={Boolean(editingId)}
                        value={form.projectId}
                        onChange={(e) => handleProjectChange(e.target.value)}
                        className="w-full appearance-none rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] py-3 pl-4 pr-10 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none focus:border-[#2E8B63] dark:focus:border-[#22C55E] disabled:opacity-60 cursor-pointer"
                      >
                        <option value="">Select a project</option>
                        {projects.map((project) => (
                          <option
                            key={project._id || project.id}
                            value={project._id || project.id}
                          >
                            {project.name || project.title}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                      Assign to
                    </label>
                    <div className="relative">
                      <select
                        value={form.assignedTo}
                        onChange={(e) =>
                          setForm({ ...form, assignedTo: e.target.value })
                        }
                        className="w-full appearance-none rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] py-3 pl-4 pr-10 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none focus:border-[#2E8B63] dark:focus:border-[#22C55E] cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {getProjectMembers(form.projectId).map((person) => (
                          <option
                            key={person._id || person.id}
                            value={person._id || person.id}
                          >
                            {person.name} ({person.email}{(person.roll_no || person.rollNumber) ? ` · Roll: ${person.roll_no || person.rollNumber}` : ""})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                          className="w-full appearance-none rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] py-3 pl-4 pr-10 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none focus:border-[#2E8B63] dark:focus:border-[#22C55E] cursor-pointer"
                        >
                          {columns.map((column) => (
                            <option key={column.id} value={column.id}>
                              {column.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
                      </div>
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
                          className="w-full appearance-none rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] py-3 pl-4 pr-10 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none focus:border-[#2E8B63] dark:focus:border-[#22C55E] cursor-pointer"
                        >
                          <option>Low</option>
                          <option>Medium</option>
                          <option>High</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                      Due date
                    </label>
                    <input
                      type="date"
                      min={minDueDate}
                      value={form.dueDate}
                      onChange={(e) => {
                        setModalError("");
                        setForm({ ...form, dueDate: e.target.value });
                      }}
                      className="w-full rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
                    />
                  </div>
                </div>

                {/* Pinned Footer */}
                <div className="flex shrink-0 gap-3 border-t border-[#E4ECE6] px-6 py-4 dark:border-[#1F2C26]">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setShowModal(false)}
                    className="flex-1 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] py-3 text-sm font-bold"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] py-3 text-sm font-bold shadow-sm disabled:opacity-60"
                  >
                    {saving && (
                      <LoaderCircle size={16} className="animate-spin" />
                    )}
                    {saving
                      ? "Saving..."
                      : editingId
                        ? "Save Changes"
                        : "Create Task"}
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
