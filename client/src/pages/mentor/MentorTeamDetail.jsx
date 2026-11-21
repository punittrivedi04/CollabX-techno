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
  SuccessAlert,
  portalInputClass,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

function NeutralBadge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200 ${className}`}
    >
      {children}
    </span>
  );
}

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
      setTaskForm({
        title: "",
        description: "",
        assignedTo: "",
        priority: "Medium",
        dueDate: "",
      });
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
      <div className="space-y-4 text-neutral-950 dark:text-white">
        <ErrorAlert message={error || "Team not found or access denied."} />
        <Link
          to="/mentor/teams"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to My Teams</span>
        </Link>
      </div>
    );
  }

  const {
    team,
    teamLeader,
    members = [],
    resources = {},
    tasks = [],
    recentActivities = [],
  } = data;

  const allTeamStudents = [
    ...(teamLeader ? [{ ...teamLeader, isLeader: true }] : []),
    ...(Array.isArray(members) ? members : []).map((m) => ({
      ...m,
      isLeader: false,
    })),
  ];

  // Strict Gatekeeper for Mentor Review
  const allTasksCompleted =
    Array.isArray(tasks) &&
    tasks.length > 0 &&
    tasks.every((t) => t.status === "Completed");
  const isProjectCompleted =
    String(team.status || "").trim().toLowerCase() === "completed";
  const hasValidPpt = isValidHttpUrl(team.pptUrl || resources.pptUrl);
  const hasValidDemo = isValidHttpUrl(resources.demoUrl || team.demoUrl);
  const isFullyUploaded = hasValidPpt && hasValidDemo;
  const isReviewUnlocked =
    allTasksCompleted && isProjectCompleted && isFullyUploaded;

  const resourceLinks = [
    {
      label: "GitHub Repository",
      url: resources.githubUrl,
      icon: FolderKanban,
    },
    { label: "Live Demo / Drive Link", url: resources.demoUrl, icon: Globe },
    { label: "Presentation / PPT", url: resources.pptUrl, icon: Presentation },
  ];

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/mentor/teams"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to My Teams</span>
        </Link>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowTaskModal(true)}
            className={`${portalPrimaryBtnClass} cursor-pointer rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
          >
            <Plus size={14} strokeWidth={2} />
            <span>Assign Task</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {/* Team Hero */}
      <div className="rounded-2xl border border-black/12 bg-white p-5 shadow-2xs dark:border-white/12 dark:bg-[#08080A] sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white">
                {team.title}
              </h1>
              <NeutralBadge>{resolveProjectStatus(team)}</NeutralBadge>
              {team.priority && <NeutralBadge>{team.priority}</NeutralBadge>}
            </div>
            {team.description && (
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-sm">
                {team.description}
              </p>
            )}
          </div>

          <div className="shrink-0 rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 text-xs dark:border-white/10 dark:bg-[#101014]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Project Deadline
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-extrabold tabular-nums text-neutral-950 dark:text-white">
              <CalendarClock size={14} strokeWidth={1.85} />
              <span>{formatDate(team.deadline)}</span>
            </p>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-1.5 tabular-nums text-xs font-bold text-neutral-700 dark:text-neutral-300">
            Overall Progress · {team.taskProgress?.completed || 0}/
            {team.taskProgress?.total || 0} Tasks Completed
          </p>
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
            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold shadow-2xs transition ${
              showChat
                ? "border-black/25 bg-neutral-950 text-white dark:border-white/25 dark:bg-white dark:text-black"
                : "border-black/15 bg-neutral-50 text-neutral-950 hover:border-black/35 hover:bg-white dark:border-white/15 dark:bg-[#101014] dark:text-white dark:hover:border-white/35 dark:hover:bg-[#14141A]"
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
          <EmbeddedProjectChat
            projectId={team.id}
            projectTitle={team.title}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Members + Active Team Leader */}
        <SectionCard
          title={`Team Members (${team.memberCount ?? allTeamStudents.length})`}
          subtitle="Active Team Leader badge and squad roster"
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          <div className="space-y-2.5">
            {allTeamStudents.length === 0 ? (
              <EmptyState icon={Users} title="No students in this team yet" />
            ) : (
              allTeamStudents.map((m) => (
                <Link
                  key={m.id}
                  to={`/mentor/students/${m.id}`}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 transition ${
                    m.isLeader
                      ? "border-black/20 bg-neutral-100/80 hover:border-black/40 dark:border-white/20 dark:bg-[#14141A] dark:hover:border-white/40"
                      : "border-black/10 bg-neutral-50 hover:border-black/35 hover:bg-white dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35 dark:hover:bg-[#14141A]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-extrabold ${
                        m.isLeader
                          ? "border-black/20 bg-neutral-950 text-white dark:border-white/20 dark:bg-white dark:text-black"
                          : "border-black/12 bg-white text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white"
                      }`}
                    >
                      {getInitials(m.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-xs font-extrabold text-neutral-950 dark:text-white">
                          {m.name}
                        </p>
                        {(m.roll_no || m.rollNumber) && (
                          <NeutralBadge>
                            <span className="font-mono">
                              Roll: {m.roll_no || m.rollNumber}
                            </span>
                          </NeutralBadge>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                        {m.email}{" "}
                        {m.roll_no || m.rollNumber
                          ? `· ${m.roll_no || m.rollNumber}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  {m.isLeader ? (
                    <NeutralBadge className="border-black/20 bg-white dark:border-white/20 dark:bg-[#08080A]">
                      <Crown size={11} strokeWidth={1.9} />
                      <span>Team Leader</span>
                    </NeutralBadge>
                  ) : (
                    <NeutralBadge>Member</NeutralBadge>
                  )}
                </Link>
              ))
            )}
          </div>
        </SectionCard>

        {/* Drive Resources */}
        <SectionCard
          title="Drive Resources & Deliverables"
          subtitle="Submitted links and repositories"
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

      {/* Tasks List */}
      <SectionCard
        title={`Team Tasks (${tasks.length})`}
        subtitle="Track student task progress and milestone completion"
        className="dark:!border-white/12 dark:!bg-[#08080A]"
        action={
          <button
            type="button"
            onClick={() => setShowTaskModal(true)}
            className={`${portalPrimaryBtnClass} cursor-pointer rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
          >
            <Plus size={14} strokeWidth={2} />
            <span>Assign Task</span>
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
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="flex flex-col justify-between gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-extrabold text-neutral-950 dark:text-white">
                      {t.title}
                    </p>
                    {t.status && <NeutralBadge>{t.status}</NeutralBadge>}
                    {t.priority && <NeutralBadge>{t.priority}</NeutralBadge>}
                  </div>
                  {t.description && (
                    <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                      {t.description}
                    </p>
                  )}
                  <p className="mt-1 tabular-nums text-[11px] text-neutral-500 dark:text-neutral-400">
                    Assigned to: {t.assignedTo?.name || "Unassigned"} · Due{" "}
                    {formatDate(t.dueDate)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Dedicated Project-Level Mentor Review Section */}
      <div className="rounded-2xl border border-black/12 bg-white p-5 shadow-2xs dark:border-white/12 dark:bg-[#08080A] sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-neutral-50 text-neutral-900 dark:border-white/12 dark:bg-[#101014] dark:text-white">
              <Award size={20} strokeWidth={1.85} />
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Faculty Mentor Review
              </span>
              <h2 className="text-lg font-extrabold text-neutral-950 dark:text-white">
                Official Project Review &amp; Evaluation
              </h2>
            </div>
          </div>

          {isReviewUnlocked ? (
            <NeutralBadge>
              <CheckCircle2 size={12} strokeWidth={1.85} />
              <span>Review Unlocked</span>
            </NeutralBadge>
          ) : (
            <NeutralBadge>
              <Lock size={12} strokeWidth={1.85} />
              <span>Review Locked</span>
            </NeutralBadge>
          )}
        </div>

        {/* Existing Published Review Card */}
        {team.mentorReview && (
          <div className="mb-5 rounded-xl border border-black/10 bg-neutral-50 p-5 shadow-2xs dark:border-white/10 dark:bg-[#101014]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 pb-3 text-xs dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <NeutralBadge>
                  <CheckCircle2 size={11} strokeWidth={1.85} />
                  <span>Published Review</span>
                </NeutralBadge>
                <span className="font-medium text-neutral-500 dark:text-neutral-400">
                  {team.reviewedAt
                    ? `Evaluated on ${formatDate(team.reviewedAt)}`
                    : "Evaluation published"}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                Private to Squad, Mentor, &amp; Leadership
              </span>
            </div>
            <p className="mt-3.5 whitespace-pre-wrap text-sm font-medium leading-relaxed text-neutral-900 dark:text-neutral-100">
              {team.mentorReview}
            </p>
          </div>
        )}

        {/* Lock Notice or Review Submission Form */}
        {!isReviewUnlocked ? (
          <div className="rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014]">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-white text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                <Lock size={16} strokeWidth={1.85} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                  Mentor Project Review Locked
                </p>
                <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                  The final project evaluation cannot be submitted until all
                  three conditions are satisfied:
                </p>
                <ul className="mt-3 space-y-2 text-xs font-semibold tabular-nums text-neutral-800 dark:text-neutral-200">
                  <li className="flex items-start gap-2">
                    {allTasksCompleted ? (
                      <CheckCircle2
                        size={15}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0 text-neutral-950 dark:text-white"
                      />
                    ) : (
                      <AlertCircle
                        size={15}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400"
                      />
                    )}
                    <span>
                      1. All project tasks must be 100% completed (
                      {tasks.filter((t) => t.status === "Completed").length}/
                      {tasks.length} tasks completed — minimum 1 task required)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    {isProjectCompleted ? (
                      <CheckCircle2
                        size={15}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0 text-neutral-950 dark:text-white"
                      />
                    ) : (
                      <AlertCircle
                        size={15}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400"
                      />
                    )}
                    <span>
                      2. Project status must be explicitly set and saved as
                      &ldquo;Completed&rdquo; (Current:{" "}
                      {team.status || "Planning"})
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    {isFullyUploaded ? (
                      <CheckCircle2
                        size={15}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0 text-neutral-950 dark:text-white"
                      />
                    ) : (
                      <AlertCircle
                        size={15}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400"
                      />
                    )}
                    <span>
                      3. Project must be fully uploaded (Both Presentation PPT
                      and Live Demo links present and valid)
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitProjectReview} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                {team.mentorReview
                  ? "Update Mentor Project Review"
                  : "Write Mentor Project Review"}
              </label>
              <textarea
                rows={4}
                required
                minLength={5}
                maxLength={5000}
                value={projectReviewText}
                onChange={(e) => setProjectReviewText(e.target.value)}
                placeholder="Write your comprehensive evaluation of this completed project, including deliverable quality, execution, feedback, and final assessment..."
                className="w-full resize-y rounded-xl border border-black/12 bg-neutral-50 px-4 py-3.5 text-sm font-medium text-neutral-950 outline-none transition focus:border-black/35 focus:bg-white dark:border-white/12 dark:bg-[#101014] dark:text-white dark:focus:border-white/35"
              />
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                This evaluation will be visible exclusively to this
                project&apos;s student squad, assigned faculty mentor, Admin, and
                Director.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={
                  submittingReview || projectReviewText.trim().length < 5
                }
                className={`${portalPrimaryBtnClass} cursor-pointer rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {submittingReview ? (
                  <RotateCcw className="animate-spin" size={14} strokeWidth={1.85} />
                ) : (
                  <Award size={14} strokeWidth={1.85} />
                )}
                <span>
                  {team.mentorReview
                    ? "Update Project Review"
                    : "Submit Final Project Review"}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>

      <SectionCard
        title="Recent Team Activities"
        className="dark:!border-white/12 dark:!bg-[#08080A]"
      >
        {recentActivities.length === 0 ? (
          <EmptyState icon={Activity} title="No activities logged yet" />
        ) : (
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {recentActivities.map((act) => (
              <div
                key={act.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-neutral-950 dark:text-white">
                    {act.description}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {act.action}
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

      {/* Assign Task Modal */}
      <Modal
        open={showTaskModal}
        onClose={() => !saving && setShowTaskModal(false)}
        title="Assign Task to Team"
        description={`Create and assign a new deliverable inside "${team.title}".`}
      >
        <form onSubmit={handleAssignTask} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Task Title *
            </label>
            <input
              required
              maxLength={150}
              value={taskForm.title}
              onChange={(e) =>
                setTaskForm({ ...taskForm, title: e.target.value })
              }
              placeholder="e.g., Finalize Database Schema & ER Diagram"
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white dark:placeholder:!text-neutral-500`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Description
            </label>
            <textarea
              rows={3}
              maxLength={2000}
              value={taskForm.description}
              onChange={(e) =>
                setTaskForm({ ...taskForm, description: e.target.value })
              }
              placeholder="Outline requirements and acceptance criteria..."
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white dark:placeholder:!text-neutral-500`}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                Assign Student
              </label>
              <select
                value={taskForm.assignedTo}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, assignedTo: e.target.value })
                }
                className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
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
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
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
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Due Date
            </label>
            <input
              type="date"
              min={getTodayInputDate()}
              value={taskForm.dueDate}
              onChange={(e) =>
                setTaskForm({ ...taskForm, dueDate: e.target.value })
              }
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowTaskModal(false)}
              className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white sm:w-auto`}
            >
              <span>Cancel</span>
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
            >
              <span>{saving ? "Assigning..." : "Assign Task"}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}