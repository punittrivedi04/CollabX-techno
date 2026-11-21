import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  Eye,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";

import api from "../../services/api";
import {
  calculateProjectProgress,
  formatDate,
  getErrorMessage,
  getInitials,
} from "../../utils/portalHelpers";
import DirectorInspectDrawer from "./DirectorInspectDrawer";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  SectionCard,
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
  const mentorWorkload = Array.isArray(data?.mentorWorkload)
    ? data.mentorWorkload
    : [];
  const atRiskProjects = Array.isArray(data?.atRiskProjects)
    ? data.atRiskProjects
    : [];

  const kpis = [
    {
      label: "Total Students",
      value: summary.totalStudents ?? 0,
      sub: `${summary.activeStudents ?? 0} active`,
      icon: GraduationCap,
    },
    {
      label: "Faculty Mentors",
      value: summary.totalMentors ?? 0,
      sub: `${summary.activeMentors ?? 0} active`,
      icon: Award,
    },
    {
      label: "Institute Teams",
      value: summary.totalTeams ?? 0,
      sub: `${summary.activeProjects ?? 0} active`,
      icon: Users,
    },
    {
      label: "Project Completion",
      value: `${summary.projectCompletionRate ?? 0}%`,
      sub: `${summary.completedProjects ?? 0}/${
        summary.totalTeams ?? 0
      } completed`,
      icon: CheckCircle2,
    },
    {
      label: "Avg Project Progress",
      value: `${summary.avgProjectProgress ?? 0}%`,
      sub: `Across all ${summary.totalTeams ?? 0} teams`,
      icon: TrendingUp,
    },
    {
      label: "Overdue / At Risk",
      value: summary.atRiskProjectsCount ?? 0,
      sub: `${summary.overdueProjectsCount ?? 0} overdue`,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Executive Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Techno NJR · Executive Director Portal
            </p>
            <NeutralBadge>
              <Eye size={11} strokeWidth={1.85} />
              <span>Read-Only Executive Mode</span>
            </NeutralBadge>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            Executive Overview
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-sm">
            High-level institute project completion, faculty mentors,
            deliverables, and risk telemetry.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center">
          <Link
            to="/director/reports"
            className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
          >
            <BarChart3 size={15} strokeWidth={1.85} />
            <span>Institute Reports</span>
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

      {loading ? (
        <LoadingState label="Loading institute executive telemetry..." />
      ) : (
        <>
          {/* Executive 6 KPI Strip */}
          <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-6">
            {kpis.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="rounded-2xl border border-black/12 bg-white p-4 shadow-2xs dark:border-white/12 dark:bg-[#08080A]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-neutral-50 text-neutral-900 dark:border-white/10 dark:bg-[#101014] dark:text-white">
                    <Icon size={17} strokeWidth={1.85} />
                  </div>
                  <p className="mt-3.5 text-2xl font-black tabular-nums text-neutral-950 dark:text-white">
                    {item.value}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
                    {item.sub}
                  </p>
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
              className="xl:col-span-2 dark:!border-white/12 dark:!bg-[#08080A]"
              action={
                <Link
                  to="/director/reports"
                  className="text-xs font-bold text-neutral-900 hover:underline dark:text-white"
                >
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
                  <table className="w-full min-w-[600px] text-left text-xs">
                    <thead className="border-b border-black/10 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:border-white/10 dark:text-neutral-400">
                      <tr>
                        <th className="py-3 pr-4">Faculty Mentor</th>
                        <th className="px-3 py-3 text-center">Assigned Teams</th>
                        <th className="px-3 py-3">Active vs. Completed</th>
                        <th className="w-40 px-3 py-3">Project Progress</th>
                        <th className="py-3 pl-3 text-right">Inspection</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10 dark:divide-white/10">
                      {mentorWorkload.map((m) => (
                        <tr
                          key={m.id}
                          onClick={() => {
                            setInspectMentorId(m.id);
                            setInspectProjectId(null);
                          }}
                          className="group cursor-pointer transition hover:bg-neutral-50 dark:hover:bg-[#101014]"
                          title="Click to inspect Faculty Mentor"
                        >
                          <td className="py-3.5 pr-4">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-neutral-100 text-[11px] font-black text-neutral-950 dark:border-white/12 dark:bg-[#101014] dark:text-white">
                                {getInitials(m.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-bold text-neutral-950 group-hover:underline dark:text-white">
                                  {m.name}
                                </p>
                                <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                                  {m.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-3.5 text-center">
                            <span className="inline-flex items-center rounded-md border border-black/10 bg-neutral-50 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-neutral-900 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-200">
                              {m.teamCount} team{m.teamCount === 1 ? "" : "s"}
                            </span>
                          </td>

                          <td className="px-3 py-3.5 tabular-nums text-neutral-600 dark:text-neutral-400">
                            <span className="font-semibold text-neutral-900 dark:text-neutral-200">
                              {m.activeProjects} active
                            </span>
                            {" · "}
                            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                              {m.completedProjects} done
                            </span>
                          </td>

                          <td className="px-3 py-3.5">
                            <ProgressBar
                              value={m.avgProgress}
                              showLabel
                              height="h-1.5"
                            />
                          </td>

                          <td className="py-3.5 pl-3 text-right">
                            <span className="inline-flex items-center gap-1 rounded-xl border border-black/12 bg-white px-2.5 py-1 text-[11px] font-bold text-neutral-800 transition group-hover:border-black/35 group-hover:text-neutral-950 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-200 dark:group-hover:border-white/35 dark:group-hover:text-white">
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
              className="dark:!border-white/12 dark:!bg-[#08080A]"
            >
              {atRiskProjects.length === 0 ? (
                <div className="rounded-xl border border-black/10 bg-neutral-50 p-6 text-center dark:border-white/10 dark:bg-[#101014]">
                  <ShieldCheck
                    size={24}
                    strokeWidth={1.85}
                    className="mx-auto text-neutral-800 dark:text-neutral-200"
                  />
                  <p className="mt-2 text-xs font-bold text-neutral-950 dark:text-white">
                    All projects on track
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
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
                      className="group cursor-pointer rounded-xl border border-black/10 bg-neutral-50 p-3.5 transition hover:border-black/35 hover:bg-white dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35 dark:hover:bg-[#14141A]"
                      title="Click to inspect Project details"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-xs font-extrabold text-neutral-950 group-hover:underline dark:text-white">
                          {p.title}
                        </p>
                        <NeutralBadge>At Risk</NeutralBadge>
                      </div>
                      <p className="mt-1 text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                        {p.riskReason}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                        <span className="truncate">
                          Mentor: {p.mentor?.name || "Unassigned"}
                        </span>
                        <span className="font-medium tabular-nums">
                          Due {formatDate(p.deadline)}
                        </span>
                      </div>
                      <div className="mt-2.5">
                        <ProgressBar
                          value={calculateProjectProgress(p)}
                          showLabel
                          height="h-1.5"
                        />
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