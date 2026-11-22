import { useCallback, useEffect, useState } from "react";
import {
  Award,
  FolderKanban,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import api from "../../services/api";
import {
  calculateProjectProgress,
  formatDate,
  formatDateTime,
  getErrorMessage,
  getInitials,
  resolveProjectStatus,
} from "../../utils/portalHelpers";
import DirectorInspectDrawer from "./DirectorInspectDrawer";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  SectionCard,
  portalInputClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

const REPORT_TABS = [
  { key: "mentors", label: "Faculty Mentors Summary", icon: Award },
  { key: "projects", label: "Project Progress & Deadlines", icon: FolderKanban },
];

function NeutralBadge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200 ${className}`}
    >
      {children}
    </span>
  );
}

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
  const [inspectStudentId, setInspectStudentId] = useState(null);

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
  const mentors = Array.isArray(report?.mentorWorkloadDistribution)
    ? report.mentorWorkloadDistribution
    : [];
  const rawProjects = Array.isArray(report?.projects) ? report.projects : [];

  const filteredProjects = rawProjects.filter((p) => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return true;
    const title = (p.title || "").toLowerCase();
    const leader = (p.teamLeader?.name || "").toLowerCase();
    const mentor = (p.mentor?.name || "").toLowerCase();
    return title.includes(q) || leader.includes(q) || mentor.includes(q);
  });

  const totalTeamsCount = Number(summary.totalTeams) || 0;
  const completedProjectsCount = Number(summary.completedProjects) || 0;
  const activeProjectsCount =
    summary.activeProjects ?? Math.max(0, totalTeamsCount - completedProjectsCount);

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Executive Director · Analytics &amp; Reports
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            Institute Reports
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-sm">
            High-level executive views of Faculty Mentors capacity and Project
            Progress &amp; Deadlines.
            {report?.generatedAt
              ? ` Updated ${formatDateTime(report.generatedAt)}.`
              : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418] sm:w-auto`}
        >
          <RefreshCw
            size={15}
            strokeWidth={1.85}
            className={loading ? "animate-spin" : ""}
          />
          <span>Refresh</span>
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />

      {/* Executive 5 KPI Strip */}
      {!loading && report && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Total Students", summary.totalStudents ?? 0],
            ["Faculty Mentors", summary.totalMentors ?? 0],
            ["Institute Teams", totalTeamsCount],
            [
              "Project Completion Rate",
              `${summary.projectCompletionRate ?? 0}%`,
            ],
            ["Active Projects", activeProjectsCount],
          ].map(([label, val]) => (
            <div
              key={label}
              className="rounded-2xl border border-black/12 bg-white p-4 shadow-2xs dark:border-white/12 dark:bg-[#08080A]"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {label}
              </p>
              <p className="mt-1 text-2xl font-black tabular-nums text-neutral-950 dark:text-white">
                {val}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Report Tab Switcher + Filters */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-black/12 bg-white p-3.5 shadow-2xs dark:border-white/12 dark:bg-[#08080A] lg:flex-row lg:items-center">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition ${
                  active
                    ? "border-black/25 bg-neutral-950 text-white dark:border-white/25 dark:bg-white dark:text-black"
                    : "border-black/12 bg-neutral-50 text-neutral-700 hover:border-black/30 hover:text-neutral-950 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-white/30 dark:hover:text-white"
                }`}
              >
                <Icon size={14} strokeWidth={1.85} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === "projects" && (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:w-52">
              <Search
                size={14}
                strokeWidth={1.85}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
              />
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Search projects..."
                className={`${portalInputClass} w-full rounded-xl py-1.5 pl-8 pr-8 text-xs dark:!border-white/12 dark:!bg-[#101014] dark:!text-white dark:placeholder:!text-neutral-500`}
              />
              {projectSearch && (
                <button
                  type="button"
                  onClick={() => setProjectSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-0.5 text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white"
                >
                  <X size={13} strokeWidth={2} />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${portalInputClass} w-full rounded-xl py-1.5 text-xs dark:!border-white/12 dark:!bg-[#101014] dark:!text-white sm:w-auto sm:min-w-[130px]`}
            >
              <option value="all">All Statuses</option>
              <option value="Planning">Planning</option>
              <option value="In Progress">In Progress</option>
              <option value="On Hold">On Hold</option>
              <option value="Completed">Completed</option>
              <option value="Archived">Archived</option>
            </select>

            <select
              value={mentorFilter}
              onChange={(e) => setMentorFilter(e.target.value)}
              className={`${portalInputClass} w-full rounded-xl py-1.5 text-xs dark:!border-white/12 dark:!bg-[#101014] dark:!text-white sm:w-auto sm:min-w-[150px]`}
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
          subtitle="Mentorship workload, team distribution, and overall project completion progress"
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          {mentors.length === 0 ? (
            <EmptyState icon={Award} title="No mentor metrics found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="border-b border-black/10 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:border-white/10 dark:text-neutral-400">
                  <tr>
                    <th className="py-3 pr-4">Faculty Mentor</th>
                    <th className="px-3 py-3 text-center">Assigned Teams</th>
                    <th className="px-3 py-3">Active vs. Completed</th>
                    <th className="px-3 py-3 text-center">Overdue</th>
                    <th className="w-44 px-3 py-3">Overall Progress</th>
                    <th className="py-3 pl-3 text-right">Inspection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/10">
                  {mentors.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => {
                        setInspectMentorId(m.id);
                        setInspectProjectId(null);
                      }}
                      className="group cursor-pointer transition hover:bg-neutral-50 dark:hover:bg-[#101014]"
                      title="Click to inspect Faculty Mentor details"
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

                      <td className="px-3 py-3.5 text-center tabular-nums">
                        {Number(m.overdueProjects) > 0 ? (
                          <NeutralBadge>
                            {m.overdueProjects} Overdue
                          </NeutralBadge>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-500">
                            0
                          </span>
                        )}
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
      ) : (
        /* Tab 2: Project Progress & Deadlines Table */
        <SectionCard
          title={`Project Progress & Deadlines (${filteredProjects.length})`}
          subtitle="Project health, overall completion percentage, and deadlines (task lists and chat strictly excluded)"
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          {filteredProjects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects match selected filters"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-black/10 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:border-white/10 dark:text-neutral-400">
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
                <tbody className="divide-y divide-black/10 dark:divide-white/10">
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
                        className="group cursor-pointer transition hover:bg-neutral-50 dark:hover:bg-[#101014]"
                        title="Click to inspect Project details"
                      >
                        <td className="py-3.5 pr-4">
                          <p className="truncate font-bold text-neutral-950 group-hover:underline dark:text-white">
                            {p.title}
                          </p>
                          <p className="mt-0.5 tabular-nums text-[11px] text-neutral-500 dark:text-neutral-400">
                            {p.memberCount ?? 0} member(s)
                          </p>
                        </td>

                        <td
                          className="px-3 py-3.5 text-neutral-700 dark:text-neutral-300"
                          onClick={(e) => {
                            if (p.mentor?.id) {
                              e.stopPropagation();
                              setInspectMentorId(p.mentor.id);
                              setInspectProjectId(null);
                            }
                          }}
                        >
                          {p.mentor?.name ? (
                            <span className="font-semibold text-neutral-950 hover:underline dark:text-white">
                              {p.mentor.name}
                            </span>
                          ) : (
                            <span className="text-neutral-400 dark:text-neutral-500">
                              Unassigned
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-3.5 text-neutral-700 dark:text-neutral-300">
                          {p.teamLeader?.name || "—"}
                        </td>

                        <td className="px-3 py-3.5">
                          <NeutralBadge>{resolveProjectStatus(p)}</NeutralBadge>
                        </td>

                        <td className="px-3 py-3.5 tabular-nums text-neutral-600 dark:text-neutral-400">
                          <span
                            className={
                              isPastDue
                                ? "font-bold underline decoration-neutral-400 underline-offset-2 text-neutral-950 dark:text-white"
                                : ""
                            }
                          >
                            {formatDate(p.deadline)}
                          </span>
                        </td>

                        <td className="px-3 py-3.5">
                          <ProgressBar
                            value={calculateProjectProgress(p)}
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
        studentId={inspectStudentId}
        onClose={() => {
          setInspectProjectId(null);
          setInspectMentorId(null);
          setInspectStudentId(null);
        }}
        onSelectProject={(pid) => {
          setInspectMentorId(null);
          setInspectStudentId(null);
          setInspectProjectId(pid);
        }}
        onSelectMentor={(mid) => {
          setInspectProjectId(null);
          setInspectStudentId(null);
          setInspectMentorId(mid);
        }}
        onSelectStudent={(sid) => {
          setInspectProjectId(null);
          setInspectMentorId(null);
          setInspectStudentId(sid);
        }}
      />
    </div>
  );
}