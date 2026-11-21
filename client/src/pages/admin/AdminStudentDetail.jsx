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
import {
  calculateProjectProgress,
  formatDate,
  getErrorMessage,
  getInitials,
  resolveProjectStatus,
  timeAgo,
} from "../../utils/portalHelpers";
import {
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  SectionCard,
  SuccessAlert,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

function NeutralPill({ label }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200">
      {label}
    </span>
  );
}

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
      await api.patch(`/admin/students/${id}/status`, {
        is_active: !data.student.is_active,
      });
      setSuccess(
        data.student.is_active
          ? "Student deactivated and tokens revoked."
          : "Student activated.",
      );
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
      <div className="space-y-4 text-neutral-950 dark:text-white">
        <ErrorAlert message={error || "Student not found."} />
        <Link
          to="/admin/students"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to Students</span>
        </Link>
      </div>
    );
  }

  const {
    student,
    mentor,
    teams = [],
    tasks = [],
    taskProgress = {},
    activityHistory = [],
  } = data;

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/students"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to Students</span>
        </Link>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConfirmPromote(true)}
            className={`${portalSecondaryBtnClass} cursor-pointer rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
          >
            <UserCog size={14} strokeWidth={1.85} />
            <span>Promote to Mentor</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmStatus(true)}
            className={`${portalPrimaryBtnClass} cursor-pointer rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
          >
            <Power size={14} strokeWidth={1.85} />
            <span>{student.is_active ? "Deactivate" : "Activate"}</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {/* Hero Profile Card */}
      <div className="rounded-2xl border border-black/12 bg-white p-6 shadow-2xs dark:border-white/12 dark:bg-[#08080A]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border border-black/12 bg-neutral-100 text-base font-extrabold text-neutral-950 dark:border-white/15 dark:bg-[#101014] dark:text-white">
              {getInitials(student.name)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-neutral-950 dark:text-white">
                  {student.name}
                </h1>
                <NeutralPill label={student.is_active ? "Active" : "Inactive"} />
                {!student.role_classified && (
                  <NeutralPill label="Unclassified" />
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={13} strokeWidth={1.85} />
                  <span>{student.email}</span>
                </span>
                {(student.roll_no || student.rollNumber) && (
                  <span className="inline-flex items-center rounded-md border border-black/10 bg-neutral-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-neutral-800 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-200">
                    Roll: {student.roll_no || student.rollNumber}
                  </span>
                )}
                {student.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={13} strokeWidth={1.85} />
                    <span>{student.phone}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 text-xs dark:border-white/10 dark:bg-[#101014]">
            <p className="font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Assigned Mentor
            </p>
            {mentor ? (
              <Link
                to={`/admin/mentors/${mentor.id}`}
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-extrabold text-neutral-950 hover:underline dark:text-white"
              >
                <Award size={15} strokeWidth={1.85} />
                <span>{mentor.name}</span>
              </Link>
            ) : (
              <p className="mt-1 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                Unassigned
              </p>
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
            <div
              key={label}
              className="rounded-xl border border-black/10 bg-neutral-50 p-3.5 dark:border-white/10 dark:bg-[#101014]"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {label}
              </p>
              <p className="mt-1 text-xl font-extrabold tabular-nums text-neutral-950 dark:text-white">
                {val}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Teams + Tasks */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Assigned Teams & Projects"
          subtitle="Click any team to inspect full details"
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          {teams.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No teams assigned"
              description="This student is not yet part of any project team."
            />
          ) : (
            <div className="space-y-3">
              {teams.map((t) => (
                <Link
                  key={t.id}
                  to={`/admin/teams/${t.id}`}
                  className="block rounded-xl border border-black/10 bg-neutral-50 p-4 transition hover:border-black/35 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-extrabold text-neutral-950 dark:text-white">
                      {t.title}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {t.isLeader && <NeutralPill label="Team Leader" />}
                      <NeutralPill label={resolveProjectStatus(t)} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Mentor: {t.mentor?.name || "Unassigned"} · Deadline:{" "}
                    {formatDate(t.deadline)}
                  </p>
                  <div className="mt-2.5">
                    <ProgressBar
                      value={calculateProjectProgress(t)}
                      showLabel
                      height="h-1.5"
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Assigned Tasks"
          subtitle={`${taskProgress.completed || 0} of ${taskProgress.total || 0} completed`}
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          {tasks.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No tasks assigned"
              description="Tasks assigned to this student will appear here."
            />
          ) : (
            <div className="space-y-2.5">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-black/10 bg-neutral-50 p-3.5 dark:border-white/10 dark:bg-[#101014]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-neutral-950 dark:text-white">
                      {task.title}
                    </p>
                    <NeutralPill label={task.status} />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {task.project?.title || "Project"} · Priority: {task.priority}{" "}
                    · Due {formatDate(task.dueDate)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Activity History */}
      <SectionCard
        title="Activity History"
        subtitle="Recent account and project timeline"
        className="dark:!border-white/12 dark:!bg-[#08080A]"
      >
        {activityHistory.length === 0 ? (
          <EmptyState icon={Activity} title="No activity recorded yet" />
        ) : (
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {activityHistory.map((act) => (
              <div
                key={act.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-xs font-semibold text-neutral-950 dark:text-white">
                    {act.description}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {act.action} {act.projectTitle ? `· ${act.projectTitle}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400">
                  {timeAgo(act.createdAt)}
                </span>
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