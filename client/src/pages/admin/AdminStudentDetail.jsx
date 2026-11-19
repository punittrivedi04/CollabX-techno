import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Award,
  CheckCircle2,
  FolderKanban,
  Mail,
  Phone,
  Power,
  UserCog,
} from "lucide-react";

import api from "../../services/api";
import { calculateProjectProgress, formatDate, getErrorMessage, getInitials, resolveProjectStatus, timeAgo } from "../../utils/portalHelpers";
import {
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  SectionCard,
  StatusBadge,
  SuccessAlert,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

export default function AdminStudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [confirmStatus, setConfirmStatus] = useState(false);
  const [confirmPromote, setConfirmPromote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const stuRes = await api.get(`/admin/students/${id}`);
      const payload = stuRes.data?.data || stuRes.data;
      setData(payload);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load student profile."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleStatus = async () => {
    if (saving || !data?.student) return;
    setSaving(true);
    setError("");
    try {
      await api.patch(`/admin/students/${id}/status`, { is_active: !data.student.is_active });
      setSuccess(data.student.is_active ? "Student deactivated and tokens revoked." : "Student activated.");
      setConfirmStatus(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to update status."));
    } finally {
      setSaving(false);
    }
  };

  const handlePromote = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api.patch(`/admin/users/${id}/role`, { role: "mentor" });
      setConfirmPromote(false);
      navigate(`/admin/mentors/${id}`, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to promote student."));
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading student profile..." />;

  if (!data?.student) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={error || "Student not found."} />
        <Link to="/admin/students" className={portalSecondaryBtnClass}>
          <ArrowLeft size={15} /> Back to Students
        </Link>
      </div>
    );
  }

  const { student, mentor, teams = [], tasks = [], taskProgress = {}, activityHistory = [] } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/students" className={portalSecondaryBtnClass}>
          <ArrowLeft size={15} /> Back to Students
        </Link>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirmPromote(true)} className={portalSecondaryBtnClass}>
            <UserCog size={14} /> Promote to Mentor
          </button>
          <button type="button" onClick={() => setConfirmStatus(true)} className={portalPrimaryBtnClass}>
            <Power size={14} /> {student.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {/* Hero Profile Card */}
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xs">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#141A17] text-lg font-extrabold text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]">
              {getInitials(student.name)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold text-[var(--text-primary)]">{student.name}</h1>
                <StatusBadge status={student.is_active ? "Active" : "Inactive"} />
                {!student.role_classified && <StatusBadge status="Unclassified" />}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={13} /> {student.email}
                </span>
                {(student.roll_no || student.rollNumber) && (
                  <span className="inline-flex items-center rounded-full bg-[var(--bg-surface-elevated)] px-2.5 py-0.5 font-mono font-bold text-[var(--text-primary)]">
                    Roll: {student.roll_no || student.rollNumber}
                  </span>
                )}
                {student.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={13} /> {student.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-4 py-3 text-xs">
            <p className="font-bold uppercase tracking-wider text-[var(--text-muted)]">Assigned Mentor</p>
            {mentor ? (
              <Link
                to={`/admin/mentors/${mentor.id}`}
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--accent-text)] hover:underline"
              >
                <Award size={15} /> {mentor.name}
              </Link>
            ) : (
              <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">Unassigned</p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            ["Teams / Projects", teams.length],
            ["Total Tasks", taskProgress.total ?? 0],
            ["Completed Tasks", taskProgress.completed ?? 0],
            ["Completion Rate", `${taskProgress.completionRate ?? 0}%`],
          ].map(([label, val]) => (
            <div key={label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5">
              <p className="text-[11px] font-bold uppercase text-[var(--text-muted)]">{label}</p>
              <p className="mt-1 text-xl font-extrabold text-[var(--text-primary)]">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Teams + Tasks */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Assigned Teams & Projects" subtitle="Click any team to inspect full details">
          {teams.length === 0 ? (
            <EmptyState icon={FolderKanban} title="No teams assigned" description="This student is not yet part of any project team." />
          ) : (
            <div className="space-y-3">
              {teams.map((t) => (
                <Link
                  key={t.id}
                  to={`/admin/teams/${t.id}`}
                  className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 transition hover:border-[#15803D]/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-extrabold text-[var(--text-primary)]">{t.title}</p>
                    <div className="flex items-center gap-1.5">
                      {t.isLeader && <StatusBadge status="Team Leader" />}
                      <StatusBadge status={resolveProjectStatus(t)} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Mentor: {t.mentor?.name || "Unassigned"} · Deadline: {formatDate(t.deadline)}
                  </p>
                  <div className="mt-2.5">
                    <ProgressBar value={calculateProjectProgress(t)} showLabel height="h-1.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Assigned Tasks" subtitle={`${taskProgress.completed || 0} of ${taskProgress.total || 0} completed`}>
          {tasks.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No tasks assigned" description="Tasks assigned to this student will appear here." />
          ) : (
            <div className="space-y-2.5">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-[var(--text-primary)]">{task.title}</p>
                    <StatusBadge status={task.status} />
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {task.project?.title || "Project"} · Priority: {task.priority} · Due {formatDate(task.dueDate)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Activity History */}
      <SectionCard title="Activity History" subtitle="Recent account and project timeline">
        {activityHistory.length === 0 ? (
          <EmptyState icon={Activity} title="No activity recorded yet" />
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {activityHistory.map((act) => (
              <div key={act.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{act.description}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {act.action} {act.projectTitle ? `· ${act.projectTitle}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{timeAgo(act.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={confirmStatus}
        onClose={() => setConfirmStatus(false)}
        onConfirm={handleToggleStatus}
        busy={saving}
        tone={student.is_active ? "danger" : "primary"}
        title={student.is_active ? "Deactivate Student?" : "Activate Student?"}
        message={
          student.is_active
            ? "This immediately revokes the student's active JWT tokens and blocks login."
            : "Restore login access for this student."
        }
      />

      <ConfirmDialog
        open={confirmPromote}
        onClose={() => setConfirmPromote(false)}
        onConfirm={handlePromote}
        busy={saving}
        title="Promote Student to Mentor?"
        confirmLabel="Promote to Mentor"
        message={`Promote ${student.name} to Mentor? Their session will be refreshed and logged in the audit trail.`}
      />
    </div>
  );
}
