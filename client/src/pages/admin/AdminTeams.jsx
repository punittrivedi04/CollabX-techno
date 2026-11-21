import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  CalendarClock,
  Crown,
  FolderKanban,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";

import api from "../../services/api";
import {
  calculateProjectProgress,
  formatDate,
  getErrorMessage,
  resolveProjectStatus,
} from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  portalInputClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

function NeutralStatusBadge({ label }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200">
      {label}
    </span>
  );
}

export default function AdminTeams() {
  const [teams, setTeams] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [mentorFilter, setMentorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    api
      .get("/admin/mentors")
      .then((res) =>
        setMentors(Array.isArray(res.data?.mentors) ? res.data.mentors : []),
      )
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (debounced) params.search = debounced;
      if (mentorFilter) params.mentorId = mentorFilter;
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await api.get("/admin/teams", { params });
      setTeams(Array.isArray(res.data?.teams) ? res.data.teams : []);
    } catch (err) {
      setTeams([]);
      setError(getErrorMessage(err, "Unable to load teams and projects."));
    } finally {
      setLoading(false);
    }
  }, [debounced, mentorFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Administration · Teams &amp; Projects
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            Teams &amp; Projects Directory
          </h1>
          <p className="mt-1 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
            {teams.length} team(s) registered. Click any team to open full
            Project Details, deliverables, tasks, and mentor assignment.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className={`${portalSecondaryBtnClass} self-start rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418] sm:self-auto`}
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

      {/* Search & Filters */}
      <div className="grid gap-3 rounded-2xl border border-black/12 bg-white p-4 shadow-2xs dark:border-white/12 dark:bg-[#08080A] md:grid-cols-3">
        <div className="relative">
          <Search
            size={15}
            strokeWidth={1.85}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team, project, leader, or mentor..."
            className={`${portalInputClass} rounded-xl pl-10 pr-9 dark:!border-white/12 dark:!bg-[#101014] dark:!text-white dark:placeholder:!text-neutral-500`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>

        <select
          value={mentorFilter}
          onChange={(e) => setMentorFilter(e.target.value)}
          className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
        >
          <option value="">All Mentors</option>
          {mentors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
        >
          <option value="all">All Statuses</option>
          <option value="Planning">Planning</option>
          <option value="In Progress">In Progress</option>
          <option value="On Hold">On Hold</option>
          <option value="Completed">Completed</option>
        </select>
      </div>

      {/* Teams Grid */}
      {loading ? (
        <LoadingState label="Loading institute teams..." />
      ) : teams.length === 0 ? (
        <div className="rounded-2xl border border-black/12 bg-white p-6 dark:border-white/12 dark:bg-[#08080A]">
          <EmptyState
            icon={FolderKanban}
            title="No teams found"
            description="Try broadening your filters."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => {
            const memberCount =
              Number(t.memberCount) ||
              (Array.isArray(t.members) ? t.members.length : 0);
            const completedTasks = Number(t.taskProgress?.completed) || 0;
            const totalTasks = Number(t.taskProgress?.total) || 0;

            return (
              <Link
                key={t.id}
                to={`/admin/teams/${t.id}`}
                className="group flex flex-col justify-between rounded-2xl border border-black/12 bg-white p-5 shadow-2xs transition hover:border-black/35 dark:border-white/12 dark:bg-[#08080A] dark:hover:border-white/35"
              >
                <div>
                  {/* Title & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="line-clamp-1 text-base font-extrabold text-neutral-950 group-hover:underline dark:text-white">
                      {t.title}
                    </h2>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {t.isOverdue && (
                        <span
                          title="Overdue"
                          className="inline-flex items-center text-neutral-700 dark:text-neutral-300"
                        >
                          <AlertTriangle size={14} strokeWidth={1.9} />
                        </span>
                      )}
                      <NeutralStatusBadge label={resolveProjectStatus(t)} />
                    </div>
                  </div>

                  {t.description && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                      {t.description}
                    </p>
                  )}

                  {/* Metadata Block */}
                  <div className="mt-4 space-y-2 rounded-xl border border-black/10 bg-neutral-50 p-3 text-xs dark:border-white/10 dark:bg-[#101014]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                        <Award size={13} strokeWidth={1.85} />
                        <span>Mentor</span>
                      </span>
                      <span className="truncate font-bold text-neutral-950 dark:text-white">
                        {t.mentor?.name || "Unassigned"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-black/10 pt-1.5 dark:border-white/10">
                      <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                        <Crown size={13} strokeWidth={1.85} />
                        <span>Leader</span>
                      </span>
                      <span className="truncate font-bold text-neutral-950 dark:text-white">
                        {t.teamLeader?.name || "—"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-black/10 pt-1.5 dark:border-white/10">
                      <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                        <Users size={13} strokeWidth={1.85} />
                        <span>Members</span>
                      </span>
                      <span className="font-bold tabular-nums text-neutral-950 dark:text-white">
                        {memberCount} student(s)
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-black/10 pt-1.5 dark:border-white/10">
                      <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                        <CalendarClock size={13} strokeWidth={1.85} />
                        <span>Deadline</span>
                      </span>
                      <span
                        className={`font-bold tabular-nums ${
                          t.isOverdue
                            ? "underline decoration-neutral-400 underline-offset-2 text-neutral-950 dark:text-white"
                            : "text-neutral-950 dark:text-white"
                        }`}
                      >
                        {formatDate(t.deadline)}
                      </span>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-bold tabular-nums">
                      <span className="text-neutral-500 dark:text-neutral-400">
                        Progress · Tasks {completedTasks}/{totalTasks}
                      </span>
                    </div>
                    <ProgressBar
                      value={calculateProjectProgress(t)}
                      showLabel
                      height="h-1.5"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-4 flex items-center justify-between border-t border-black/10 pt-3 text-xs font-bold text-neutral-800 transition group-hover:text-neutral-950 dark:border-white/10 dark:text-neutral-300 dark:group-hover:text-white">
                  <span>Open Full Details</span>
                  <ArrowUpRight
                    size={15}
                    strokeWidth={1.85}
                    className="text-neutral-400 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-neutral-950 dark:text-neutral-500 dark:group-hover:text-white"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}