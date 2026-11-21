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
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

const getMentorPerformanceTheme = (completed, total) => {
  if (total === 0) {
    return {
      percentage: 0,
      label: "0% Completed",
      barColor: "bg-neutral-400 dark:bg-neutral-700",
      textColor: "text-neutral-500 dark:text-neutral-400",
    };
  }
  const percentage = Math.round((completed / total) * 100);
  if (percentage >= 70) {
    return {
      percentage,
      label: `${percentage}% Completed`,
      barColor: "bg-neutral-900 dark:bg-white",
      textColor: "text-neutral-950 dark:text-white",
    };
  }
  if (percentage >= 30) {
    return {
      percentage,
      label: `${percentage}% Completed`,
      barColor: "bg-neutral-700 dark:bg-neutral-300",
      textColor: "text-neutral-800 dark:text-neutral-200",
    };
  }
  return {
    percentage,
    label: `${percentage}% Completed`,
    barColor: "bg-neutral-400 dark:bg-neutral-700",
    textColor: "text-neutral-600 dark:text-neutral-400",
  };
};

function CleanBadge({ label }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-black/12 bg-white px-2 py-0.5 text-[11px] font-semibold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200">
      {label}
    </span>
  );
}

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

  const sortedMentors = useMemo(() => {
    return [...mentorWorkload].sort((a, b) => {
      const aCompleted = Number(a.completedProjectCount ?? a.completedProjects ?? 0);
      const aActive = Number(a.activeProjectCount ?? a.activeProjects ?? 0);
      const aTotal = Number(a.teamCount ?? a.projectCount ?? a.totalProjects ?? aCompleted + aActive);

      const bCompleted = Number(b.completedProjectCount ?? b.completedProjects ?? 0);
      const bActive = Number(b.activeProjectCount ?? b.activeProjects ?? 0);
      const bTotal = Number(b.teamCount ?? b.projectCount ?? b.totalProjects ?? bCompleted + bActive);

      if (bTotal !== aTotal) return bTotal - aTotal;
      if (bCompleted !== aCompleted) return bCompleted - aCompleted;

      const aRate = aTotal > 0 ? aCompleted / aTotal : 0;
      const bRate = bTotal > 0 ? bCompleted / bTotal : 0;
      if (bRate !== aRate) return bRate - aRate;

      if (bActive !== aActive) return bActive - aActive;

      const aStudents = Number(a.studentCount || 0);
      const bStudents = Number(b.studentCount || 0);
      if (bStudents !== aStudents) return bStudents - aStudents;

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
    },
    {
      label: "Total Mentors",
      value: stats.totalMentors ?? 0,
      sub: `${stats.activeMentors ?? 0} active`,
      to: "/admin/mentors",
      icon: Award,
    },
    {
      label: "Total Teams",
      value: stats.totalTeams ?? 0,
      sub: "Institute squads",
      to: "/admin/teams",
      icon: Users,
    },
    {
      label: "Active Projects",
      value: stats.activeProjects ?? 0,
      sub: `${stats.completedProjects ?? 0} completed`,
      to: "/admin/teams",
      icon: FolderKanban,
    },
    {
      label: "Pending Tasks",
      value: stats.pendingTasks ?? 0,
      sub: "Open deliverables",
      to: "/admin/teams",
      icon: Clock3,
    },
    {
      label: "Completed Tasks",
      value: stats.completedTasks ?? 0,
      sub: "Verified complete",
      to: "/admin/teams",
      icon: CheckCircle2,
    },
    {
      label: "Awaiting Role Review",
      value: unclassified,
      sub: "Unclassified accounts",
      to: "/admin/roles",
      icon: ShieldAlert,
    },
  ];

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Header (Left X logo removed from here; clean header preserved) */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Techno NJR · Administration Console
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            Institute Overview
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Real-time student, mentor, team, project, and governance telemetry across CollabX.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/admin/students?action=add"
            className={`${portalPrimaryBtnClass} dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
          >
            <UserPlus size={15} strokeWidth={1.85} />
            <span>Add Student</span>
          </Link>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            className={`${portalSecondaryBtnClass} dark:!border-white/15 dark:!bg-[#0A0A0C] dark:!text-white dark:hover:!bg-[#141418]`}
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

      {!loading && unclassified > 0 && (
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-black/12 bg-white p-5 dark:border-white/12 dark:bg-[#08080A] sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-neutral-100 text-neutral-900 dark:border-white/12 dark:bg-[#121216] dark:text-white">
              <ShieldAlert size={18} strokeWidth={1.85} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-extrabold text-neutral-950 dark:text-white">
                  Accounts Awaiting Role Classification
                </h2>
                <span className="rounded-md border border-black/12 bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-800 dark:border-white/12 dark:bg-[#121216] dark:text-neutral-200">
                  {unclassified} Pending
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                Review imported or newly registered accounts and confirm their role as Student or Mentor with full audit logging.
              </p>
            </div>
          </div>
          <Link
            to="/admin/roles"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-black/15 bg-neutral-950 px-4 py-2 text-xs font-bold text-white transition hover:bg-neutral-800 dark:border-white/15 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
          >
            <span>Open Role Queue</span>
            <ArrowRight size={14} strokeWidth={2} />
          </Link>
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading institute overview..." />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {kpis.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className="group rounded-2xl border border-black/12 bg-white p-4 transition hover:border-black/35 dark:border-white/12 dark:bg-[#08080A] dark:hover:border-white/35"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-black/10 bg-neutral-100 text-neutral-900 dark:border-white/12 dark:bg-[#121216] dark:text-white">
                      <Icon size={16} strokeWidth={1.85} />
                    </div>
                    <ArrowUpRight
                      size={14}
                      strokeWidth={1.85}
                      className="text-neutral-400 transition group-hover:text-neutral-950 dark:text-neutral-500 dark:group-hover:text-white"
                    />
                  </div>
                  <p className="mt-3.5 text-2xl font-extrabold tabular-nums text-neutral-950 dark:text-white">
                    {item.value}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {item.sub}
                  </p>
                </Link>
              );
            })}
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard
              title="Mentor-Wise Student & Team Breakdown"
              subtitle="Live student, team, and project completion performance per faculty mentor"
              className="xl:col-span-2 dark:!border-white/12 dark:!bg-[#08080A]"
              action={
                <Link
                  to="/admin/mentors"
                  className="text-xs font-bold text-neutral-800 hover:underline dark:text-neutral-200"
                >
                  All Mentors →
                </Link>
              }
            >
              {sortedMentors.length === 0 ? (
                <EmptyState
                  icon={Award}
                  title="No mentors found"
                  description="Promote or add mentors to track workload."
                />
              ) : (
                <div className="space-y-3">
                  {sortedMentors.slice(0, 10).map((m) => {
                    const completed = Number(
                      m.completedProjectCount ?? m.completedProjects ?? 0,
                    );
                    const active = Number(
                      m.activeProjectCount ?? m.activeProjects ?? 0,
                    );
                    const total = Number(
                      m.teamCount ??
                        m.projectCount ??
                        m.totalProjects ??
                        completed + active,
                    );
                    const theme = getMentorPerformanceTheme(completed, total);

                    return (
                      <Link
                        key={m.id}
                        to={`/admin/mentors/${m.id}`}
                        className="block rounded-2xl border border-black/10 bg-neutral-50 p-3.5 transition hover:border-black/30 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/30"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-white text-[11px] font-bold text-neutral-950 dark:border-white/15 dark:bg-[#08080A] dark:text-white">
                              {getInitials(m.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-neutral-950 dark:text-white">
                                {m.name}
                              </p>
                              <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                                {m.email}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                            <span className="rounded-md border border-black/10 bg-white px-2 py-0.5 text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                              {completed} Completed
                            </span>
                            <span className="rounded-md border border-black/10 bg-white px-2 py-0.5 text-neutral-700 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-300">
                              {active} Active
                            </span>
                            <span className="rounded-md border border-black/10 bg-white px-2 py-0.5 text-neutral-600 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-400">
                              {m.studentCount || 0} Students
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-neutral-500 dark:text-neutral-400">
                              {total > 0
                                ? `${completed} of ${total} ${
                                    total === 1 ? "project" : "projects"
                                  } completed`
                                : "No assigned projects"}
                            </span>
                            <span className={`font-bold ${theme.textColor}`}>
                              {theme.label}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${theme.barColor}`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    theme.percentage > 0 ? 3 : 0,
                                    theme.percentage,
                                  ),
                                )}%`,
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
                className="dark:!border-white/12 dark:!bg-[#08080A]"
              >
                {overdueProjects.length === 0 ? (
                  <p className="rounded-xl border border-black/10 bg-neutral-50 p-4 text-xs font-medium text-neutral-500 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-400">
                    No overdue projects right now.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {overdueProjects.slice(0, 5).map((p) => (
                      <Link
                        key={p.id}
                        to={`/admin/teams/${p.id}`}
                        className="block rounded-xl border border-black/10 bg-neutral-50 p-3 transition hover:border-black/30 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                            {p.title}
                          </p>
                          <AlertTriangle
                            size={14}
                            strokeWidth={1.85}
                            className="shrink-0 text-neutral-500 dark:text-neutral-400"
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                          Due {formatDate(p.deadline)} ·{" "}
                          {p.mentor?.name || "Unassigned"}
                        </p>
                        <div className="mt-2">
                          <ProgressBar
                            value={calculateProjectProgress(p)}
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
                title="Nearing Deadlines (14 Days)"
                subtitle={`${nearingDeadlines.length} upcoming milestone(s)`}
                className="dark:!border-white/12 dark:!bg-[#08080A]"
              >
                {nearingDeadlines.length === 0 ? (
                  <p className="rounded-xl border border-black/10 bg-neutral-50 p-4 text-xs font-medium text-neutral-500 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-400">
                    No projects due within the next 14 days.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {nearingDeadlines.slice(0, 5).map((p) => (
                      <Link
                        key={p.id}
                        to={`/admin/teams/${p.id}`}
                        className="block rounded-xl border border-black/10 bg-neutral-50 p-3 transition hover:border-black/30 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                            {p.title}
                          </p>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                            <CalendarClock size={12} strokeWidth={1.85} />
                            {formatDate(p.deadline)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                          Lead: {p.teamLeader?.name || "—"} · Mentor:{" "}
                          {p.mentor?.name || "Unassigned"}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <SectionCard
              title="Recent Students"
              className="dark:!border-white/12 dark:!bg-[#08080A]"
              action={
                <Link
                  to="/admin/students"
                  className="text-xs font-bold text-neutral-800 hover:underline dark:text-neutral-200"
                >
                  Manage →
                </Link>
              }
            >
              <div className="space-y-2.5">
                {recentStudents.length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    No students found.
                  </p>
                ) : (
                  recentStudents.slice(0, 6).map((s) => (
                    <Link
                      key={s.id}
                      to={`/admin/students/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-3 transition hover:border-black/30 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/30"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                            {s.name}
                          </p>
                          {(s.roll_no || s.rollNumber) && (
                            <span className="rounded-md border border-black/10 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-700 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-300">
                              Roll: {s.roll_no || s.rollNumber}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                          {s.email}{" "}
                          {s.roll_no || s.rollNumber
                            ? `· ${s.roll_no || s.rollNumber}`
                            : ""}
                        </p>
                      </div>
                      <CleanBadge label={s.is_active ? "Active" : "Inactive"} />
                    </Link>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Recent Mentors"
              className="dark:!border-white/12 dark:!bg-[#08080A]"
              action={
                <Link
                  to="/admin/mentors"
                  className="text-xs font-bold text-neutral-800 hover:underline dark:text-neutral-200"
                >
                  View All →
                </Link>
              }
            >
              <div className="space-y-2.5">
                {recentMentors.length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    No mentors found.
                  </p>
                ) : (
                  recentMentors.slice(0, 6).map((m) => (
                    <Link
                      key={m.id}
                      to={`/admin/mentors/${m.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-3 transition hover:border-black/30 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                          {m.name}
                        </p>
                        <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                          {m.email}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md border border-black/10 bg-white px-2 py-0.5 text-[11px] font-semibold text-neutral-700 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-300">
                        {m.teamCount} teams
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Recent Teams"
              className="dark:!border-white/12 dark:!bg-[#08080A]"
              action={
                <Link
                  to="/admin/teams"
                  className="text-xs font-bold text-neutral-800 hover:underline dark:text-neutral-200"
                >
                  All Teams →
                </Link>
              }
            >
              <div className="space-y-2.5">
                {recentTeams.length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    No teams found.
                  </p>
                ) : (
                  recentTeams.slice(0, 6).map((t) => (
                    <Link
                      key={t.id}
                      to={`/admin/teams/${t.id}`}
                      className="block rounded-xl border border-black/10 bg-neutral-50 p-3 transition hover:border-black/30 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                          {t.title}
                        </p>
                        <CleanBadge label={resolveProjectStatus(t)} />
                      </div>
                      <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                        {t.memberCount} members · Mentor:{" "}
                        {t.mentor?.name || "Unassigned"}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Recent Platform Activities"
            subtitle="Audit log of administrative, mentor, and team actions"
            className="dark:!border-white/12 dark:!bg-[#08080A]"
            action={
              <Link
                to="/admin/announcements"
                className="text-xs font-bold text-neutral-800 hover:underline dark:text-neutral-200"
              >
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
              <div className="divide-y divide-black/10 dark:divide-white/10">
                {recentActivities.slice(0, 10).map((act) => (
                  <div
                    key={act.id}
                    className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-neutral-950 dark:text-white">
                        {act.description}
                      </p>
                      <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                        {act.user?.name || "System"} · {act.action}
                        {act.projectTitle ? ` · ${act.projectTitle}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
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