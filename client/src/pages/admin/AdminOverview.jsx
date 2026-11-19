import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Award,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FolderKanban,
  GraduationCap,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  Users,
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
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

const getMentorPerformanceTheme = (completed, total) => {
  if (total === 0) {
    return {
      percentage: 0,
      label: "0% Completed",
      barColor: "bg-slate-400 dark:bg-zinc-600",
      textColor: "text-[var(--text-muted)]",
      badgeColor: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    };
  }
  const percentage = Math.round((completed / total) * 100);
  if (percentage >= 70) {
    // High performance: Green
    return {
      percentage,
      label: `${percentage}% Completed`,
      barColor: "bg-emerald-500 dark:bg-emerald-400",
      textColor: "text-emerald-700 dark:text-emerald-300",
      badgeColor: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (percentage >= 30) {
    // Moderate performance: Yellow / Orange / Amber
    return {
      percentage,
      label: `${percentage}% Completed`,
      barColor: "bg-amber-500 dark:bg-amber-400",
      textColor: "text-amber-700 dark:text-amber-300",
      badgeColor: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    };
  }
  // Low / Zero performance (< 30%): Gray / Slate
  return {
    percentage,
    label: `${percentage}% Completed`,
    barColor: "bg-slate-400 dark:bg-zinc-500",
    textColor: "text-slate-600 dark:text-zinc-400",
    badgeColor: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
  };
};

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (bg = false) => {
    if (bg) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const res = await api.get("/admin/overview");
      setData(res.data?.data || res.data || null);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load admin overview."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats || data || {};
  const unclassified = Number(stats.unclassifiedAccounts || 0);
  const mentorWorkload = data?.mentorWorkload || [];
  const nearingDeadlines = data?.nearingDeadlines || [];
  const overdueProjects = data?.overdueProjects || [];
  const recentStudents = data?.recentStudents || [];
  const recentMentors = data?.recentMentors || [];
  const recentTeams = data?.recentTeams || [];
  const recentActivities = data?.recentActivities || [];

  // Sort mentor cards strictly in descending order based on number of completed/active projects (highest projects count at top)
  const sortedMentors = useMemo(() => {
    return [...mentorWorkload].sort((a, b) => {
      const aCompleted = Number(a.completedProjectCount ?? a.completedProjects ?? 0);
      const aActive = Number(a.activeProjectCount ?? a.activeProjects ?? 0);
      const aTotal = Number(a.teamCount ?? a.projectCount ?? a.totalProjects ?? (aCompleted + aActive));

      const bCompleted = Number(b.completedProjectCount ?? b.completedProjects ?? 0);
      const bActive = Number(b.activeProjectCount ?? b.activeProjects ?? 0);
      const bTotal = Number(b.teamCount ?? b.projectCount ?? b.totalProjects ?? (bCompleted + bActive));

      // 1. Primary: Strictly descending order based on total completed/active projects (highest projects count at top)
      if (bTotal !== aTotal) {
        return bTotal - aTotal;
      }
      // 2. Secondary (Performance tie-breaker): More completed projects
      if (bCompleted !== aCompleted) {
        return bCompleted - aCompleted;
      }
      // 3. Completion ratio tie-breaker
      const aRate = aTotal > 0 ? aCompleted / aTotal : 0;
      const bRate = bTotal > 0 ? bCompleted / bTotal : 0;
      if (bRate !== aRate) {
        return bRate - aRate;
      }
      // 4. Active projects tie-breaker
      if (bActive !== aActive) {
        return bActive - aActive;
      }
      // 5. Total direct students
      const aStudents = Number(a.studentCount || 0);
      const bStudents = Number(b.studentCount || 0);
      if (bStudents !== aStudents) {
        return bStudents - aStudents;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [mentorWorkload]);

  const kpis = [
    {
      label: "Total Students",
      value: stats.totalStudents ?? 0,
      sub: `${stats.activeStudents ?? 0} active`,
      to: "/admin/students",
      icon: GraduationCap,
      accent: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Total Mentors",
      value: stats.totalMentors ?? 0,
      sub: `${stats.activeMentors ?? 0} active`,
      to: "/admin/mentors",
      icon: Award,
      accent: "bg-lime-500/15 text-lime-800 dark:text-lime-300",
    },
    {
      label: "Total Teams",
      value: stats.totalTeams ?? 0,
      sub: "Institute squads",
      to: "/admin/teams",
      icon: Users,
      accent: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
    },
    {
      label: "Active Projects",
      value: stats.activeProjects ?? 0,
      sub: `${stats.completedProjects ?? 0} completed`,
      to: "/admin/teams",
      icon: FolderKanban,
      accent: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
    },
    {
      label: "Pending Tasks",
      value: stats.pendingTasks ?? 0,
      sub: "Open deliverables",
      to: "/admin/teams",
      icon: Clock3,
      accent: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    {
      label: "Completed Tasks",
      value: stats.completedTasks ?? 0,
      sub: "Verified complete",
      to: "/admin/teams",
      icon: CheckCircle2,
      accent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Awaiting Role Review",
      value: unclassified,
      sub: "Unclassified accounts",
      to: "/admin/roles",
      icon: ShieldAlert,
      accent: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
            Techno NJR · Administration Console
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Institute Overview
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Real-time student, mentor, team, project, and governance telemetry across CollabX.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/admin/students?action=add" className={portalPrimaryBtnClass}>
            <UserPlus size={15} />
            <span>Add Student</span>
          </Link>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            className={portalSecondaryBtnClass}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />

      {/* Unclassified Accounts Banner */}
      {!loading && unclassified > 0 && (
        <div className="flex flex-col justify-between gap-4 rounded-3xl border border-amber-500/35 bg-gradient-to-r from-amber-500/12 via-amber-500/5 to-transparent p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-300">
              <ShieldAlert size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
                  Accounts Awaiting Role Classification
                </h2>
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                  {unclassified} Pending
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                Review imported or newly registered accounts and confirm their role as Student or Mentor with full audit logging.
              </p>
            </div>
          </div>
          <Link
            to="/admin/roles"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-amber-700"
          >
            <span>Open Role Queue</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading institute overview..." />
      ) : (
        <>
          {/* 7 Live KPI Cards */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {kpis.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className="group rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-2xs transition hover:-translate-y-0.5 hover:border-[#15803D]/50 dark:hover:border-[#A3E635]/50"
                >
                  <div className="flex items-center justify-between">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${item.accent}`}>
                      <Icon size={18} />
                    </div>
                    <ArrowUpRight
                      size={15}
                      className="text-[var(--text-muted)] transition group-hover:text-[var(--accent-text)]"
                    />
                  </div>
                  <p className="mt-3.5 text-2xl font-extrabold text-[var(--text-primary)]">
                    {item.value}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-[var(--text-secondary)]">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{item.sub}</p>
                </Link>
              );
            })}
          </section>

          {/* Mentor Workload + Deadlines / Overdue Watchlist */}
          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard
              title="Mentor-Wise Student & Team Breakdown"
              subtitle="Live student, team, and project completion performance per faculty mentor"
              className="xl:col-span-2"
              action={
                <Link
                  to="/admin/mentors"
                  className="text-xs font-bold text-[var(--accent-text)] hover:underline"
                >
                  All Mentors →
                </Link>
              }
            >
              {sortedMentors.length === 0 ? (
                <EmptyState icon={Award} title="No mentors found" description="Promote or add mentors to track workload." />
              ) : (
                <div className="space-y-3">
                  {sortedMentors.slice(0, 10).map((m) => {
                    const completed = Number(m.completedProjectCount ?? m.completedProjects ?? 0);
                    const active = Number(m.activeProjectCount ?? m.activeProjects ?? 0);
                    const total = Number(m.teamCount ?? m.projectCount ?? m.totalProjects ?? (completed + active));
                    const theme = getMentorPerformanceTheme(completed, total);

                    return (
                      <Link
                        key={m.id}
                        to={`/admin/mentors/${m.id}`}
                        className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 transition hover:border-[#15803D]/45 dark:hover:border-[#A3E635]/45"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#141A17] text-[11px] font-bold text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]">
                              {getInitials(m.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-[var(--text-primary)]">{m.name}</p>
                              <p className="truncate text-[11px] text-[var(--text-muted)]">{m.email}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                            <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                              {completed} Completed
                            </span>
                            <span className="rounded-full bg-sky-500/12 px-2.5 py-0.5 text-sky-700 dark:text-sky-300">
                              {active} Active
                            </span>
                            <span className="rounded-full bg-[var(--bg-surface-subtle)] px-2.5 py-0.5 text-[var(--text-secondary)]">
                              {m.studentCount || 0} Students
                            </span>
                          </div>
                        </div>

                        {/* Accurate completed projects ratio progress line with dynamic color coding */}
                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-[var(--text-muted)]">
                              {total > 0
                                ? `${completed} of ${total} ${total === 1 ? "project" : "projects"} completed`
                                : "No assigned projects"}
                            </span>
                            <span className={`font-extrabold ${theme.textColor}`}>
                              {theme.label}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-surface-subtle)]">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${theme.barColor}`}
                              style={{
                                width: `${Math.min(100, Math.max(theme.percentage > 0 ? 3 : 0, theme.percentage))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <div className="space-y-6">
              <SectionCard
                title="Overdue Projects"
                subtitle={`${overdueProjects.length} project(s) past deadline`}
              >
                {overdueProjects.length === 0 ? (
                  <p className="rounded-2xl bg-[var(--bg-surface-subtle)] p-4 text-xs font-medium text-[var(--text-muted)]">
                    No overdue projects right now.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {overdueProjects.slice(0, 5).map((p) => (
                      <Link
                        key={p.id}
                        to={`/admin/teams/${p.id}`}
                        className="block rounded-2xl border border-rose-500/25 bg-rose-500/5 p-3 transition hover:border-rose-500/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-xs font-extrabold text-[var(--text-primary)]">{p.title}</p>
                          <AlertTriangle size={14} className="shrink-0 text-rose-500" />
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                          Due {formatDate(p.deadline)} · {p.mentor?.name || "Unassigned"}
                        </p>
                        <div className="mt-2">
                          <ProgressBar value={calculateProjectProgress(p)} showLabel height="h-1.5" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Nearing Deadlines (14 Days)"
                subtitle={`${nearingDeadlines.length} upcoming milestone(s)`}
              >
                {nearingDeadlines.length === 0 ? (
                  <p className="rounded-2xl bg-[var(--bg-surface-subtle)] p-4 text-xs font-medium text-[var(--text-muted)]">
                    No projects due within the next 14 days.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {nearingDeadlines.slice(0, 5).map((p) => (
                      <Link
                        key={p.id}
                        to={`/admin/teams/${p.id}`}
                        className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 transition hover:border-[#15803D]/45"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-bold text-[var(--text-primary)]">{p.title}</p>
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-300">
                            <CalendarClock size={12} />
                            {formatDate(p.deadline)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                          Lead: {p.teamLeader?.name || "—"} · Mentor: {p.mentor?.name || "Unassigned"}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>

          {/* Recently Added Students, Mentors & Teams */}
          <div className="grid gap-6 lg:grid-cols-3">
            <SectionCard
              title="Recent Students"
              action={
                <Link to="/admin/students" className="text-xs font-bold text-[var(--accent-text)] hover:underline">
                  Manage →
                </Link>
              }
            >
              <div className="space-y-2.5">
                {recentStudents.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No students found.</p>
                ) : (
                  recentStudents.slice(0, 6).map((s) => (
                    <Link
                      key={s.id}
                      to={`/admin/students/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 transition hover:border-[#15803D]/45"
                    >
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
                      <StatusBadge status={s.is_active ? "Active" : "Inactive"} />
                    </Link>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Recent Mentors"
              action={
                <Link to="/admin/mentors" className="text-xs font-bold text-[var(--accent-text)] hover:underline">
                  View All →
                </Link>
              }
            >
              <div className="space-y-2.5">
                {recentMentors.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No mentors found.</p>
                ) : (
                  recentMentors.slice(0, 6).map((m) => (
                    <Link
                      key={m.id}
                      to={`/admin/mentors/${m.id}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 transition hover:border-[#15803D]/45"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[var(--text-primary)]">{m.name}</p>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">{m.email}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--accent-subtle)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent-text)]">
                        {m.teamCount} teams
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Recent Teams"
              action={
                <Link to="/admin/teams" className="text-xs font-bold text-[var(--accent-text)] hover:underline">
                  All Teams →
                </Link>
              }
            >
              <div className="space-y-2.5">
                {recentTeams.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No teams found.</p>
                ) : (
                  recentTeams.slice(0, 6).map((t) => (
                    <Link
                      key={t.id}
                      to={`/admin/teams/${t.id}`}
                      className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 transition hover:border-[#15803D]/45"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-bold text-[var(--text-primary)]">{t.title}</p>
                        <StatusBadge status={resolveProjectStatus(t)} />
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {t.memberCount} members · Mentor: {t.mentor?.name || "Unassigned"}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </SectionCard>
          </div>

          {/* Recent Platform Activities */}
          <SectionCard
            title="Recent Platform Activities"
            subtitle="Audit log of administrative, mentor, and team actions"
            action={
              <Link to="/admin/announcements" className="text-xs font-bold text-[var(--accent-text)] hover:underline">
                Full Activity Log →
              </Link>
            }
          >
            {recentActivities.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No recent platform activities logged yet"
                description="Mentor reassignments, role transitions, announcements, and reviews will appear here in real time."
              />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {recentActivities.slice(0, 10).map((act) => (
                  <div key={act.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[var(--text-primary)]">{act.description}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {act.user?.name || "System"} · {act.action}
                        {act.projectTitle ? ` · ${act.projectTitle}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-[var(--text-muted)]">
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
