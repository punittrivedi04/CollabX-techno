import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Award,
  FolderKanban,
  GraduationCap,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";

import api from "../../services/api";
import { getErrorMessage, getInitials } from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  portalInputClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

function NeutralStatusBadge({ active }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-black/12 bg-neutral-50 px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#101014] dark:text-neutral-200">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active
            ? "bg-neutral-900 dark:bg-white"
            : "bg-neutral-400 dark:bg-neutral-600"
        }`}
      />
      <span>{active ? "Active" : "Inactive"}</span>
    </span>
  );
}

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
      setMentors(Array.isArray(res.data?.mentors) ? res.data.mentors : []);
    } catch (err) {
      setMentors([]);
      setError(getErrorMessage(err, "Unable to load mentors."));
    } finally {
      setLoading(false);
    }
  }, [debounced, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Administration · Faculty Mentors
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            Mentor Management
          </h1>
          <p className="mt-1 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
            {mentors.length} mentor account(s) guiding student teams and projects.
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

      {/* Search & Status Filter */}
      <div className="grid gap-3 rounded-2xl border border-black/12 bg-white p-4 shadow-2xs dark:border-white/12 dark:bg-[#08080A] sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search
            size={15}
            strokeWidth={1.85}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mentor by name or email..."
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Mentor Cards Grid */}
      {loading ? (
        <LoadingState label="Loading mentors..." />
      ) : mentors.length === 0 ? (
        <div className="rounded-2xl border border-black/12 bg-white p-6 dark:border-white/12 dark:bg-[#08080A]">
          <EmptyState
            icon={Award}
            title="No mentors found"
            description="Try adjusting your search or promote a student in Role Management."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mentors.map((m) => {
            const studentCount = Number(m.assignedStudentCount ?? m.studentCount ?? 0);
            const teamCount = Number(m.teamCount ?? 0);
            const activeProjects = Number(m.activeProjectCount ?? m.activeProjects ?? 0);

            return (
              <Link
                key={m.id}
                to={`/admin/mentors/${m.id}`}
                className="group flex flex-col justify-between rounded-2xl border border-black/12 bg-white p-5 shadow-2xs transition hover:border-black/35 dark:border-white/12 dark:bg-[#08080A] dark:hover:border-white/35"
              >
                <div>
                  {/* Top Row: Avatar, Name, Email & Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-neutral-100 text-xs font-extrabold text-neutral-900 dark:border-white/14 dark:bg-[#101014] dark:text-white">
                        {getInitials(m.name)}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-extrabold text-neutral-950 group-hover:underline dark:text-white">
                          {m.name}
                        </h2>
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {m.email}
                        </p>
                      </div>
                    </div>
                    <NeutralStatusBadge active={Boolean(m.is_active)} />
                  </div>

                  {/* Metrics Grid: Students, Teams, Active Projects */}
                  <div className="mt-5 grid grid-cols-3 gap-2.5">
                    <div className="rounded-xl border border-black/10 bg-neutral-50 p-3 text-center dark:border-white/10 dark:bg-[#101014]">
                      <GraduationCap
                        size={15}
                        strokeWidth={1.85}
                        className="mx-auto text-neutral-600 dark:text-neutral-400"
                      />
                      <p className="mt-1.5 text-base font-extrabold tabular-nums text-neutral-950 dark:text-white">
                        {studentCount}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        Students
                      </p>
                    </div>

                    <div className="rounded-xl border border-black/10 bg-neutral-50 p-3 text-center dark:border-white/10 dark:bg-[#101014]">
                      <Users
                        size={15}
                        strokeWidth={1.85}
                        className="mx-auto text-neutral-600 dark:text-neutral-400"
                      />
                      <p className="mt-1.5 text-base font-extrabold tabular-nums text-neutral-950 dark:text-white">
                        {teamCount}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        Teams
                      </p>
                    </div>

                    <div className="rounded-xl border border-black/10 bg-neutral-50 p-3 text-center dark:border-white/10 dark:bg-[#101014]">
                      <FolderKanban
                        size={15}
                        strokeWidth={1.85}
                        className="mx-auto text-neutral-600 dark:text-neutral-400"
                      />
                      <p className="mt-1.5 text-base font-extrabold tabular-nums text-neutral-950 dark:text-white">
                        {activeProjects}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        Active
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-4 flex items-center justify-between border-t border-black/10 pt-3 text-xs font-bold text-neutral-800 transition group-hover:text-neutral-950 dark:border-white/10 dark:text-neutral-300 dark:group-hover:text-white">
                  <span>Inspect Mentor Details</span>
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