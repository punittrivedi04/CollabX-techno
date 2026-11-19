import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, GraduationCap, RefreshCw, Search } from "lucide-react";

import api from "../../services/api";
import { getErrorMessage, getInitials } from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  StatusBadge,
  portalInputClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

export default function MentorStudents() {
  const [students, setStudents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    api
      .get("/mentor/teams")
      .then((res) => setTeams(res.data?.teams || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (debounced) params.search = debounced;
      if (teamFilter) params.teamId = teamFilter;
      const res = await api.get("/mentor/students", { params });
      setStudents(res.data?.students || []);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load your students."));
    } finally {
      setLoading(false);
    }
  }, [debounced, teamFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
            Mentor · Assigned Cohort
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            My Students
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {students.length} assigned student(s) across your mentored teams.
          </p>
        </div>

        <button type="button" onClick={load} disabled={loading} className={portalSecondaryBtnClass}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />

      <div className="grid gap-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-2xs sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student name, email, or roll number..."
            className={`${portalInputClass} pl-10`}
          />
        </div>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className={portalInputClass}>
          <option value="">All My Teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingState label="Loading your students..." />
      ) : students.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No students found"
          description="Students assigned to you or enrolled in your teams will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-4 py-3.5">Roll No</th>
                  <th className="px-4 py-3.5">Team / Project</th>
                  <th className="px-4 py-3.5">Task Progress</th>
                  <th className="px-5 py-3.5 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {students.map((s) => (
                  <tr key={s.id} className="transition hover:bg-[var(--bg-surface-elevated)]/70">
                    <td className="px-5 py-3.5">
                      <Link to={`/mentor/students/${s.id}`} className="group flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#141A17] text-[11px] font-bold text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]">
                          {getInitials(s.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-text)]">
                            {s.name}
                          </p>
                          <p className="truncate text-[11px] text-[var(--text-muted)]">
                            {s.email} {(s.roll_no || s.rollNumber) ? `· ${s.roll_no || s.rollNumber}` : ""}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-[var(--text-secondary)]">
                      {s.roll_no || s.rollNumber || "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      {s.team ? (
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/mentor/teams/${s.team.id}`}
                            className="font-bold text-[var(--text-primary)] hover:text-[var(--accent-text)] hover:underline"
                          >
                            {s.team.title}
                          </Link>
                          {s.team.isLeader && <StatusBadge status="Leader" />}
                        </div>
                      ) : (
                        <span className="text-[var(--text-muted)]">No project yet</span>
                      )}
                    </td>
                    <td className="w-48 px-4 py-3.5">
                      <ProgressBar value={s.taskProgress?.completionRate || 0} showLabel height="h-1.5" />
                      <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                        {s.taskProgress?.completed || 0}/{s.taskProgress?.total || 0} tasks done
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/mentor/students/${s.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-3.5 py-1.5 text-[11px] font-bold text-[var(--accent-text)] transition hover:border-[#15803D]"
                      >
                        <Eye size={13} /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
