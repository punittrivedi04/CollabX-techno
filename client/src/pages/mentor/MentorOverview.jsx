import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  Award,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Crown,
  FolderKanban,
  GraduationCap,
  Megaphone,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";

import api from "../../services/api";
import {
  calculateProjectProgress,
  formatDate,
  getErrorMessage,
  getInitials,
  resolveProjectStatus,
  timeAgo,
} from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  SectionCard,
  StatusBadge,
  SuccessAlert,
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

export default function MentorOverview() {
  const [data, setData] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [processingInvId, setProcessingInvId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async (bg = false) => {
    if (bg) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [overviewRes, invRes] = await Promise.all([
        api.get("/mentor/overview"),
        api
          .get("/mentor/invitations")
          .catch(() => ({ data: { invitations: [] } })),
      ]);
      setData(overviewRes.data?.data || overviewRes.data || null);
      setInvitations(
        Array.isArray(invRes.data?.invitations || invRes.data?.data)
          ? invRes.data?.invitations || invRes.data?.data
          : [],
      );
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load mentor overview."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRespondInvitation = async (invitationId, action) => {
    setProcessingInvId(invitationId);
    setError("");
    setSuccess("");
    try {
      const res = await api.patch(
        `/mentor/invitations/${invitationId}/${action}`,
      );
      setSuccess(
        res.data?.message ||
          (action === "accept"
            ? "Mentor invitation accepted! The team is now assigned to you."
            : "Mentor invitation declined."),
      );
      await load(true);
    } catch (err) {
      setError(getErrorMessage(err, `Failed to ${action} mentor invitation.`));
    } finally {
      setProcessingInvId(null);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats || data || {};
  const upcomingDeadlines = Array.isArray(data?.upcomingDeadlines)
    ? data.upcomingDeadlines
    : [];
  const recentStudents = Array.isArray(data?.recentStudents)
    ? data.recentStudents
    : [];
  const activeTeams = Array.isArray(data?.activeTeams) ? data.activeTeams : [];
  const pendingStudentTasks = Array.isArray(data?.pendingStudentTasks)
    ? data.pendingStudentTasks
    : [];
  const recentActivities = Array.isArray(data?.recentActivities)
    ? data.recentActivities
    : [];

  const kpis = [
    {
      label: "Total Students",
      value: stats.totalStudents ?? 0,
      to: "/mentor/students",
      icon: GraduationCap,
    },
    {
      label: "Total Teams",
      value: stats.totalTeams ?? 0,
      to: "/mentor/teams",
      icon: Users,
    },
    {
      label: "Active Projects",
      value: stats.activeProjects ?? 0,
      to: "/mentor/teams",
      icon: FolderKanban,
    },
    {
      label: "Pending Tasks",
      value: stats.pendingTasks ?? 0,
      to: "/mentor/tasks",
      icon: Clock3,
    },
    {
      label: "Completed Tasks",
      value: stats.completedTasks ?? 0,
      to: "/mentor/tasks",
      icon: CheckCircle2,
    },
    {
      label: "Upcoming Deadlines",
      value: upcomingDeadlines.length,
      to: "/mentor/tasks",
      icon: CalendarClock,
    },
  ];

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Techno NJR · Faculty Mentor Workspace
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            Mentor Overview
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-sm">
            Monitor your assigned students, project teams, deliverables, and task
            reviews.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <Link
            to="/mentor/tasks?action=assign"
            className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
          >
            <Plus size={15} strokeWidth={2} />
            <span>Assign Task</span>
          </Link>
          <Link
            to="/mentor/announcements"
            className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418] sm:w-auto`}
          >
            <Megaphone size={15} strokeWidth={1.85} />
            <span>Post Notice</span>
          </Link>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418] sm:w-auto`}
          >
            <RefreshCw
              size={15}
              strokeWidth={1.85}
              className={refreshing ? "animate-spin" : ""}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {loading ? (
        <LoadingState label="Loading mentor workspace..." />
      ) : (
        <>
          {/* 6 KPI Cards */}
          <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-6">
            {kpis.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className="group rounded-2xl border border-black/12 bg-white p-4 shadow-2xs transition hover:border-black/35 dark:border-white/12 dark:bg-[#08080A] dark:hover:border-white/35"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-neutral-50 text-neutral-900 dark:border-white/10 dark:bg-[#101014] dark:text-white">
                      <Icon size={17} strokeWidth={1.85} />
                    </div>
                    <ArrowUpRight
                      size={15}
                      strokeWidth={1.85}
                      className="text-neutral-400 transition group-hover:text-neutral-950 dark:text-neutral-500 dark:group-hover:text-white"
                    />
                  </div>
                  <p className="mt-3.5 text-2xl font-black tabular-nums text-neutral-950 dark:text-white">
                    {item.value}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-neutral-600 dark:text-neutral-400">
                    {item.label}
                  </p>
                </Link>
              );
            })}
          </section>

          {/* Pending Mentor Invitations */}
          {invitations.length > 0 && (
            <SectionCard
              title={`Pending Mentor Invitations (${invitations.length})`}
              subtitle="Students have requested you as their Faculty Mentor. Accept an invitation to officially mentor the team."
              className="dark:!border-white/12 dark:!bg-[#08080A]"
            >
              <div className="space-y-3">
                {invitations.map((inv) => {
                  const busy = processingInvId === inv.id;
                  return (
                    <div
                      key={inv.id}
                      className="flex flex-col justify-between gap-4 rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014] sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <NeutralBadge>
                            <Award size={11} strokeWidth={1.85} />
                            <span>Mentor Request</span>
                          </NeutralBadge>
                          <p className="truncate text-sm font-extrabold text-neutral-950 dark:text-white">
                            {inv.project?.title || "Student Project"}
                          </p>
                          {inv.project?.status && (
                            <NeutralBadge>{inv.project.status}</NeutralBadge>
                          )}
                        </div>
                        {inv.project?.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">
                            {inv.project.description}
                          </p>
                        )}
                        <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                          Invited by{" "}
                          <strong className="text-neutral-900 dark:text-neutral-200">
                            {inv.sender?.name || "Student"}
                          </strong>
                          {inv.sender?.email ? ` (${inv.sender.email})` : ""} ·{" "}
                          {inv.project?.memberCount || 1} member(s) ·{" "}
                          {timeAgo(inv.createdAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRespondInvitation(inv.id, "accept")}
                          className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
                        >
                          <Check size={14} strokeWidth={2} />
                          <span>
                            {busy ? "Processing..." : "Accept & Mentor Team"}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRespondInvitation(inv.id, "reject")}
                          className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white sm:w-auto`}
                        >
                          <X size={14} strokeWidth={1.85} />
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Active Teams + Upcoming Deadlines */}
          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard
              title="Active Teams & Projects"
              subtitle="Click any team to manage Team Leader, tasks, resources, or official chat"
              className="xl:col-span-2 dark:!border-white/12 dark:!bg-[#08080A]"
              action={
                <Link
                  to="/mentor/teams"
                  className="text-xs font-bold text-neutral-900 hover:underline dark:text-white"
                >
                  All Teams →
                </Link>
              }
            >
              {activeTeams.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="No teams assigned yet"
                  description="Teams assigned to you by an administrator will appear here."
                />
              ) : (
                <div className="space-y-3">
                  {activeTeams.slice(0, 6).map((t) => (
                    <Link
                      key={t.id}
                      to={`/mentor/teams/${t.id}`}
                      className="block rounded-xl border border-black/10 bg-neutral-50 p-4 transition hover:border-black/35 hover:bg-white dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35 dark:hover:bg-[#14141A]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-neutral-950 dark:text-white">
                            {t.title}
                          </p>
                          <p className="mt-0.5 inline-flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                            <Crown size={12} strokeWidth={1.85} />
                            <span>
                              Lead: {t.teamLeader?.name || "—"} ·{" "}
                              {t.memberCount ?? 0} member(s) · Due{" "}
                              {formatDate(t.deadline)}
                            </span>
                          </p>
                        </div>
                        <NeutralBadge>{resolveProjectStatus(t)}</NeutralBadge>
                      </div>
                      <div className="mt-3">
                        <ProgressBar
                          value={calculateProjectProgress(t)}
                          showLabel
                          height="h-1.5"
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Upcoming Deadlines"
              subtitle="Projects and tasks due soon"
              className="dark:!border-white/12 dark:!bg-[#08080A]"
            >
              {upcomingDeadlines.length === 0 ? (
                <p className="rounded-xl border border-black/10 bg-neutral-50 p-4 text-xs font-medium text-neutral-500 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-400">
                  No upcoming deadlines scheduled.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {upcomingDeadlines.slice(0, 7).map((d) => (
                    <Link
                      key={`${d.type}-${d.id}`}
                      to={`/mentor/teams/${d.projectId}`}
                      className="block rounded-xl border border-black/10 bg-neutral-50 p-3 transition hover:border-black/35 hover:bg-white dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35 dark:hover:bg-[#14141A]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                          {d.title}
                        </p>
                        <NeutralBadge>{d.type}</NeutralBadge>
                      </div>
                      <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                        {d.projectTitle ? `${d.projectTitle} · ` : ""}
                        Due {formatDate(d.deadline)}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Pending Student Tasks + Recently Assigned Students */}
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              title="Pending Student Tasks"
              subtitle="Tasks awaiting progress or mentor review"
              className="dark:!border-white/12 dark:!bg-[#08080A]"
              action={
                <Link
                  to="/mentor/tasks"
                  className="text-xs font-bold text-neutral-900 hover:underline dark:text-white"
                >
                  Review All →
                </Link>
              }
            >
              {pendingStudentTasks.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="All caught up!"
                  description="No pending student tasks right now."
                />
              ) : (
                <div className="space-y-2.5">
                  {pendingStudentTasks.slice(0, 6).map((task) => (
                    <Link
                      key={task.id}
                      to={`/mentor/teams/${task.projectId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-3 transition hover:border-black/35 hover:bg-white dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35 dark:hover:bg-[#14141A]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                          {task.title}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                          {task.project?.title || "Team"} ·{" "}
                          {task.assignedTo?.name || "Unassigned"} · Due{" "}
                          {formatDate(task.dueDate)}
                        </p>
                      </div>
                      <NeutralBadge>{task.status}</NeutralBadge>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Recently Assigned Students"
              className="dark:!border-white/12 dark:!bg-[#08080A]"
              action={
                <Link
                  to="/mentor/students"
                  className="text-xs font-bold text-neutral-900 hover:underline dark:text-white"
                >
                  My Students →
                </Link>
              }
            >
              {recentStudents.length === 0 ? (
                <EmptyState
                  icon={GraduationCap}
                  title="No assigned students yet"
                />
              ) : (
                <div className="space-y-2.5">
                  {recentStudents.slice(0, 6).map((s) => (
                    <Link
                      key={s.id}
                      to={`/mentor/students/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-3 transition hover:border-black/35 hover:bg-white dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35 dark:hover:bg-[#14141A]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-white text-[11px] font-bold text-neutral-950 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                          {getInitials(s.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                              {s.name}
                            </p>
                            {(s.roll_no || s.rollNumber) && (
                              <NeutralBadge>
                                <span className="font-mono">
                                  Roll: {s.roll_no || s.rollNumber}
                                </span>
                              </NeutralBadge>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                            {s.email}{" "}
                            {s.roll_no || s.rollNumber
                              ? `· ${s.roll_no || s.rollNumber}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <NeutralBadge>
                        {s.is_active ? "Active" : "Inactive"}
                      </NeutralBadge>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Recent Team Activities */}
          <SectionCard
            title="Recent Team Activities"
            subtitle="Latest activity across your mentored teams"
            className="dark:!border-white/12 dark:!bg-[#08080A]"
          >
            {recentActivities.length === 0 ? (
              <EmptyState icon={Activity} title="No team activity logged yet" />
            ) : (
              <div className="divide-y divide-black/10 dark:divide-white/10">
                {recentActivities.slice(0, 10).map((act) => (
                  <div
                    key={act.id}
                    className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-neutral-950 dark:text-white">
                        {act.description}
                      </p>
                      <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                        {act.user?.name || "Member"}{" "}
                        {act.projectTitle ? `· ${act.projectTitle}` : ""}
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
        </>
      )}
    </div>
  );
}