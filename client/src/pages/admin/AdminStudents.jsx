import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Eye,
  GraduationCap,
  Pencil,
  Power,
  RefreshCw,
  Search,
  Trash2,
  UserCog,
  UserPlus,
} from "lucide-react";

import api from "../../services/api";
import { getErrorMessage, getInitials } from "../../utils/portalHelpers";
import {
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  ProgressBar,
  SuccessAlert,
  portalInputClass,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

const EMPTY_FORM = {
  name: "",
  email: "",
  roll_no: "",
  institution: "Techno NJR Institute of Technology",
  password: "",
};

function NeutralStatusPill({ label }) {
  return (
    <span className="inline-flex items-center rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200">
      {label}
    </span>
  );
}

export default function AdminStudents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [teams, setTeams] = useState([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Add / Edit Student modal
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Activate / Deactivate confirmation
  const [statusTarget, setStatusTarget] = useState(null);

  // Promote Student -> Mentor confirmation
  const [promoteTarget, setPromoteTarget] = useState(null);

  // Delete Student confirmation
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [deletingStudent, setDeletingStudent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setEditingStudent(null);
      setForm(EMPTY_FORM);
      setShowForm(true);
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    api
      .get("/admin/teams")
      .then((tRes) => {
        setTeams(Array.isArray(tRes.data?.teams) ? tRes.data.teams : []);
      })
      .catch(() => {});
  }, []);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page,
        limit: 25,
        status: String(statusFilter || "all").trim().toLowerCase(),
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (teamFilter) params.teamId = teamFilter;

      const res = await api.get("/admin/students", { params });
      const rawStudents = Array.isArray(res.data?.students) ? res.data.students : [];
      const uniqueStudents = Array.from(new Map(rawStudents.map((s) => [s.id, s])).values());
      setStudents(uniqueStudents);
      setPagination({
        total: Number(res.data?.totalMatching ?? res.data?.pagination?.total) || 0,
        totalPages: Math.max(1, Number(res.data?.pagination?.totalPages) || 1),
      });
    } catch (err) {
      setStudents([]);
      setError(getErrorMessage(err, "Unable to load students."));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, teamFilter, statusFilter]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const openAdd = () => {
    setEditingStudent(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  };

  const openEdit = (stu) => {
    setEditingStudent(stu);
    setForm({
      name: stu.name || "",
      email: stu.email || "",
      roll_no: stu.roll_no || stu.rollNumber || "",
      institution: stu.institution || "Techno NJR Institute of Technology",
      password: "",
    });
    setError("");
    setShowForm(true);
  };

  const handleSaveStudent = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const cleanRoll = form.roll_no.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        roll_no: cleanRoll || null,
      };
      if (!editingStudent && form.password.trim()) {
        payload.password = form.password.trim();
      }

      if (editingStudent) {
        await api.put(`/admin/students/${editingStudent.id}`, payload);
        setSuccess(`Updated student profile for ${payload.name}.`);
      } else {
        await api.post("/admin/students", payload);
        setSuccess(`Created student account for ${payload.name}.`);
      }
      setShowForm(false);
      await loadStudents();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save student."));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const nextActive = !statusTarget.is_active;
      await api.patch(`/admin/students/${statusTarget.id}/status`, { is_active: nextActive });
      setSuccess(
        nextActive
          ? `${statusTarget.name}'s account has been activated.`
          : `${statusTarget.name}'s account has been deactivated and active sessions revoked.`,
      );
      setStatusTarget(null);
      await loadStudents();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to update student status."));
    } finally {
      setSaving(false);
    }
  };

  const handlePromoteToMentor = async () => {
    if (!promoteTarget) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch(`/admin/users/${promoteTarget.id}/role`, { role: "mentor" });
      setSuccess(`${promoteTarget.name} has been promoted to Mentor and classified.`);
      setPromoteTarget(null);
      await loadStudents();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to promote student."));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (deletingStudent || !studentToDelete) return;
    setDeletingStudent(true);
    setError("");
    setSuccess("");
    try {
      await api.delete(`/admin/users/${studentToDelete.id}`);
      setSuccess(`Student account "${studentToDelete.name}" deleted cleanly.`);
      setStudentToDelete(null);
      await loadStudents();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete student account."));
    } finally {
      setDeletingStudent(false);
    }
  };

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Administration · Student Directory
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            Student Management
          </h1>
          <p className="mt-1 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
            {pagination.total} matching
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openAdd}
            className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
          >
            <UserPlus size={15} strokeWidth={1.85} />
            <span>Add Student</span>
          </button>
          <button
            type="button"
            onClick={loadStudents}
            disabled={loading}
            className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#0A0A0C] dark:!text-white dark:hover:!bg-[#141418]`}
          >
            <RefreshCw
              size={15}
              strokeWidth={1.85}
              className={loading ? "animate-spin" : ""}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

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
            placeholder="Search name, email, roll no..."
            className={`${portalInputClass} rounded-xl pl-10 dark:!border-white/12 dark:!bg-[#101014] dark:!text-white dark:placeholder:!text-neutral-500`}
          />
        </div>

        <select
          value={teamFilter}
          onChange={(e) => {
            setTeamFilter(e.target.value);
            setPage(1);
          }}
          className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
        >
          <option value="">All Teams / Projects</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="unclassified">Unclassified</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingState label="Loading students..." />
      ) : students.length === 0 ? (
        <div className="rounded-2xl border border-black/12 bg-white p-6 dark:border-white/12 dark:bg-[#08080A]">
          <EmptyState
            icon={GraduationCap}
            title="No matching students"
            description="Try clearing filters or add a new student account."
            action={
              <button
                type="button"
                onClick={openAdd}
                className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
              >
                <UserPlus size={15} strokeWidth={1.85} />
                <span>Add Student</span>
              </button>
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-black/12 bg-white shadow-2xs dark:border-white/12 dark:bg-[#08080A]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-black/10 bg-neutral-50 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-400">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-4 py-3.5">Team / Project</th>
                  <th className="px-4 py-3.5">Task Progress</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {students.map((s) => {
                  const roll = s.roll_no || s.rollNumber;
                  const completedTasks = Number(s.taskProgress?.completed) || 0;
                  const totalTasks = Number(s.taskProgress?.total) || 0;
                  const completionRate = Number(s.taskProgress?.completionRate) || 0;

                  const projectCount =
                    typeof s.projectCount === "number"
                      ? s.projectCount
                      : typeof s.teamsCount === "number"
                        ? s.teamsCount
                        : Array.isArray(s.teams)
                          ? s.teams.length
                          : s.team
                            ? 1
                            : 0;

                  const isLeader =
                    Boolean(s.isLeader) ||
                    (Array.isArray(s.teams) && s.teams.some((t) => t.isLeader)) ||
                    Boolean(s.team?.isLeader);

                  const leaderCount =
                    typeof s.leaderProjectsCount === "number"
                      ? s.leaderProjectsCount
                      : Array.isArray(s.teams)
                        ? s.teams.filter((t) => t.isLeader).length
                        : isLeader
                          ? 1
                          : 0;

                  return (
                    <tr
                      key={s.id}
                      className="transition hover:bg-neutral-50/80 dark:hover:bg-[#101014]/70"
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/admin/students/${s.id}`}
                          className="group flex items-center gap-3"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-neutral-100 text-[11px] font-extrabold text-neutral-900 dark:border-white/14 dark:bg-[#101014] dark:text-white">
                            {getInitials(s.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate font-bold text-neutral-950 group-hover:underline dark:text-white">
                                {s.name}
                              </p>
                              {roll && (
                                <span className="rounded-md border border-black/10 bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-700 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300">
                                  Roll: {roll}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                              {s.email} {roll ? `· ${roll}` : ""}
                            </p>
                          </div>
                        </Link>
                      </td>

                      <td className="px-4 py-3.5">
                        {projectCount === 0 ? (
                          <span className="font-medium text-neutral-400 dark:text-neutral-500">
                            0 projects
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center rounded-md border border-black/10 bg-neutral-100 px-2.5 py-1 text-[11px] font-bold text-neutral-900 dark:border-white/12 dark:bg-[#101014] dark:text-white">
                              {projectCount} {projectCount === 1 ? "project" : "projects"}
                            </span>
                            {isLeader && (
                              <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300">
                                Leader{leaderCount > 1 ? ` (${leaderCount})` : ""}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="w-44 px-4 py-3.5">
                        <ProgressBar
                          value={completionRate}
                          showLabel
                          height="h-1.5"
                        />
                        <p className="mt-0.5 text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
                          {completedTasks}/{totalTasks} tasks
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          <NeutralStatusPill
                            label={s.is_active ? "Active" : "Inactive"}
                          />
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/admin/students/${s.id}`}
                            title="View Student Profile"
                            aria-label={`View ${s.name}`}
                            className="rounded-xl border border-black/12 bg-neutral-50 p-2 text-neutral-700 transition hover:border-black/35 hover:bg-neutral-100 hover:text-neutral-950 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-white/35 dark:hover:text-white"
                          >
                            <Eye size={14} strokeWidth={1.85} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => openEdit(s)}
                            title="Edit Student"
                            aria-label={`Edit ${s.name}`}
                            className="cursor-pointer rounded-xl border border-black/12 bg-neutral-50 p-2 text-neutral-700 transition hover:border-black/35 hover:bg-neutral-100 hover:text-neutral-950 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-white/35 dark:hover:text-white"
                          >
                            <Pencil size={14} strokeWidth={1.85} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPromoteTarget(s)}
                            title="Promote to Mentor"
                            aria-label={`Promote ${s.name} to Mentor`}
                            className="cursor-pointer rounded-xl border border-black/12 bg-neutral-50 p-2 text-neutral-700 transition hover:border-black/35 hover:bg-neutral-100 hover:text-neutral-950 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-white/35 dark:hover:text-white"
                          >
                            <UserCog size={14} strokeWidth={1.85} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatusTarget(s)}
                            title={
                              s.is_active
                                ? "Deactivate Account"
                                : "Activate Account"
                            }
                            aria-label={
                              s.is_active
                                ? `Deactivate ${s.name}`
                                : `Activate ${s.name}`
                            }
                            className="cursor-pointer rounded-xl border border-black/12 bg-neutral-50 p-2 text-neutral-700 transition hover:border-black/35 hover:bg-neutral-100 hover:text-neutral-950 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-white/35 dark:hover:text-white"
                          >
                            <Power size={14} strokeWidth={1.85} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setStudentToDelete(s)}
                            title="Delete Student Account"
                            aria-label={`Delete ${s.name}`}
                            className="cursor-pointer rounded-xl border border-black/12 bg-neutral-50 p-2 text-neutral-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-rose-900/50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          >
                            <Trash2 size={14} strokeWidth={1.85} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-black/10 px-5 py-3 text-xs dark:border-white/10">
              <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
                Page {page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Student Modal */}
      <Modal
        open={showForm}
        onClose={() => !saving && setShowForm(false)}
        title={editingStudent ? "Edit Student Account" : "Add New Student"}
        description="Student details are saved directly to PostgreSQL with allowlisted field validation."
      >
        <form onSubmit={handleSaveStudent} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Full Name *
            </label>
            <input
              required
              minLength={2}
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Aarav Sharma"
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Email Address *
            </label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="25etccs001@technonjr.org"
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Roll Number
            </label>
            <input
              maxLength={50}
              autoCapitalize="characters"
              value={form.roll_no}
              onChange={(e) =>
                setForm({
                  ...form,
                  roll_no: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
                })
              }
              placeholder="e.g. 25ETCCS149"
              className={`${portalInputClass} rounded-xl font-mono dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Institution
            </label>
            <input
              type="text"
              value={form.institution || "Techno NJR Institute of Technology"}
              disabled
              readOnly
              className="w-full cursor-not-allowed rounded-xl border border-black/10 bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-500 outline-none dark:border-white/10 dark:bg-[#101014]/80 dark:text-neutral-400"
            />
          </div>
          {!editingStudent && (
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                Initial Password (Optional — auto-generated if blank)
              </label>
              <input
                type="password"
                minLength={6}
                maxLength={128}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Minimum 6 characters"
                className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
              />
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={saving}
              className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
            >
              <span>
                {saving
                  ? "Saving..."
                  : editingStudent
                    ? "Save Changes"
                    : "Create Student"}
              </span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Activate / Deactivate Confirmation */}
      <ConfirmDialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleToggleStatus}
        busy={saving}
        tone={statusTarget?.is_active ? "danger" : "primary"}
        title={
          statusTarget?.is_active
            ? "Deactivate Student Account?"
            : "Activate Student Account?"
        }
        confirmLabel={
          statusTarget?.is_active
            ? "Deactivate & Revoke Sessions"
            : "Activate Account"
        }
        message={
          statusTarget?.is_active
            ? `Deactivating ${statusTarget.name} immediately revokes their active tokens and blocks sign-in until reactivated.`
            : `Re-activate ${statusTarget?.name}'s account so they can sign in again.`
        }
      />

      {/* Promote Student -> Mentor Confirmation */}
      <ConfirmDialog
        open={Boolean(promoteTarget)}
        onClose={() => setPromoteTarget(null)}
        onConfirm={handlePromoteToMentor}
        busy={saving}
        title="Promote Student to Mentor?"
        confirmLabel="Promote to Mentor"
        message={
          promoteTarget
            ? `Change ${promoteTarget.name} (${promoteTarget.email}) from Student to Faculty Mentor? This marks their account as classified, logs an audit entry, and revokes existing tokens so Mentor permissions apply on next login.`
            : ""
        }
      />

      {/* Delete Student Account Confirmation */}
      <ConfirmDialog
        open={Boolean(studentToDelete)}
        onClose={() => !deletingStudent && setStudentToDelete(null)}
        onConfirm={handleDeleteStudent}
        busy={deletingStudent}
        tone="danger"
        title="Delete Student Account Permanently"
        confirmLabel="Delete Account"
        message={
          studentToDelete
            ? `Are you sure you want to permanently delete the account for "${studentToDelete.name}" (${studentToDelete.email})? This safely removes or cleans up their squad memberships, unassigns their tasks, and revokes active access tokens. This action is irreversible.`
            : ""
        }
      />
    </div>
  );
}