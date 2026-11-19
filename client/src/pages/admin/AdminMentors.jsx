import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Award, FolderKanban, GraduationCap, RefreshCw, Search, Users } from "lucide-react";

import api from "../../services/api";
import { getErrorMessage, getInitials } from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  StatusBadge,
  portalInputClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

export default function AdminMentors() {
  const [mentors, setMentors] = useState([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (debounced) params.search = debounced;
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await api.get("/admin/mentors", { params });
      setMentors(res.data?.mentors || []);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load mentors."));
    } finally {
      setLoading(false);
    }
  }, [debounced, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
            Administration · Faculty Mentors
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Mentor Management
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {mentors.length} mentor account(s) guiding student teams and projects.
          </p>
        </div>

        <button type="button" onClick={load} disabled={loading} className={portalSecondaryBtnClass}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />

      <div className="grid gap-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-2xs sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mentor by name or email..."
            className={`${portalInputClass} pl-10`}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={portalInputClass}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading ? (
        <LoadingState label="Loading mentors..." />
      ) : mentors.length === 0 ? (
        <EmptyState icon={Award} title="No mentors found" description="Try adjusting your search or promote a student in Role Management." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mentors.map((m) => (
            <Link
              key={m.id}
              to={`/admin/mentors/${m.id}`}
              className="group flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-[#15803D]/55 dark:hover:border-[#A3E635]/55"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#141A17] text-sm font-extrabold text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]">
                      {getInitials(m.name)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-text)]">
                        {m.name}
                      </h2>
                      <p className="truncate text-xs text-[var(--text-muted)]">{m.email}</p>
                    </div>
                  </div>
                  <StatusBadge status={m.is_active ? "Active" : "Inactive"} />
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-[var(--bg-surface-elevated)] p-2.5 text-center">
                    <GraduationCap size={14} className="mx-auto text-[var(--accent-text)]" />
                    <p className="mt-1 text-base font-extrabold text-[var(--text-primary)]">{m.assignedStudentCount ?? 0}</p>
                    <p className="text-[10px] font-bold text-[var(--text-muted)]">Students</p>
                  </div>
                  <div className="rounded-2xl bg-[var(--bg-surface-elevated)] p-2.5 text-center">
                    <Users size={14} className="mx-auto text-teal-600 dark:text-teal-300" />
                    <p className="mt-1 text-base font-extrabold text-[var(--text-primary)]">{m.teamCount ?? 0}</p>
                    <p className="text-[10px] font-bold text-[var(--text-muted)]">Teams</p>
                  </div>
                  <div className="rounded-2xl bg-[var(--bg-surface-elevated)] p-2.5 text-center">
                    <FolderKanban size={14} className="mx-auto text-sky-600 dark:text-sky-300" />
                    <p className="mt-1 text-base font-extrabold text-[var(--text-primary)]">{m.activeProjectCount ?? 0}</p>
                    <p className="text-[10px] font-bold text-[var(--text-muted)]">Active</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-xs font-bold text-[var(--accent-text)]">
                <span>Inspect Mentor Details</span>
                <ArrowUpRight size={15} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
