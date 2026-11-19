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
} from "lucide-react";

import api from "../../services/api";
import { calculateProjectProgress, formatDate, getErrorMessage, resolveProjectStatus } from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  StatusBadge,
  portalInputClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

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
      .then((res) => setMentors(res.data?.mentors || []))
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
      setTeams(res.data?.teams || []);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load teams and projects."));
    } finally {
      setLoading(false);
    }
  }, [debounced, mentorFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
            Administration · Teams &amp; Projects
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Teams &amp; Projects Directory
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {teams.length} team(s) registered. Click any team to open full Project Details, deliverables, tasks, and mentor assignment.
          </p>
        </div>

        <button type="button" onClick={load} disabled={loading} className={portalSecondaryBtnClass}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />

      <div className="grid gap-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-2xs md:grid-cols-3">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team, project, leader, or mentor..."
            className={`${portalInputClass} pl-10`}
          />
        </div>

        <select value={mentorFilter} onChange={(e) => setMentorFilter(e.target.value)} className={portalInputClass}>
          <option value="">All Mentors</option>
          {mentors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={portalInputClass}>
          <option value="all">All Statuses</option>
          <option value="Planning">Planning</option>
          <option value="In Progress">In Progress</option>
          <option value="On Hold">On Hold</option>
          <option value="Completed">Completed</option>
        </select>
      </div>

      {loading ? (
        <LoadingState label="Loading institute teams..." />
      ) : teams.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No teams found" description="Try broadening your filters." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <Link
              key={t.id}
              to={`/admin/teams/${t.id}`}
              className="group flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-[#15803D]/55 dark:hover:border-[#A3E635]/55"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="line-clamp-1 text-base font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-text)]">
                    {t.title}
                  </h2>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {t.isOverdue && (
                      <span title="Overdue" className="text-rose-500">
                        <AlertTriangle size={15} />
                      </span>
                    )}
                    <StatusBadge status={resolveProjectStatus(t)} />
                  </div>
                </div>

                {t.description && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {t.description}
                  </p>
                )}

                <div className="mt-4 space-y-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <Award size={13} /> Mentor
                    </span>
                    <span className="truncate font-bold text-[var(--text-primary)]">
                      {t.mentor?.name || "Unassigned"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <Crown size={13} className="text-amber-500" /> Leader
                    </span>
                    <span className="truncate font-bold text-[var(--text-primary)]">
                      {t.teamLeader?.name || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <Users size={13} /> Members
                    </span>
                    <span className="font-bold text-[var(--text-primary)]">{t.memberCount} student(s)</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <CalendarClock size={13} /> Deadline
                    </span>
                    <span className={`font-bold ${t.isOverdue ? "text-rose-500" : "text-[var(--text-primary)]"}`}>
                      {formatDate(t.deadline)}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
                    <span className="text-[var(--text-muted)]">
                      Progress · Tasks {t.taskProgress?.completed || 0}/{t.taskProgress?.total || 0}
                    </span>
                  </div>
                  <ProgressBar value={calculateProjectProgress(t)} showLabel height="h-2" />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-xs font-bold text-[var(--accent-text)]">
                <span>Open Full Details</span>
                <ArrowUpRight size={15} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
