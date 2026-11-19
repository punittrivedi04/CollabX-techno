import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Eye,
  GraduationCap,
  Pencil,
  Power,
  RefreshCw,
  Search,
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
  StatusBadge,
  SuccessAlert,
  portalInputClass,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

const EMPTY_FORM = {
  name: "",
  email: "",
  roll_no: "",
  institution: "Techno India NJR Institute of Technology",
  password: "",
};

export default function AdminStudents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [teams, setTeams] = useState([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mentorFilter, setMentorFilter] = useState("");
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
    Promise.all([api.get("/admin/mentors"), api.get("/admin/teams")])
      .then(([mRes, tRes]) => {
        setMentors(mRes.data?.mentors || []);
        setTeams(tRes.data?.teams || []);
      })
      .catch(() => {});
  }, []);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: 25 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (mentorFilter) params.mentorId = mentorFilter;
      if (teamFilter) params.teamId = teamFilter;
      if (statusFilter && statusFilter !== "all") params.status = statusFilter;

      const res = await api.get("/admin/students", { params });
      setStudents(res.data?.students || []);
      setPagination({
        total: res.data?.pagination?.total || 0,
        totalPages: Math.max(1, res.data?.pagination?.totalPages || 1),
      });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load students."));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, mentorFilter, teamFilter, statusFilter]);

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
      institution: stu.institution || "Techno India NJR Institute of Technology",
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
            Administration · Student Directory
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Student Management
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {pagination.total} student account(s) across teams, mentors, and projects.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={openAdd} className={portalPrimaryBtnClass}>
            <UserPlus size={15} />
            <span>Add Student</span>
          </button>
          <button type="button" onClick={loadStudents} disabled={loading} className={portalSecondaryBtnClass}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {/* Search & Filters */}
      <div className="grid gap-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-2xs md:grid-cols-4">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, roll no..."
            className={`${portalInputClass} pl-10`}
          />
        </div>

        <select
          value={mentorFilter}
          onChange={(e) => {
            setMentorFilter(e.target.value);
            setPage(1);
          }}
          className={portalInputClass}
        >
          <option value="">All Mentors</option>
          {mentors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <select
          value={teamFilter}
          onChange={(e) => {
            setTeamFilter(e.target.value);
            setPage(1);
          }}
          className={portalInputClass}
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
          className={portalInputClass}
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
        <EmptyState
          icon={GraduationCap}
          title="No matching students"
          description="Try clearing filters or add a new student account."
          action={
            <button type="button" onClick={openAdd} className={portalPrimaryBtnClass}>
              <UserPlus size={15} />
              <span>Add Student</span>
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-4 py-3.5">Mentor</th>
                  <th className="px-4 py-3.5">Team / Project</th>
                  <th className="px-4 py-3.5">Task Progress</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {students.map((s) => (
                  <tr key={s.id} className="transition hover:bg-[var(--bg-surface-elevated)]/70">
                    <td className="px-5 py-3.5">
                      <Link to={`/admin/students/${s.id}`} className="group flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#141A17] text-[11px] font-bold text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]">
                          {getInitials(s.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-text)]">
                              {s.name}
                            </p>
                            {(s.roll_no || s.rollNumber) && (
                              <span className="rounded-full bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--text-secondary)]">
                                Roll: {s.roll_no || s.rollNumber}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-[var(--text-muted)]">
                            {s.email} {(s.roll_no || s.rollNumber) ? `· ${s.roll_no || s.rollNumber}` : ""}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      {s.mentor ? (
                        <Link
                          to={`/admin/mentors/${s.mentor.id}`}
                          className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent-text)] hover:underline"
                        >
                          {s.mentor.name}
                        </Link>
                      ) : (
                        <span className="text-[var(--text-muted)]">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {s.team ? (
                        <Link
                          to={`/admin/teams/${s.team.id}`}
                          className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent-text)] hover:underline"
                        >
                          {s.team.title}
                        </Link>
                      ) : (
                        <span className="text-[var(--text-muted)]">No team</span>
                      )}
                    </td>
                    <td className="w-44 px-4 py-3.5">
                      <ProgressBar value={s.taskProgress?.completionRate || 0} showLabel height="h-1.5" />
                      <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                        {s.taskProgress?.completed || 0}/{s.taskProgress?.total || 0} tasks
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={s.is_active ? "Active" : "Inactive"} />
                        {!s.role_classified && <StatusBadge status="Unclassified" />}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to={`/admin/students/${s.id}`}
                          title="View Student Profile"
                          className="rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)] transition hover:border-[#15803D] hover:text-[var(--accent-text)]"
                        >
                          <Eye size={14} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          title="Edit Student"
                          className="rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)] transition hover:border-[#15803D] hover:text-[var(--accent-text)]"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPromoteTarget(s)}
                          title="Promote to Mentor"
                          className="rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)] transition hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-300"
                        >
                          <UserCog size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusTarget(s)}
                          title={s.is_active ? "Deactivate Account" : "Activate Account"}
                          className={`rounded-xl border border-[var(--border-subtle)] p-2 transition ${
                            s.is_active
                              ? "text-[var(--text-secondary)] hover:border-rose-500 hover:text-rose-500"
                              : "text-emerald-600 hover:border-emerald-500"
                          }`}
                        >
                          <Power size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-5 py-3 text-xs">
              <span className="text-[var(--text-muted)]">
                Page {page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className={portalSecondaryBtnClass}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className={portalSecondaryBtnClass}
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
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Full Name *
            </label>
            <input
              required
              minLength={2}
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Aarav Sharma"
              className={portalInputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Email Address *
            </label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="25etccs001@technonjr.org"
              className={portalInputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
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
              className={`${portalInputClass} font-mono`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Institution
            </label>
            <input
              type="text"
              value={form.institution || "Techno India NJR Institute of Technology"}
              disabled
              readOnly
              className="w-full cursor-not-allowed rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-[#EFF4F0]/80 dark:bg-[#0C120F]/85 px-4 py-2.5 text-sm font-medium text-[#5C6B66] dark:text-[#94A89D] outline-none"
            />
          </div>
          {!editingStudent && (
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Initial Password (Optional — auto-generated if blank)
              </label>
              <input
                type="password"
                minLength={6}
                maxLength={128}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Minimum 6 characters"
                className={portalInputClass}
              />
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button type="button" onClick={() => setShowForm(false)} disabled={saving} className={portalSecondaryBtnClass}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={portalPrimaryBtnClass}>
              {saving ? "Saving..." : editingStudent ? "Save Changes" : "Create Student"}
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
        title={statusTarget?.is_active ? "Deactivate Student Account?" : "Activate Student Account?"}
        confirmLabel={statusTarget?.is_active ? "Deactivate & Revoke Sessions" : "Activate Account"}
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
    </div>
  );
}
