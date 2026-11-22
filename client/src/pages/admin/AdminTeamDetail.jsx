import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  ArrowRightLeft,
  Award,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  Edit2,
  ExternalLink,
  FolderKanban,
  Globe,
  MessageSquare,
  Plus,
  Presentation,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import api from "../../services/api";
import {
  calculateProjectProgress,
  formatDate,
  getErrorMessage,
  getInitials,
  isValidHttpUrl,
  resolveProjectStatus,
  timeAgo,
} from "../../utils/portalHelpers";
import EmbeddedProjectChat from "../../components/portal/EmbeddedProjectChat";
import SearchableSelect from "../../components/portal/SearchableSelect";
import {
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  ProgressBar,
  SectionCard,
  SuccessAlert,
  portalInputClass,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

function NeutralPill({ label }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200">
      {label}
    </span>
  );
}

export default function AdminTeamDetail() {
  const { projectId } = useParams();
  // Chat stays collapsed by default; all team details remain visible in a single scroll
  const [showChat, setShowChat] = useState(false);
  const chatSectionRef = useRef(null);

  const handleToggleChat = () => {
    setShowChat((prev) => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() => {
          const el = chatSectionRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const headerOffset = 88;
          const isClippedBelow = rect.bottom > window.innerHeight;
          const isAboveHeader = rect.top < headerOffset;
          if (isAboveHeader) {
            window.scrollTo({
              top: Math.max(0, window.scrollY + rect.top - headerOffset),
              behavior: "smooth",
            });
          } else if (isClippedBelow) {
            const desiredDelta = Math.min(
              rect.bottom - window.innerHeight + 24,
              rect.top - headerOffset,
            );
            if (desiredDelta > 0) {
              window.scrollBy({ top: desiredDelta, behavior: "smooth" });
            }
          }
        });
      }
      return next;
    });
  };

  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [mentors, setMentors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showReassign, setShowReassign] = useState(false);
  const [selectedMentorId, setSelectedMentorId] = useState("");

  // Project Delete state
  const [showDeleteProject, setShowDeleteProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

  // Direct Team Membership state
  const [showAddMember, setShowAddMember] = useState(false);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [removingMember, setRemovingMember] = useState(false);

  // Deliverables update state
  const [showEditDeliverables, setShowEditDeliverables] = useState(false);
  const [deliverablesForm, setDeliverablesForm] = useState({
    githubUrl: "",
    demoUrl: "",
    pptUrl: "",
  });
  const [savingDeliverables, setSavingDeliverables] = useState(false);

  // Task management state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    priority: "Normal",
    status: "Pending",
    assignedTo: "",
    dueDate: "",
  });
  const [savingTask, setSavingTask] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [deletingTask, setDeletingTask] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [teamRes, mentorsRes] = await Promise.all([
        api.get(`/admin/teams/${projectId}`),
        api.get("/admin/mentors"),
      ]);
      const payload = teamRes.data?.data || teamRes.data;
      setData(payload);
      setMentors(
        (Array.isArray(mentorsRes.data?.mentors)
          ? mentorsRes.data.mentors
          : []
        ).filter((m) => m.is_active !== false),
      );
      setSelectedMentorId(
        payload?.team?.mentor?.id ? String(payload.team.mentor.id) : "",
      );
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load team details."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setShowChat(false);
    load();
  }, [load]);

  const handleReassignMentor = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch(`/admin/projects/${projectId}/reassign-mentor`, {
        mentor_id: selectedMentorId ? Number(selectedMentorId) : null,
      });
      setSuccess(
        "Project mentor reassigned cleanly. Tasks, chats, and Drive resources remain intact.",
      );
      setShowReassign(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to reassign project mentor."));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (deletingProject) return;
    setDeletingProject(true);
    setError("");
    try {
      await api.delete(`/projects/${projectId}`);
      navigate("/admin/teams", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete project."));
      setDeletingProject(false);
      setShowDeleteProject(false);
    }
  };

  const handleOpenAddMember = async () => {
    setShowAddMember(true);
    setSelectedStudentId("");
    setLoadingStudents(true);
    try {
      const res = await api.get("/admin/students", { params: { limit: 200 } });
      const list = Array.isArray(res.data?.students) ? res.data.students : [];
      const enrolledIds = new Set([
        ...(data?.team?.owner?.id ? [Number(data.team.owner.id)] : []),
        ...(data?.team?.teamLeader?.id ? [Number(data.team.teamLeader.id)] : []),
        ...(Array.isArray(data?.team?.members)
          ? data.team.members.map((m) => Number(m.id))
          : []),
      ]);
      const candidates = list.filter(
        (s) => !enrolledIds.has(Number(s.id)) && s.is_active !== false,
      );
      setAvailableStudents(candidates);
      if (candidates.length > 0) {
        setSelectedStudentId(String(candidates[0].id));
      }
    } catch {
      setAvailableStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (addingMember || !selectedStudentId) return;
    setAddingMember(true);
    setError("");
    setSuccess("");
    try {
      await api.post(`/admin/teams/${projectId}/members`, {
        userId: Number(selectedStudentId),
        role: "member",
      });
      setSuccess("Team member added cleanly without invite token.");
      setShowAddMember(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to add member to team."));
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async () => {
    if (removingMember || !memberToRemove) return;
    setRemovingMember(true);
    setError("");
    setSuccess("");
    try {
      await api.delete(`/admin/teams/${projectId}/members/${memberToRemove.id}`);
      setSuccess("Team member removed cleanly.");
      setMemberToRemove(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to remove team member."));
    } finally {
      setRemovingMember(false);
    }
  };

  const handleOpenEditDeliverables = () => {
    setDeliverablesForm({
      githubUrl: data?.deliverables?.githubUrl || data?.resources?.githubUrl || "",
      demoUrl: data?.deliverables?.demoUrl || data?.resources?.demoUrl || "",
      pptUrl: data?.deliverables?.pptUrl || data?.resources?.pptUrl || "",
    });
    setShowEditDeliverables(true);
  };

  const handleSaveDeliverables = async (e) => {
    e.preventDefault();
    if (savingDeliverables) return;
    setSavingDeliverables(true);
    setError("");
    setSuccess("");
    try {
      await api.put(`/projects/${projectId}`, deliverablesForm);
      setSuccess("Project deliverable links updated cleanly.");
      setShowEditDeliverables(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to update project deliverables."));
    } finally {
      setSavingDeliverables(false);
    }
  };

  const handleOpenCreateTask = () => {
    setEditingTask(null);
    setTaskForm({
      title: "",
      description: "",
      priority: "Normal",
      status: "Pending",
      assignedTo: data?.team?.teamLeader?.id ? String(data.team.teamLeader.id) : "",
      dueDate: "",
    });
    setShowTaskModal(true);
  };

  const handleOpenEditTask = (t) => {
    setEditingTask(t);
    setTaskForm({
      title: t.title || "",
      description: t.description || "",
      priority: t.priority || "Normal",
      status: t.status || "Pending",
      assignedTo: t.assignedTo?.id ? String(t.assignedTo.id) : "",
      dueDate: t.dueDate ? String(t.dueDate).split("T")[0] : "",
    });
    setShowTaskModal(true);
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (savingTask) return;
    setSavingTask(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        title: taskForm.title.trim(),
        description: taskForm.description ? taskForm.description.trim() : "",
        priority: taskForm.priority,
        status: taskForm.status,
        assignedTo: taskForm.assignedTo ? Number(taskForm.assignedTo) : null,
        dueDate: taskForm.dueDate || null,
      };
      if (editingTask) {
        await api.put(`/tasks/${editingTask.id}`, payload);
        setSuccess("Task updated successfully.");
      } else {
        await api.post("/tasks", {
          ...payload,
          projectId: Number(projectId),
        });
        setSuccess("Task created successfully.");
      }
      setShowTaskModal(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save task."));
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteTask = async () => {
    if (deletingTask || !taskToDelete) return;
    setDeletingTask(true);
    setError("");
    setSuccess("");
    try {
      await api.delete(`/tasks/${taskToDelete.id}`);
      setSuccess("Task deleted successfully.");
      setTaskToDelete(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete task."));
    } finally {
      setDeletingTask(false);
    }
  };

  if (loading) return <LoadingState label="Loading team & project details..." />;

  if (!data?.team) {
    return (
      <div className="space-y-4 text-neutral-950 dark:text-white">
        <ErrorAlert message={error || "Team/Project not found."} />
        <Link
          to="/admin/teams"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to Teams</span>
        </Link>
      </div>
    );
  }

  const { team, resources = {}, tasks = [], recentActivities = [] } = data;
  const memberCount =
    Number(team.memberCount) ||
    (Array.isArray(team.members) ? team.members.length : 0);
  const completedTasksCount = Number(team.taskProgress?.completed) || 0;
  const totalTasksCount = Number(team.taskProgress?.total) || 0;
  const pendingTasksCount = Number(team.taskProgress?.pending) || 0;

  const resourceLinks = [
    {
      label: "GitHub Repository",
      url: resources.githubUrl,
      icon: FolderKanban,
    },
    {
      label: "Live Demo / Drive Folder",
      url: resources.demoUrl,
      icon: Globe,
    },
    {
      label: "Presentation / PPT Link",
      url: resources.pptUrl,
      icon: Presentation,
    },
  ];

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/teams"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to Teams</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReassign(true)}
            className={`${portalSecondaryBtnClass} cursor-pointer rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
          >
            <ArrowRightLeft size={14} strokeWidth={1.85} />
            <span>Reassign Mentor</span>
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteProject(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
          >
            <Trash2 size={14} strokeWidth={1.85} />
            <span>Delete Project</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {/* Header Summary Card */}
      <div className="rounded-2xl border border-black/12 bg-white p-6 shadow-2xs dark:border-white/12 dark:bg-[#08080A]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white">
                {team.title}
              </h1>
              <NeutralPill label={resolveProjectStatus(team)} />
              {team.priority && <NeutralPill label={team.priority} />}
            </div>
            {team.description && (
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {team.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            <div className="rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-[#101014]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Assigned Mentor
              </p>
              {team.mentor ? (
                <Link
                  to={`/admin/mentors/${team.mentor.id}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-extrabold text-neutral-950 hover:underline dark:text-white"
                >
                  <Award size={14} strokeWidth={1.85} />
                  <span>{team.mentor.name}</span>
                </Link>
              ) : (
                <p className="mt-1 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                  Unassigned
                </p>
              )}
            </div>

            <div className="rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-[#101014]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Deadline
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-extrabold tabular-nums text-neutral-950 dark:text-white">
                <CalendarClock size={14} strokeWidth={1.85} />
                <span>{formatDate(team.deadline)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs font-bold tabular-nums">
            <span className="text-neutral-600 dark:text-neutral-400">
              Project Progress · {completedTasksCount}/{totalTasksCount} Tasks
              Completed
            </span>
          </div>
          <ProgressBar
            value={calculateProjectProgress(team)}
            showLabel
            height="h-2"
          />
        </div>

        {/* Optional Official Team Chat Toggle */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-black/10 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={handleToggleChat}
            aria-expanded={showChat}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition ${
              showChat
                ? "border-black/25 bg-neutral-950 text-white dark:border-white/25 dark:bg-white dark:text-black"
                : "border-black/15 bg-neutral-50 text-neutral-900 hover:border-black/35 hover:bg-neutral-100 dark:border-white/15 dark:bg-[#101014] dark:text-white dark:hover:border-white/35 dark:hover:bg-[#18181E]"
            }`}
          >
            <MessageSquare size={14} strokeWidth={1.85} className="shrink-0" />
            <span>
              {showChat ? "Hide Official Team Chat" : "Official Team Chat"}
            </span>
            {showChat ? (
              <ChevronUp size={14} strokeWidth={1.85} className="shrink-0" />
            ) : (
              <ChevronDown size={14} strokeWidth={1.85} className="shrink-0" />
            )}
          </button>
        </div>
      </div>

      {showChat && (
        <div ref={chatSectionRef} className="scroll-mt-24">
          <EmbeddedProjectChat projectId={team.id} projectTitle={team.title} />
        </div>
      )}

      {/* Members & Deliverables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title={`Team Roster (${memberCount})`}
          subtitle="Team Leader and enrolled students"
          action={
            <button
              type="button"
              onClick={handleOpenAddMember}
              className={`${portalSecondaryBtnClass} cursor-pointer rounded-xl px-3 py-1.5 text-xs dark:!border-white/15 dark:!bg-[#101014] dark:!text-white dark:hover:!bg-[#18181E]`}
            >
              <UserPlus size={13} strokeWidth={1.85} />
              <span>Add Member</span>
            </button>
          }
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          <div className="space-y-2.5">
            {team.teamLeader && (
              <Link
                to={`/admin/students/${team.teamLeader.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-black/15 bg-neutral-50 p-3.5 transition hover:border-black/35 dark:border-white/15 dark:bg-[#101014] dark:hover:border-white/35"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-xs font-extrabold text-white dark:bg-white dark:text-black">
                    {getInitials(team.teamLeader.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-xs font-extrabold text-neutral-950 dark:text-white">
                        {team.teamLeader.name}
                      </p>
                      {(team.teamLeader.roll_no ||
                        team.teamLeader.rollNumber) && (
                        <span className="rounded-md border border-black/10 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-700 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-300">
                          Roll:{" "}
                          {team.teamLeader.roll_no ||
                            team.teamLeader.rollNumber}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                      {team.teamLeader.email}
                      {team.teamLeader.roll_no || team.teamLeader.rollNumber
                        ? ` · ${
                            team.teamLeader.roll_no ||
                            team.teamLeader.rollNumber
                          }`
                        : ""}
                    </p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-black/12 bg-white px-2.5 py-1 text-[11px] font-bold text-neutral-900 dark:border-white/14 dark:bg-[#08080A] dark:text-white">
                  <Crown size={12} strokeWidth={1.9} />
                  <span>Leader</span>
                </span>
              </Link>
            )}

            {(team.members || []).map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-3.5 transition hover:border-black/35 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35"
              >
                <Link
                  to={`/admin/students/${m.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-white text-[11px] font-bold text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                    {getInitials(m.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                        {m.name}
                      </p>
                      {(m.roll_no || m.rollNumber) && (
                        <span className="rounded-md border border-black/10 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-700 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-300">
                          Roll: {m.roll_no || m.rollNumber}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                      {m.email}
                      {m.roll_no || m.rollNumber
                        ? ` · ${m.roll_no || m.rollNumber}`
                        : ""}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-black/10 bg-white px-2 py-0.5 text-[11px] font-semibold capitalize text-neutral-700 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-300">
                    {m.role || "Member"}
                  </span>
                  <button
                    type="button"
                    title={`Remove ${m.name} from team`}
                    onClick={() => setMemberToRemove(m)}
                    className="cursor-pointer rounded-lg border border-transparent p-1 text-neutral-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:text-neutral-500 dark:hover:border-rose-900/50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                  >
                    <Trash2 size={13} strokeWidth={1.85} />
                  </button>
                </div>
              </div>
            ))}

            {!team.teamLeader && (team.members || []).length === 0 && (
              <EmptyState icon={Users} title="No team members listed" />
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Drive Resources & Deliverables"
          subtitle="Project repositories, decks, and demos"
          action={
            <button
              type="button"
              onClick={handleOpenEditDeliverables}
              className={`${portalSecondaryBtnClass} cursor-pointer rounded-xl px-3 py-1.5 text-xs dark:!border-white/15 dark:!bg-[#101014] dark:!text-white dark:hover:!bg-[#18181E]`}
            >
              <Edit2 size={13} strokeWidth={1.85} />
              <span>Edit Links</span>
            </button>
          }
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          <div className="space-y-3">
            {resourceLinks.map((res) => {
              const Icon = res.icon;
              const valid = isValidHttpUrl(res.url);
              return (
                <div
                  key={res.label}
                  className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-white text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                      <Icon size={16} strokeWidth={1.85} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-neutral-950 dark:text-white">
                        {res.label}
                      </p>
                      <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                        {valid ? res.url : "Not submitted yet"}
                      </p>
                    </div>
                  </div>
                  {valid && (
                    <a
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-black/15 bg-white px-3 py-1.5 text-[11px] font-bold text-neutral-900 transition hover:border-black/35 dark:border-white/15 dark:bg-[#08080A] dark:text-white dark:hover:border-white/35"
                    >
                      <span>Open</span>
                      <ExternalLink size={12} strokeWidth={1.85} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Faculty Mentor Project Review */}
      {team.mentorReview && (
        <div className="rounded-2xl border border-black/12 bg-white p-6 shadow-2xs dark:border-white/12 dark:bg-[#08080A]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-3 text-xs dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-black/12 bg-neutral-100 px-2.5 py-1 font-bold text-neutral-900 dark:border-white/14 dark:bg-[#101014] dark:text-white">
                <Award size={14} strokeWidth={1.85} />
                <span>Official Faculty Mentor Review</span>
              </span>
              <span className="font-medium text-neutral-500 dark:text-neutral-400">
                {team.reviewedAt
                  ? `Evaluated on ${formatDate(team.reviewedAt)}`
                  : "Verified Evaluation"}
              </span>
            </div>
            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Restricted: Team, Mentor &amp; Leadership Only
            </span>
          </div>
          <div className="mt-4">
            <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-neutral-950 dark:text-neutral-100">
              {team.mentorReview}
            </p>
            {team.mentor?.name && (
              <p className="mt-3 text-xs font-bold text-neutral-500 dark:text-neutral-400">
                — {team.mentor.name} (Faculty Mentor)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tasks List */}
      <SectionCard
        title={`Project Tasks (${tasks.length})`}
        subtitle={`${completedTasksCount} completed · ${pendingTasksCount} pending`}
        action={
          <button
            type="button"
            onClick={handleOpenCreateTask}
            className={`${portalSecondaryBtnClass} cursor-pointer rounded-xl px-3 py-1.5 text-xs dark:!border-white/15 dark:!bg-[#101014] dark:!text-white dark:hover:!bg-[#18181E]`}
          >
            <Plus size={13} strokeWidth={1.85} />
            <span>Add Task</span>
          </button>
        }
        className="dark:!border-white/12 dark:!bg-[#08080A]"
      >
        {tasks.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No tasks yet"
            description="Tasks created for this team will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-black/10 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:border-white/10 dark:text-neutral-400">
                <tr>
                  <th className="py-2.5 pr-4">Task</th>
                  <th className="px-3 py-2.5">Assignee</th>
                  <th className="px-3 py-2.5">Priority</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 tabular-nums">Due Date</th>
                  <th className="py-2.5 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td className="py-3 pr-4">
                      <p className="font-bold text-neutral-950 dark:text-white">
                        {t.title}
                      </p>
                      {t.description && (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                          {t.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-neutral-700 dark:text-neutral-300">
                      {t.assignedTo?.name || "Unassigned"}
                    </td>
                    <td className="px-3 py-3">
                      <NeutralPill label={t.priority || "Normal"} />
                    </td>
                    <td className="px-3 py-3">
                      <NeutralPill label={t.status || "Pending"} />
                    </td>
                    <td className="px-3 py-3 tabular-nums text-neutral-500 dark:text-neutral-400">
                      {formatDate(t.dueDate)}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          title="Edit Task"
                          onClick={() => handleOpenEditTask(t)}
                          className="cursor-pointer rounded-lg border border-black/10 bg-white p-1.5 text-neutral-600 transition hover:border-black/30 hover:text-neutral-950 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-300 dark:hover:text-white"
                        >
                          <Edit2 size={13} strokeWidth={1.85} />
                        </button>
                        <button
                          type="button"
                          title="Delete Task"
                          onClick={() => setTaskToDelete(t)}
                          className="cursor-pointer rounded-lg border border-black/10 bg-white p-1.5 text-neutral-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-rose-900/50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                        >
                          <Trash2 size={13} strokeWidth={1.85} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Project Activities */}
      <SectionCard
        title="Recent Project Activities"
        className="dark:!border-white/12 dark:!bg-[#08080A]"
      >
        {recentActivities.length === 0 ? (
          <EmptyState icon={Activity} title="No project activities logged yet" />
        ) : (
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {recentActivities.map((act) => (
              <div
                key={act.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-xs font-semibold text-neutral-950 dark:text-white">
                    {act.description}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {act.user?.name || "System"} · {act.action}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400">
                  {timeAgo(act.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Reassign Mentor Modal */}
      <Modal
        open={showReassign}
        onClose={() => !saving && setShowReassign(false)}
        title="Reassign Project Mentor"
        description={`Change the faculty mentor for "${team.title}". All tasks, chats, team members, and resources stay intact.`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowReassign(false)}
              disabled={saving}
              className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="reassign-mentor-form"
              disabled={saving}
              className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
            >
              <span>
                {saving ? "Reassigning..." : "Confirm Reassignment"}
              </span>
            </button>
          </>
        }
      >
        <form
          id="reassign-mentor-form"
          onSubmit={handleReassignMentor}
          className="min-h-[280px] space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Target Faculty Mentor
            </label>
            <SearchableSelect
              options={mentors.map((m) => ({
                value: String(m.id),
                label: m.name,
              }))}
              value={selectedMentorId}
              onChange={setSelectedMentorId}
              placeholder="Search a Faculty Mentor by name..."
              searchPlaceholder="Type mentor name..."
              allowEmpty
              emptyOptionLabel="Unassign Mentor"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Project Confirmation */}
      <ConfirmDialog
        open={showDeleteProject}
        title="Delete Project Permanently"
        message={`Are you sure you want to permanently delete "${team.title}"? All project tasks, member associations, deliverables, and team chat channels will be permanently removed. This action cannot be undone.`}
        confirmLabel="Delete Project"
        tone="danger"
        busy={deletingProject}
        onConfirm={handleDeleteProject}
        onClose={() => !deletingProject && setShowDeleteProject(false)}
      />

      {/* Add Team Member Modal */}
      <Modal
        open={showAddMember}
        onClose={() => !addingMember && setShowAddMember(false)}
        title="Add Team Member"
        description={`Enroll an active student directly into "${team.title}" without requiring an invitation link.`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowAddMember(false)}
              disabled={addingMember}
              className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="admin-add-member-form"
              disabled={addingMember || !selectedStudentId}
              className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
            >
              <span>{addingMember ? "Adding..." : "Add to Squad"}</span>
            </button>
          </>
        }
      >
        <form
          id="admin-add-member-form"
          onSubmit={handleAddMember}
          className="min-h-[220px] space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Select Eligible Student *
            </label>
            {loadingStudents ? (
              <p className="text-xs text-neutral-500">Loading student directory...</p>
            ) : availableStudents.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No unassigned active students available.
              </p>
            ) : (
              <SearchableSelect
                options={availableStudents.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} (${s.email}${s.roll_no ? ` · Roll: ${s.roll_no}` : ""})`,
                }))}
                value={selectedStudentId}
                onChange={setSelectedStudentId}
                placeholder="Search and select student..."
                searchPlaceholder="Type name or roll number..."
              />
            )}
          </div>
        </form>
      </Modal>

      {/* Remove Team Member Confirmation */}
      <ConfirmDialog
        open={Boolean(memberToRemove)}
        title="Remove Team Member"
        message={`Are you sure you want to remove ${memberToRemove?.name} from "${team.title}"? Any active tasks assigned to this member will be unassigned.`}
        confirmLabel="Remove Member"
        tone="danger"
        busy={removingMember}
        onConfirm={handleRemoveMember}
        onClose={() => !removingMember && setMemberToRemove(null)}
      />

      {/* Edit Deliverables Modal */}
      <Modal
        open={showEditDeliverables}
        onClose={() => !savingDeliverables && setShowEditDeliverables(false)}
        title="Edit Deliverables & Resources"
        description={`Update official GitHub repository, live demo URL, and presentation deck for "${team.title}".`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowEditDeliverables(false)}
              disabled={savingDeliverables}
              className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="admin-deliverables-form"
              disabled={savingDeliverables}
              className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
            >
              <span>{savingDeliverables ? "Saving..." : "Save Deliverables"}</span>
            </button>
          </>
        }
      >
        <form
          id="admin-deliverables-form"
          onSubmit={handleSaveDeliverables}
          className="space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              GitHub Repository URL
            </label>
            <input
              type="url"
              value={deliverablesForm.githubUrl}
              onChange={(e) =>
                setDeliverablesForm({
                  ...deliverablesForm,
                  githubUrl: e.target.value,
                })
              }
              placeholder="https://github.com/organization/repo"
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Live Demo / Drive Folder URL
            </label>
            <input
              type="url"
              value={deliverablesForm.demoUrl}
              onChange={(e) =>
                setDeliverablesForm({
                  ...deliverablesForm,
                  demoUrl: e.target.value,
                })
              }
              placeholder="https://collabx-demo.vercel.app or Google Drive"
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Presentation / PPT URL
            </label>
            <input
              type="url"
              value={deliverablesForm.pptUrl}
              onChange={(e) =>
                setDeliverablesForm({
                  ...deliverablesForm,
                  pptUrl: e.target.value,
                })
              }
              placeholder="https://docs.google.com/presentation/..."
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>
        </form>
      </Modal>

      {/* Add / Edit Task Modal */}
      <Modal
        open={showTaskModal}
        onClose={() => !savingTask && setShowTaskModal(false)}
        title={editingTask ? "Edit Project Task" : "Add Project Task"}
        description={`Manage task details, assignee, and milestones for "${team.title}".`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowTaskModal(false)}
              disabled={savingTask}
              className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="admin-task-form"
              disabled={savingTask || !taskForm.title.trim()}
              className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
            >
              <span>
                {savingTask
                  ? "Saving..."
                  : editingTask
                    ? "Update Task"
                    : "Create Task"}
              </span>
            </button>
          </>
        }
      >
        <form
          id="admin-task-form"
          onSubmit={handleSaveTask}
          className="space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Task Title *
            </label>
            <input
              required
              value={taskForm.title}
              onChange={(e) =>
                setTaskForm({ ...taskForm, title: e.target.value })
              }
              placeholder="e.g., Implement secure token auth"
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Description
            </label>
            <textarea
              rows={3}
              value={taskForm.description}
              onChange={(e) =>
                setTaskForm({ ...taskForm, description: e.target.value })
              }
              placeholder="Task details and acceptance criteria..."
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                Priority
              </label>
              <select
                value={taskForm.priority}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, priority: e.target.value })
                }
                className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                Status
              </label>
              <select
                value={taskForm.status}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, status: e.target.value })
                }
                className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                Assignee
              </label>
              <select
                value={taskForm.assignedTo}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, assignedTo: e.target.value })
                }
                className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
              >
                <option value="">Unassigned</option>
                {team.teamLeader && (
                  <option value={String(team.teamLeader.id)}>
                    {team.teamLeader.name} (Leader)
                  </option>
                )}
                {(team.members || []).map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                Due Date
              </label>
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, dueDate: e.target.value })
                }
                className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Task Confirmation */}
      <ConfirmDialog
        open={Boolean(taskToDelete)}
        title="Delete Task"
        message={`Are you sure you want to permanently delete task "${taskToDelete?.title}"? This cannot be undone.`}
        confirmLabel="Delete Task"
        tone="danger"
        busy={deletingTask}
        onConfirm={handleDeleteTask}
        onClose={() => !deletingTask && setTaskToDelete(null)}
      />
    </div>
  );
}