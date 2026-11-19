import { useCallback, useEffect, useState } from "react";
import {
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Eye,
  FolderKanban,
  GraduationCap,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";

import api from "../../services/api";
import { calculateProjectProgress, formatDate, formatDateTime, getErrorMessage, getInitials, resolveProjectStatus } from "../../utils/portalHelpers";
import DirectorInspectDrawer from "./DirectorInspectDrawer";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  SectionCard,
  StatusBadge,
  portalInputClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

const REPORT_TABS = [
  { key: "mentors", label: "Faculty Mentors Summary", icon: Award },
  { key: "projects", label: "Project Progress & Deadlines", icon: FolderKanban },
];

export default function DirectorReports() {
  const [activeTab, setActiveTab] = useState("mentors");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mentorFilter, setMentorFilter] = useState("");
  const [projectSearch, setProjectSearch] = useState("");

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Executive Drill-Down Inspection states
  const [inspectProjectId, setInspectProjectId] = useState(null);
  const [inspectMentorId, setInspectMentorId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (statusFilter !== "all") params.status = statusFilter;
      if (mentorFilter) params.mentorId = mentorFilter;
      const res = await api.get("/director/reports", { params });
      setReport(res.data?.data || res.data || null);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load institute reports."));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, mentorFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = report?.executiveSummary || {};
  const mentors = report?.mentorWorkloadDistribution || [];
  const rawProjects = report?.projects || [];

  // Filter projects by search query
  const filteredProjects = rawProjects.filter((p) => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return true;
    const title = (p.title || "").toLowerCase();
    const leader = (p.teamLeader?.name || "").toLowerCase();
    const mentor = (p.mentor?.name || "").toLowerCase();
    return title.includes(q) || leader.includes(q) || mentor.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
              Executive Director · Analytics &amp; Reports
            </p>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-2.5 py-0.5 text-[10px] font-extrabold text-[var(--accent-text)]">
              <Eye size={11} /> Strictly Read-Only
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Institute Reports
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            High-level executive views of Faculty Mentors capacity and Project Progress &amp; Deadlines.
            {report?.generatedAt ? ` Updated ${formatDateTime(report.generatedAt)}.` : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className={portalSecondaryBtnClass}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />

      {/* Executive 5 KPI Strip */}
      {!loading && report && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Total Students", summary.totalStudents ?? 0],
            ["Faculty Mentors", summary.totalMentors ?? 0],
            ["Institute Teams", summary.totalTeams ?? 0],
            ["Project Completion Rate", `${summary.projectCompletionRate ?? 0}%`],
            ["Active Projects", summary.activeProjects ?? (summary.totalTeams - summary.completedProjects) ?? 0],
          ].map(([label, val]) => (
            <div
              key={label}
              className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-2xs"
            >
              <p className="text-[11px] font-extrabold uppercase text-[var(--text-muted)]">{label}</p>
              <p className="mt-1 text-2xl font-black text-[var(--text-primary)]">{val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Report Tab Switcher + Filters */}
      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-2xs lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition cursor-pointer ${
                  active
                    ? "bg-[#141A17] text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]"
                    : "border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === "projects" && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Search projects..."
                className={`${portalInputClass} py-1.5 pl-8 pr-3 text-xs w-48`}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${portalInputClass} py-1.5 text-xs w-auto min-w-[130px]`}
            >
              <option value="all">All Statuses</option>
              <option value="Planning">Planning</option>
              <option value="In Progress">In Progress</option>
              <option value="On Hold">On Hold</option>
              <option value="Completed">Completed</option>
            </select>

            <select
              value={mentorFilter}
              onChange={(e) => setMentorFilter(e.target.value)}
              className={`${portalInputClass} py-1.5 text-xs w-auto min-w-[150px]`}
            >
              <option value="">All Mentors</option>
              {mentors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingState label="Generating executive report..." />
      ) : activeTab === "mentors" ? (
        /* Tab 1: Faculty Mentors Summary Table */
        <SectionCard
          title="Faculty Mentors Summary"
          subtitle="Read-only mentorship workload, team distribution, and overall project completion progress"
        >
          {mentors.length === 0 ? (
            <EmptyState icon={Award} title="No mentor metrics found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-[var(--border-subtle)] text-[11px] font-extrabold uppercase text-[var(--text-muted)]">
                  <tr>
                    <th className="py-3 pr-4">Faculty Mentor</th>
                    <th className="px-3 py-3 text-center">Assigned Teams</th>
                    <th className="px-3 py-3">Active vs. Completed</th>
                    <th className="px-3 py-3 text-center">Overdue</th>
                    <th className="w-44 px-3 py-3">Overall Progress</th>
                    <th className="py-3 pl-3 text-right">Inspection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {mentors.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => {
                        setInspectMentorId(m.id);
                        setInspectProjectId(null);
                      }}
                      className="group cursor-pointer transition hover:bg-[var(--bg-surface-elevated)]"
                      title="Click to inspect Faculty Mentor details"
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

                      <td className="px-3 py-3.5 text-center">
                        {m.overdueProjects > 0 ? (
                          <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-300">
                            {m.overdueProjects} Overdue
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">0</span>
                        )}
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
      ) : (
        /* Tab 2: Project Progress & Deadlines Table */
        <SectionCard
          title={`Project Progress & Deadlines (${filteredProjects.length})`}
          subtitle="Read-only project health, overall completion percentage, and deadlines (task lists and chat strictly excluded)"
        >
          {filteredProjects.length === 0 ? (
            <EmptyState icon={FolderKanban} title="No projects match selected filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-xs">
                <thead className="border-b border-[var(--border-subtle)] text-[11px] font-extrabold uppercase text-[var(--text-muted)]">
                  <tr>
                    <th className="py-3 pr-4">Project / Team</th>
                    <th className="px-3 py-3">Mentor</th>
                    <th className="px-3 py-3">Team Leader</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Deadline</th>
                    <th className="w-40 px-3 py-3">Overall Progress</th>
                    <th className="py-3 pl-3 text-right">Inspection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredProjects.map((p) => {
                    const isPastDue =
                      p.deadline &&
                      new Date(p.deadline).getTime() < Date.now() &&
                      p.status !== "Completed";

                    return (
                      <tr
                        key={p.id}
                        onClick={() => {
                          setInspectProjectId(p.id);
                          setInspectMentorId(null);
                        }}
                        className="group cursor-pointer transition hover:bg-[var(--bg-surface-elevated)]"
                        title="Click to inspect Project details"
                      >
                        <td className="py-3.5 pr-4">
                          <p className="truncate font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-text)]">
                            {p.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                            {p.memberCount} member(s)
                          </p>
                        </td>

                        <td
                          className="px-3 py-3.5 text-[var(--text-secondary)]"
                          onClick={(e) => {
                            if (p.mentor?.id) {
                              e.stopPropagation();
                              setInspectMentorId(p.mentor.id);
                              setInspectProjectId(null);
                            }
                          }}
                        >
                          {p.mentor?.name ? (
                            <span className="font-semibold text-[var(--accent-text)] hover:underline">
                              {p.mentor.name}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">Unassigned</span>
                          )}
                        </td>

                        <td className="px-3 py-3.5 text-[var(--text-secondary)]">
                          {p.teamLeader?.name || "—"}
                        </td>

                        <td className="px-3 py-3.5">
                          <StatusBadge status={resolveProjectStatus(p)} />
                        </td>

                        <td className="px-3 py-3.5 text-[var(--text-muted)]">
                          <span className={isPastDue ? "font-bold text-rose-600 dark:text-rose-400" : ""}>
                            {formatDate(p.deadline)}
                          </span>
                        </td>

                        <td className="px-3 py-3.5">
                          <ProgressBar value={calculateProjectProgress(p)} showLabel height="h-2" />
                        </td>

                        <td className="py-3.5 pl-3 text-right">
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)] transition group-hover:border-[#15803D]/60 group-hover:text-[var(--accent-text)]">
                            Inspect →
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
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
