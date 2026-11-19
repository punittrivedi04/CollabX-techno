import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Award,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  ExternalLink,
  FolderKanban,
  Globe,
  Lock,
  MessageSquare,
  Plus,
  Presentation,
  RotateCcw,
  Users,
} from "lucide-react";

import api from "../../services/api";
import {
  calculateProjectProgress,
  formatDate,
  getErrorMessage,
  getInitials,
  getTodayInputDate,
  isValidHttpUrl,
  resolveProjectStatus,
  timeAgo,
} from "../../utils/portalHelpers";
import EmbeddedProjectChat from "../../components/portal/EmbeddedProjectChat";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  ProgressBar,
  SectionCard,
  StatusBadge,
  SuccessAlert,
  portalInputClass,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

export default function MentorTeamDetail() {
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
            window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - headerOffset), behavior: "smooth" });
          } else if (isClippedBelow) {
            const desiredDelta = Math.min(rect.bottom - window.innerHeight + 24, rect.top - headerOffset);
            if (desiredDelta > 0) {
              window.scrollBy({ top: desiredDelta, behavior: "smooth" });
            }
          }
        });
      }
      return next;
    });
  };

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Assign Task modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    assignedTo: "",
    priority: "Medium",
    dueDate: "",
  });

  // Project-Level Mentor Review state
  const [projectReviewText, setProjectReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/mentor/teams/${projectId}`);
      const payload = res.data?.data || res.data;
      setData(payload);
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

  const handleAssignTask = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/mentor/tasks", {
        projectId: Number(projectId),
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        assignedTo: taskForm.assignedTo ? Number(taskForm.assignedTo) : null,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate || null,
      });
      setSuccess("Task assigned to team successfully.");
      setShowTaskModal(false);
      setTaskForm({ title: "", description: "", assignedTo: "", priority: "Medium", dueDate: "" });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to assign task."));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (data?.team?.mentorReview) {
      setProjectReviewText(data.team.mentorReview);
    }
  }, [data?.team?.mentorReview]);

  const handleSubmitProjectReview = async (e) => {
    e.preventDefault();
    if (submittingReview) return;
    const reviewBody = projectReviewText.trim();
    if (!reviewBody || reviewBody.length < 5) {
      setError("Please provide a substantive review (minimum 5 characters).");
      return;
    }

    setSubmittingReview(true);
    setError("");
    setSuccess("");
    try {
      await api.post(`/mentor/teams/${projectId}/review`, {
        review: reviewBody,
      });
      setSuccess("Faculty Mentor project review submitted successfully.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to submit mentor project review."));
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) return <LoadingState label="Loading team details..." />;

  if (!data?.team) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={error || "Team not found or access denied."} />
        <Link to="/mentor/teams" className={portalSecondaryBtnClass}>
          <ArrowLeft size={15} /> Back to My Teams
        </Link>
      </div>
    );
  }

  const { team, teamLeader, members = [], resources = {}, tasks = [], recentActivities = [] } = data;
  const allTeamStudents = [
    ...(teamLeader ? [{ ...teamLeader, isLeader: true }] : []),
    ...members.map((m) => ({ ...m, isLeader: false })),
  ];

  // Strict Dual & Triple Gatekeeper for Mentor Review
  const allTasksCompleted =
    tasks.length > 0 && tasks.every((t) => t.status === "Completed");
  const isProjectCompleted =
    String(team.status || "").trim().toLowerCase() === "completed";
  const hasValidPpt = isValidHttpUrl(resources.githubUrl && resources.pptUrl ? resources.pptUrl : (team.pptUrl || resources.pptUrl));
  const hasValidDemo = isValidHttpUrl(resources.demoUrl || team.demoUrl);
  const isFullyUploaded = hasValidPpt && hasValidDemo;
  const isReviewUnlocked = allTasksCompleted && isProjectCompleted && isFullyUploaded;

  const resourceLinks = [
    { label: "GitHub Repository", url: resources.githubUrl, icon: FolderKanban },
    { label: "Live Demo / Drive Link", url: resources.demoUrl, icon: Globe },
    { label: "Presentation / PPT", url: resources.pptUrl, icon: Presentation },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/mentor/teams" className={portalSecondaryBtnClass}>
          <ArrowLeft size={15} /> Back to My Teams
        </Link>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowTaskModal(true)} className={portalPrimaryBtnClass}>
            <Plus size={14} /> Assign Task
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {/* Team Hero */}
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xs">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">{team.title}</h1>
              <StatusBadge status={resolveProjectStatus(team)} />
              <StatusBadge status={team.priority} />
            </div>
            {team.description && (
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
                {team.description}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-4 py-3 text-xs">
            <p className="font-bold uppercase tracking-wider text-[var(--text-muted)]">Project Deadline</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--text-primary)]">
              <CalendarClock size={14} /> {formatDate(team.deadline)}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-1.5 text-xs font-bold text-[var(--text-secondary)]">
            Overall Progress · {team.taskProgress?.completed || 0}/{team.taskProgress?.total || 0} Tasks Completed
          </p>
          <ProgressBar value={calculateProjectProgress(team)} showLabel height="h-2.5" />
        </div>

        {/* Optional Official Team Chat Toggle */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={handleToggleChat}
            aria-expanded={showChat}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-2xs transition-all duration-200 cursor-pointer ${
              showChat
                ? "border border-[#15803D]/30 bg-[#BEF264] text-[#141A18] hover:brightness-95 dark:border-[#A3E635] dark:bg-[#A3E635] dark:text-[#090D0B]"
                : "border border-[#141A17] bg-[#141A17] text-[#BEF264] hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-[#A3E635] dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B]"
            }`}
          >
            <MessageSquare size={14} className="shrink-0" />
            <span>{showChat ? "Hide Official Team Chat" : "Official Team Chat"}</span>
            {showChat ? (
              <ChevronUp size={14} className="shrink-0" />
            ) : (
              <ChevronDown size={14} className="shrink-0" />
            )}
          </button>
        </div>
      </div>

      {showChat && (
        <div ref={chatSectionRef} className="scroll-mt-24">
          <EmbeddedProjectChat projectId={team.id} projectTitle={team.title} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
            {/* Members + Active Team Leader */}
            <SectionCard
              title={`Team Members (${team.memberCount})`}
              subtitle="Active Team Leader badge and squad roster"
            >
              <div className="space-y-2.5">
                {allTeamStudents.length === 0 ? (
                  <EmptyState icon={Users} title="No students in this team yet" />
                ) : (
                  allTeamStudents.map((m) => (
                    <Link
                      key={m.id}
                      to={`/mentor/students/${m.id}`}
                      className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition ${
                        m.isLeader
                          ? "border-amber-500/40 bg-amber-500/8 hover:border-amber-500/70"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-[#15803D]/50"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                            m.isLeader
                              ? "bg-amber-500 text-[#090D0B]"
                              : "bg-[#141A17] text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]"
                          }`}
                        >
                          {getInitials(m.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-xs font-extrabold text-[var(--text-primary)]">{m.name}</p>
                            {(m.roll_no || m.rollNumber) && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-bold ${
                                  m.isLeader
                                    ? "bg-amber-500/20 text-amber-800 dark:text-amber-200"
                                    : "bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]"
                                }`}
                              >
                                Roll: {m.roll_no || m.rollNumber}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-[var(--text-muted)]">
                            {m.email} {(m.roll_no || m.rollNumber) ? `· ${m.roll_no || m.rollNumber}` : ""}
                          </p>
                        </div>
                      </div>
                      {m.isLeader ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                          <Crown size={12} /> Team Leader
                        </span>
                      ) : (
                        <span className="rounded-full bg-[var(--bg-surface-subtle)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                          Member
                        </span>
                      )}
                    </Link>
                  ))
                )}
              </div>
            </SectionCard>

            {/* Drive Resources */}
            <SectionCard title="Drive Resources & Deliverables" subtitle="Submitted links and repositories">
              <div className="space-y-3">
                {resourceLinks.map((res) => {
                  const Icon = res.icon;
                  const valid = isValidHttpUrl(res.url);
                  return (
                    <div
                      key={res.label}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent-text)]">
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)]">{res.label}</p>
                          <p className="truncate text-[11px] text-[var(--text-muted)]">
                            {valid ? res.url : "Not submitted yet"}
                          </p>
                        </div>
                      </div>
                      {valid && (
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent-text)] transition hover:border-[#15803D]"
                        >
                          Open <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          {/* Tasks List (Completion Tracking Only - No Task-Level Review) */}
          <SectionCard
            title={`Team Tasks (${tasks.length})`}
            subtitle="Track student task progress and milestone completion"
            action={
              <button type="button" onClick={() => setShowTaskModal(true)} className={portalPrimaryBtnClass}>
                <Plus size={14} /> Assign Task
              </button>
            }
          >
            {tasks.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No tasks assigned yet"
                description="Assign tasks to your students to track milestones."
              />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col justify-between gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-extrabold text-[var(--text-primary)]">{t.title}</p>
                        <StatusBadge status={t.status} />
                        <StatusBadge status={t.priority} />
                      </div>
                      {t.description && (
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{t.description}</p>
                      )}
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        Assigned to: {t.assignedTo?.name || "Unassigned"} · Due {formatDate(t.dueDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Dedicated Project-Level Mentor Review Section */}
          <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#E4ECE6] pb-4 dark:border-[#1F2C26]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#15803D] dark:text-[#A3E635]">
                  <Award size={20} />
                </div>
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
                    Faculty Mentor Review
                  </span>
                  <h2 className="text-lg font-bold text-[#141A18] dark:text-slate-100">
                    Official Project Review &amp; Evaluation
                  </h2>
                </div>
              </div>

              {isReviewUnlocked ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-500/10 px-3.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 size={13} /> Review Unlocked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-500/10 px-3.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400">
                  <Lock size={13} /> Review Locked
                </span>
              )}
            </div>

            {/* Existing Published Review Card */}
            {team.mentorReview && (
              <div className="mb-5 rounded-2xl border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4ECE6] dark:border-[#1F2C26] pb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#15803D]/10 px-2.5 py-0.5 font-bold text-[#15803D] dark:text-[#A3E635]">
                      <CheckCircle2 size={12} /> Published Review
                    </span>
                    <span className="font-medium text-[#5C6B66] dark:text-[#94A89D]">
                      {team.reviewedAt ? `Evaluated on ${formatDate(team.reviewedAt)}` : "Evaluation published"}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                    Private to Squad, Mentor, &amp; Leadership
                  </span>
                </div>
                <p className="mt-3.5 whitespace-pre-wrap text-sm leading-relaxed text-[#141A18] dark:text-slate-200 font-medium">
                  {team.mentorReview}
                </p>
              </div>
            )}

            {/* Lock Notice or Review Submission Form */}
            {!isReviewUnlocked ? (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                    <Lock size={16} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                      Mentor Project Review Locked
                    </p>
                    <p className="mt-0.5 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                      The final project evaluation cannot be submitted until all three conditions are satisfied:
                    </p>
                    <ul className="mt-3 space-y-2 text-xs font-semibold">
                      <li className={`flex items-center gap-2 ${allTasksCompleted ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300"}`}>
                        {allTasksCompleted ? (
                          <CheckCircle2 size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <AlertCircle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                        )}
                        <span>
                          1. All project tasks must be 100% completed ({tasks.filter((t) => t.status === "Completed").length}/{tasks.length} tasks completed — minimum 1 task required)
                        </span>
                      </li>
                      <li className={`flex items-center gap-2 ${isProjectCompleted ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300"}`}>
                        {isProjectCompleted ? (
                          <CheckCircle2 size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <AlertCircle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                        )}
                        <span>
                          2. Project status must be explicitly set and saved as &ldquo;Completed&rdquo; (Current: {team.status || "Planning"})
                        </span>
                      </li>
                      <li className={`flex items-center gap-2 ${isFullyUploaded ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300"}`}>
                        {isFullyUploaded ? (
                          <CheckCircle2 size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <AlertCircle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                        )}
                        <span>
                          3. Project must be fully uploaded (Both Presentation PPT and Live Demo links present and valid)
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitProjectReview} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                    {team.mentorReview ? "Update Mentor Project Review" : "Write Mentor Project Review"}
                  </label>
                  <textarea
                    rows={4}
                    required
                    minLength={5}
                    maxLength={5000}
                    value={projectReviewText}
                    onChange={(e) => setProjectReviewText(e.target.value)}
                    placeholder="Write your comprehensive evaluation of this completed project, including deliverable quality, execution, feedback, and final assessment..."
                    className="w-full resize-y rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3.5 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
                  />
                  <p className="mt-1 text-[11px] text-[#5C6B66] dark:text-[#94A89D]">
                    This evaluation will be visible exclusively to this project&apos;s student squad, assigned faculty mentor, Admin, and Director.
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingReview || projectReviewText.trim().length < 5}
                    className="inline-flex items-center gap-2 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-6 py-2.5 text-xs font-bold shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submittingReview ? (
                      <RotateCcw className="animate-spin" size={14} />
                    ) : (
                      <Award size={14} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
                    )}
                    {team.mentorReview ? "Update Project Review" : "Submit Final Project Review"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <SectionCard title="Recent Team Activities">
            {recentActivities.length === 0 ? (
              <EmptyState icon={Activity} title="No activities logged yet" />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {recentActivities.map((act) => (
                  <div key={act.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">{act.description}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{act.action}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{timeAgo(act.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

      {/* Assign Task Modal */}
      <Modal
        open={showTaskModal}
        onClose={() => !saving && setShowTaskModal(false)}
        title="Assign Task to Team"
        description={`Create and assign a new deliverable inside "${team.title}".`}
      >
        <form onSubmit={handleAssignTask} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Task Title *
            </label>
            <input
              required
              maxLength={150}
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              placeholder="e.g., Finalize Database Schema & ER Diagram"
              className={portalInputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Description
            </label>
            <textarea
              rows={3}
              maxLength={2000}
              value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              placeholder="Outline requirements and acceptance criteria..."
              className={portalInputClass}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Assign Student
              </label>
              <select
                value={taskForm.assignedTo}
                onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                className={portalInputClass}
              >
                <option value="">Unassigned (Any Member)</option>
                {allTeamStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isLeader ? "(Leader)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Priority
              </label>
              <select
                value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                className={portalInputClass}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Due Date
            </label>
            <input
              type="date"
              min={getTodayInputDate()}
              value={taskForm.dueDate}
              onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
              className={portalInputClass}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowTaskModal(false)} className={portalSecondaryBtnClass}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={portalPrimaryBtnClass}>
              {saving ? "Assigning..." : "Assign Task"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
