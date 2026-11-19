import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FolderKanban,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";

import api from "../../services/api";
import { calculateProjectProgress, formatDate, getErrorMessage, getInitials, resolveProjectStatus } from "../../utils/portalHelpers";
import DirectorInspectDrawer from "./DirectorInspectDrawer";
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

export default function DirectorOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Executive Drill-Down Inspection states
  const [inspectProjectId, setInspectProjectId] = useState(null);
  const [inspectMentorId, setInspectMentorId] = useState(null);

  const load = useCallback(async (bg = false) => {
    if (bg) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const res = await api.get("/director/overview");
      setData(res.data?.data || res.data || null);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load executive overview."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary || data || {};
  const mentorWorkload = data?.mentorWorkload || [];
  const atRiskProjects = data?.atRiskProjects || [];

  const kpis = [
    {
      label: "Total Students",
      value: summary.totalStudents ?? 0,
      sub: `${summary.activeStudents ?? 0} active`,
      icon: GraduationCap,
      accent: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Faculty Mentors",
      value: summary.totalMentors ?? 0,
      sub: `${summary.activeMentors ?? 0} active`,
      icon: Award,
      accent: "bg-lime-500/15 text-lime-800 dark:text-lime-300",
    },
    {
      label: "Institute Teams",
      value: summary.totalTeams ?? 0,
      sub: `${summary.activeProjects ?? 0} active`,
      icon: Users,
      accent: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
    },
    {
      label: "Project Completion",
      value: `${summary.projectCompletionRate ?? 0}%`,
      sub: `${summary.completedProjects ?? 0}/${summary.totalTeams ?? 0} completed`,
      icon: CheckCircle2,
      accent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Avg Project Progress",
      value: `${summary.avgProjectProgress ?? 0}%`,
      sub: `Across all ${summary.totalTeams ?? 0} teams`,
      icon: TrendingUp,
      accent: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
    },
    {
      label: "Overdue / At Risk",
      value: summary.atRiskProjectsCount ?? 0,
      sub: `${summary.overdueProjectsCount ?? 0} overdue`,
      icon: AlertTriangle,
      accent: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
              Techno NJR · Executive Director Portal
            </p>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-2.5 py-0.5 text-[10px] font-extrabold text-[var(--accent-text)]">
              <Eye size={11} /> Read-Only Executive Mode
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Executive Overview
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            High-level institute project completion, faculty mentors, deliverables, and risk telemetry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/director/reports" className={portalPrimaryBtnClass}>
            <BarChart3 size={15} />
            <span>Institute Reports</span>
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

      {loading ? (
        <LoadingState label="Loading institute executive telemetry..." />
      ) : (
        <>
          {/* Executive 6 KPI Strip */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {kpis.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-2xs"
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${item.accent}`}>
                    <Icon size={18} />
                  </div>
                  <p className="mt-3.5 text-2xl font-black text-[var(--text-primary)]">{item.value}</p>
                  <p className="mt-0.5 text-xs font-bold text-[var(--text-secondary)]">{item.label}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{item.sub}</p>
                </div>
              );
            })}
          </section>

          {/* Main Executive Layout: Mentors Summary Table (Left 2 cols) + At-Risk Watchlist (Right 1 col) */}
          <div className="grid gap-6 xl:grid-cols-3">
            {/* Faculty Mentors & Assigned Projects Summary Table */}
            <SectionCard
              title="Faculty Mentors & Assigned Projects Summary"
              subtitle="Overview of faculty mentorship capacity, active vs. completed projects, and completion progress"
              className="xl:col-span-2"
              action={
                <Link to="/director/reports" className="text-xs font-bold text-[var(--accent-text)] hover:underline">
                  Full Reports Directory →
                </Link>
              }
            >
              {mentorWorkload.length === 0 ? (
                <EmptyState
                  icon={Award}
                  title="No mentor workload data available"
                  description="Faculty mentor project allocations will appear here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="border-b border-[var(--border-subtle)] text-[11px] font-extrabold uppercase text-[var(--text-muted)]">
                      <tr>
                        <th className="py-3 pr-4">Faculty Mentor</th>
                        <th className="px-3 py-3 text-center">Assigned Teams</th>
                        <th className="px-3 py-3">Active vs. Completed</th>
                        <th className="w-40 px-3 py-3">Project Progress</th>
                        <th className="py-3 pl-3 text-right">Inspection</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {mentorWorkload.map((m) => (
                        <tr
                          key={m.id}
                          onClick={() => {
                            setInspectMentorId(m.id);
                            setInspectProjectId(null);
                          }}
                          className="group cursor-pointer transition hover:bg-[var(--bg-surface-elevated)]"
                          title="Click to inspect Faculty Mentor"
                        >
                          <td className="py-3.5 pr-4">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[11px] font-black text-[var(--accent-text)]">
                                {getInitials(m.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-text)]">
                                  {m.name}
                                </p>
                                <p className="truncate text-[11px] text-[var(--text-muted)]">{m.email}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-3.5 text-center">
                            <span className="inline-flex items-center rounded-full bg-[var(--bg-surface-elevated)] px-2.5 py-0.5 font-bold text-[var(--text-primary)]">
                              {m.teamCount} team{m.teamCount === 1 ? "" : "s"}
                            </span>
                          </td>

                          <td className="px-3 py-3.5 text-[var(--text-secondary)]">
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                              {m.activeProjects} active
                            </span>
                            {" · "}
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {m.completedProjects} done
                            </span>
                          </td>

                          <td className="px-3 py-3.5">
                            <ProgressBar value={m.avgProgress} showLabel height="h-2" />
                          </td>

                          <td className="py-3.5 pl-3 text-right">
                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)] transition group-hover:border-[#15803D]/60 group-hover:text-[var(--accent-text)]">
                              Inspect →
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* Overdue & At-Risk Projects Watchlist */}
            <SectionCard
              title="Overdue & At-Risk Projects"
              subtitle={`${atRiskProjects.length} project(s) requiring executive oversight`}
            >
              {atRiskProjects.length === 0 ? (
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-6 text-center">
                  <ShieldCheck size={26} className="mx-auto text-emerald-500" />
                  <p className="mt-2 text-xs font-bold text-[var(--text-primary)]">All projects on track</p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    No overdue or high-risk projects flagged right now.
                  </p>
                </div>
              ) : (
                <div className="max-h-[460px] space-y-2.5 overflow-y-auto pr-1 scrollbar-thin">
                  {atRiskProjects.slice(0, 10).map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setInspectProjectId(p.id);
                        setInspectMentorId(null);
                      }}
                      className="group cursor-pointer rounded-2xl border border-rose-500/25 bg-rose-500/6 p-3.5 transition hover:border-rose-500/50 hover:bg-rose-500/10"
                      title="Click to inspect Project details"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-xs font-extrabold text-[var(--text-primary)] group-hover:text-rose-600 dark:group-hover:text-rose-300">
                          {p.title}
                        </p>
                        <StatusBadge status="At Risk" />
                      </div>
                      <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-300">
                        {p.riskReason}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between text-[11px] text-[var(--text-muted)]">
                        <span>Mentor: {p.mentor?.name || "Unassigned"}</span>
                        <span className="font-medium">Due {formatDate(p.deadline)}</span>
                      </div>
                      <div className="mt-2.5">
                        <ProgressBar value={calculateProjectProgress(p)} showLabel height="h-1.5" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}

      {/* Clean Read-Only Executive Drill-Down Drawer / Modal */}
      <DirectorInspectDrawer
        projectId={inspectProjectId}
        mentorId={inspectMentorId}
        onClose={() => {
          setInspectProjectId(null);
          setInspectMentorId(null);
        }}
        onSelectProject={(pid) => {
          setInspectMentorId(null);
          setInspectProjectId(pid);
        }}
        onSelectMentor={(mid) => {
          setInspectProjectId(null);
          setInspectMentorId(mid);
        }}
      />
    </div>
  );
}
