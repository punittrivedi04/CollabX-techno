import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  FolderKanban,
  GraduationCap,
  Mail,
  RefreshCw,
  Search,
  User,
  Users,
} from "lucide-react";

import api from "../../services/api";
import {
  formatDate,
  getErrorMessage,
  getInitials,
} from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  SectionCard,
  portalInputClass,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";
import DirectorInspectDrawer from "./DirectorInspectDrawer";

function NeutralPill({ label, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200 ${className}`}
    >
      {label}
    </span>
  );
}

export default function DirectorStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  // Quick project inspect drawer
  const [inspectProjectId, setInspectProjectId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadStudents = useCallback(async (bg = false) => {
    if (bg) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const params = { page, limit: 20 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== "all") params.status = statusFilter;

      const res = await api.get("/director/students", { params });
      const rawStudents = Array.isArray(res.data?.students) ? res.data.students : [];
      setStudents(rawStudents);
      setPagination({
        total: Number(res.data?.pagination?.total) || 0,
        totalPages: Math.max(1, Number(res.data?.pagination?.totalPages) || 1),
      });
    } catch (err) {
      setStudents([]);
      setError(getErrorMessage(err, "Unable to load student directory."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const totalStudentsCount = pagination.total;
  const activeCount = students.filter((s) => s.isActive || s.is_active).length;
  const withProjectsCount = students.filter((s) => (s.projectCount || 0) > 0).length;

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Techno NJR · Executive Director Portal
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            Student Directory & Projects
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-sm">
            Institutional overview of all engineering students, assigned projects, faculty mentors, and milestones.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadStudents(true)}
            disabled={refreshing || loading}
            className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-800 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-neutral-200 dark:hover:!bg-[#141418]`}
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />

      {/* KPI Highlights */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#08080A]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-neutral-100 text-neutral-900 dark:border-white/10 dark:bg-[#101014] dark:text-white">
              <GraduationCap size={18} strokeWidth={1.85} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Total Students Enrolled
              </p>
              <p className="text-xl font-extrabold tabular-nums text-neutral-950 dark:text-white">
                {totalStudentsCount}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#08080A]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-neutral-100 text-neutral-900 dark:border-white/10 dark:bg-[#101014] dark:text-white">
              <FolderKanban size={18} strokeWidth={1.85} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Engaged in Projects
              </p>
              <p className="text-xl font-extrabold tabular-nums text-neutral-950 dark:text-white">
                {withProjectsCount} <span className="text-xs font-normal text-neutral-500">on this page</span>
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#08080A]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-neutral-100 text-neutral-900 dark:border-white/10 dark:bg-[#101014] dark:text-white">
              <CheckCircle2 size={18} strokeWidth={1.85} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Active Institutional Accounts
              </p>
              <p className="text-xl font-extrabold tabular-nums text-neutral-950 dark:text-white">
                {activeCount} <span className="text-xs font-normal text-neutral-500">active</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#08080A] sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student by name, roll number, or email..."
            className={`${portalInputClass} pl-10 text-xs sm:text-sm`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {["all", "active", "inactive"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition capitalize ${
                statusFilter === st
                  ? "bg-neutral-950 text-white dark:bg-white dark:text-black"
                  : "border border-black/10 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-300 dark:hover:bg-[#18181e]"
              }`}
            >
              {st === "all" ? "All Students" : st}
            </button>
          ))}
        </div>
      </div>

      {/* Students List */}
      {loading ? (
        <LoadingState label="Loading students & project affiliations..." />
      ) : students.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No students found"
          description={
            debouncedSearch
              ? `No student matching "${debouncedSearch}" was found. Try adjusting your search query.`
              : "No students currently match the selected criteria."
          }
        />
      ) : (
        <div className="grid gap-4">
          {students.map((student) => {
            const projects = Array.isArray(student.projects) ? student.projects : [];
            const projectCount = student.projectCount || projects.length;

            return (
              <div
                key={student.id}
                className="group rounded-2xl border border-black/10 bg-white p-5 shadow-2xs transition hover:border-black/30 dark:border-white/10 dark:bg-[#08080A] dark:hover:border-white/30"
              >
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  {/* Left: Student Identity */}
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-black/10 bg-neutral-100 text-sm font-extrabold text-neutral-900 dark:border-white/15 dark:bg-[#121218] dark:text-white">
                      {getInitials(student.name)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/director/students/${student.id}`}
                          className="text-base font-extrabold text-neutral-950 hover:underline dark:text-white"
                        >
                          {student.name}
                        </Link>
                        <NeutralPill
                          label={student.isActive || student.is_active ? "Active" : "Inactive"}
                        />
                        {student.department && (
                          <span className="inline-flex items-center rounded-md border border-black/10 bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-800 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-300">
                            {student.department}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
                        <span className="inline-flex items-center gap-1">
                          <Mail size={12} strokeWidth={1.85} />
                          <span>{student.email}</span>
                        </span>
                        {(student.roll_no || student.rollNumber) && (
                          <span className="font-mono font-medium">
                            Roll: {student.roll_no || student.rollNumber}
                          </span>
                        )}
                        {student.mentor && (
                          <span className="inline-flex items-center gap-1 text-neutral-700 dark:text-neutral-300">
                            <Award size={12} strokeWidth={1.85} />
                            <span>Mentor: <strong>{student.mentor.name}</strong></span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2.5">
                    <Link
                      to={`/director/students/${student.id}`}
                      className={`${portalPrimaryBtnClass} rounded-xl px-4 py-2 text-xs font-bold dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
                    >
                      <span>Full Inspection</span>
                      <ArrowRight size={14} strokeWidth={2} />
                    </Link>
                  </div>
                </div>

                {/* Projects Section: "Kitne project per kaam karra hai" */}
                <div className="mt-4 border-t border-black/8 pt-3.5 dark:border-white/8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Projects Working On ({projectCount})
                    </span>
                    {student.totalTasks > 0 && (
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Tasks: <strong>{student.completedTasks}</strong>/{student.totalTasks} completed ({student.taskCompletionRate}%)
                      </span>
                    )}
                  </div>

                  {projects.length === 0 ? (
                    <p className="mt-2 text-xs italic text-neutral-400 dark:text-neutral-500">
                      Not currently assigned to any project team.
                    </p>
                  ) : (
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {projects.map((proj) => (
                        <div
                          key={proj.id}
                          onClick={() => setInspectProjectId(proj.id)}
                          className="cursor-pointer rounded-xl border border-black/10 bg-neutral-50 p-3 transition hover:border-black/35 hover:bg-neutral-100 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35 dark:hover:bg-[#16161c]"
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <p className="line-clamp-1 text-xs font-bold text-neutral-950 dark:text-white">
                              {proj.title}
                            </p>
                            <span className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-[9px] font-bold text-neutral-700 dark:bg-white/10 dark:text-neutral-300">
                              {proj.status || "In Progress"}
                            </span>
                          </div>

                          <div className="mt-2">
                            <ProgressBar
                              value={Number(proj.progress || 0)}
                              showLabel
                              height="h-1.5"
                            />
                          </div>

                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400">
                            <span>Deadline: {formatDate(proj.deadline)}</span>
                            <span className="text-neutral-700 underline dark:text-neutral-300">
                              Quick View
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-black/10 pt-4 dark:border-white/10">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Showing Page <strong>{page}</strong> of <strong>{pagination.totalPages}</strong> (Total {pagination.total} students)
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={`${portalSecondaryBtnClass} rounded-xl px-3 py-1.5 text-xs disabled:opacity-40`}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              className={`${portalSecondaryBtnClass} rounded-xl px-3 py-1.5 text-xs disabled:opacity-40`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Executive Project Inspect Drawer */}
      <DirectorInspectDrawer
        projectId={inspectProjectId}
        onClose={() => setInspectProjectId(null)}
      />
    </div>
  );
}
