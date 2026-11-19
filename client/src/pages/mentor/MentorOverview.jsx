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
import { calculateProjectProgress, formatDate, getErrorMessage, getInitials, resolveProjectStatus, timeAgo } from "../../utils/portalHelpers";
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
        api.get("/mentor/invitations").catch(() => ({ data: { invitations: [] } })),
      ]);
      setData(overviewRes.data?.data || overviewRes.data || null);
      setInvitations(invRes.data?.invitations || invRes.data?.data || []);
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
      const res = await api.patch(`/mentor/invitations/${invitationId}/${action}`);
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
  const upcomingDeadlines = data?.upcomingDeadlines || [];
  const recentStudents = data?.recentStudents || [];
  const activeTeams = data?.activeTeams || [];
  const pendingStudentTasks = data?.pendingStudentTasks || [];
  const recentActivities = data?.recentActivities || [];

  const kpis = [
    {
      label: "Total Students",
      value: stats.totalStudents ?? 0,
      to: "/mentor/students",
      icon: GraduationCap,
      accent: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Total Teams",
      value: stats.totalTeams ?? 0,
      to: "/mentor/teams",
      icon: Users,
      accent: "bg-lime-500/15 text-lime-800 dark:text-lime-300",
    },
    {
      label: "Active Projects",
      value: stats.activeProjects ?? 0,
      to: "/mentor/teams",
      icon: FolderKanban,
      accent: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
    },
    {
      label: "Pending Tasks",
      value: stats.pendingTasks ?? 0,
      to: "/mentor/tasks",
      icon: Clock3,
      accent: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    {
      label: "Completed Tasks",
      value: stats.completedTasks ?? 0,
      to: "/mentor/tasks",
      icon: CheckCircle2,
      accent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Upcoming Deadlines",
      value: upcomingDeadlines.length,
      to: "/mentor/tasks",
      icon: CalendarClock,
      accent: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
            Techno NJR · Faculty Mentor Workspace
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Mentor Overview
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Monitor your assigned students, project teams, deliverables, and task reviews.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Link to="/mentor/tasks?action=assign" className={portalPrimaryBtnClass}>
            <Plus size={15} /> Assign Task
          </Link>
          <Link to="/mentor/announcements" className={portalSecondaryBtnClass}>
            <Megaphone size={15} /> Post Notice
          </Link>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            className={portalSecondaryBtnClass}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> Refresh
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
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {kpis.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className="group rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-2xs transition hover:-translate-y-0.5 hover:border-[#15803D]/55 dark:hover:border-[#A3E635]/55"
                >
                  <div className="flex items-center justify-between">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${item.accent}`}>
                      <Icon size={18} />
                    </div>
                    <ArrowUpRight size={15} className="text-[var(--text-muted)] group-hover:text-[var(--accent-text)]" />
                  </div>
                  <p className="mt-3.5 text-2xl font-extrabold text-[var(--text-primary)]">{item.value}</p>
                  <p className="mt-0.5 text-xs font-bold text-[var(--text-secondary)]">{item.label}</p>
                </Link>
              );
            })}
          </section>

          {/* Pending Mentor Invitations */}
          {invitations.length > 0 && (
            <SectionCard
              title={`Pending Mentor Invitations (${invitations.length})`}
              subtitle="Students have requested you as their Faculty Mentor. Accept an invitation to officially mentor the team."
            >
              <div className="space-y-3">
                {invitations.map((inv) => {
                  const busy = processingInvId === inv.id;
                  return (
                    <div
                      key={inv.id}
                      className="flex flex-col justify-between gap-4 rounded-2xl border border-[#15803D]/30 bg-[var(--bg-surface-elevated)] p-4 sm:flex-row sm:items-center dark:border-[#A3E635]/25"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                            <Award size={12} /> Mentor Request
                          </span>
                          <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">
                            {inv.project?.title || "Student Project"}
                          </p>
                          {inv.project?.status && <StatusBadge status={inv.project.status} />}
                        </div>
                        {inv.project?.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                            {inv.project.description}
                          </p>
                        )}
                        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                          Invited by <strong className="text-[var(--text-primary)]">{inv.sender?.name || "Student"}</strong>
                          {inv.sender?.email ? ` (${inv.sender.email})` : ""} · {inv.project?.memberCount || 1} member(s) · {timeAgo(inv.createdAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRespondInvitation(inv.id, "accept")}
                          className={portalPrimaryBtnClass}
                        >
                          <Check size={14} /> {busy ? "Processing..." : "Accept & Mentor Team"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRespondInvitation(inv.id, "reject")}
                          className={portalSecondaryBtnClass}
                        >
                          <X size={14} /> Decline
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
              className="xl:col-span-2"
              action={
                <Link to="/mentor/teams" className="text-xs font-bold text-[var(--accent-text)] hover:underline">
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
                      className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 transition hover:border-[#15803D]/50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{t.title}</p>
                          <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                            <Crown size={12} className="text-amber-500" />
                            Lead: {t.teamLeader?.name || "—"} · {t.memberCount} member(s) · Due {formatDate(t.deadline)}
                          </p>
                        </div>
                        <StatusBadge status={resolveProjectStatus(t)} />
                      </div>
                      <div className="mt-3">
                        <ProgressBar value={calculateProjectProgress(t)} showLabel height="h-2" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Upcoming Deadlines" subtitle="Projects and tasks due soon">
              {upcomingDeadlines.length === 0 ? (
                <p className="rounded-2xl bg-[var(--bg-surface-subtle)] p-4 text-xs font-medium text-[var(--text-muted)]">
                  No upcoming deadlines scheduled.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {upcomingDeadlines.slice(0, 7).map((d) => (
                    <Link
                      key={`${d.type}-${d.id}`}
                      to={`/mentor/teams/${d.projectId}`}
                      className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 transition hover:border-[#15803D]/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-bold text-[var(--text-primary)]">{d.title}</p>
                        <StatusBadge status={d.type} />
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
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
              action={
                <Link to="/mentor/tasks" className="text-xs font-bold text-[var(--accent-text)] hover:underline">
                  Review All →
                </Link>
              }
            >
              {pendingStudentTasks.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="All caught up!" description="No pending student tasks right now." />
              ) : (
                <div className="space-y-2.5">
                  {pendingStudentTasks.slice(0, 6).map((task) => (
                    <Link
                      key={task.id}
                      to={`/mentor/teams/${task.projectId}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 transition hover:border-[#15803D]/45"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[var(--text-primary)]">{task.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                          {task.project?.title || "Team"} · {task.assignedTo?.name || "Unassigned"} · Due{" "}
                          {formatDate(task.dueDate)}
                        </p>
                      </div>
                      <StatusBadge status={task.status} />
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Recently Assigned Students"
              action={
                <Link to="/mentor/students" className="text-xs font-bold text-[var(--accent-text)] hover:underline">
                  My Students →
                </Link>
              }
            >
              {recentStudents.length === 0 ? (
                <EmptyState icon={GraduationCap} title="No assigned students yet" />
              ) : (
                <div className="space-y-2.5">
                  {recentStudents.slice(0, 6).map((s) => (
                    <Link
                      key={s.id}
                      to={`/mentor/students/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 transition hover:border-[#15803D]/45"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#141A17] text-[11px] font-bold text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]">
                          {getInitials(s.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-xs font-bold text-[var(--text-primary)]">{s.name}</p>
                            {(s.roll_no || s.rollNumber) && (
                              <span className="rounded-full bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--text-secondary)]">
                                Roll: {s.roll_no || s.rollNumber}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-[var(--text-muted)]">
                            {s.email} {(s.roll_no || s.rollNumber) ? `· ${s.roll_no || s.rollNumber}` : ""}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={s.is_active ? "Active" : "Inactive"} />
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Recent Team Activities */}
          <SectionCard title="Recent Team Activities" subtitle="Latest activity across your mentored teams">
            {recentActivities.length === 0 ? (
              <EmptyState icon={Activity} title="No team activity logged yet" />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {recentActivities.slice(0, 10).map((act) => (
                  <div key={act.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">{act.description}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {act.user?.name || "Member"} {act.projectTitle ? `· ${act.projectTitle}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{timeAgo(act.createdAt)}</span>
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
