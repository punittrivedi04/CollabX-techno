import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Activity, ArrowLeft, CheckCircle2, FolderKanban, Mail, Phone } from "lucide-react";

import api from "../../services/api";
import { calculateProjectProgress, formatDate, getErrorMessage, getInitials, resolveProjectStatus, timeAgo } from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  SectionCard,
  StatusBadge,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

export default function MentorStudentDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/mentor/students/${id}`);
      setData(res.data?.data || res.data);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load student profile."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Loading student profile..." />;

  if (!data?.student) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={error || "Student not found or not assigned to you."} />
        <Link to="/mentor/students" className={portalSecondaryBtnClass}>
          <ArrowLeft size={15} /> Back to My Students
        </Link>
      </div>
    );
  }

  const { student, teams = [], tasks = [], taskProgress = {}, recentActivities = [] } = data;

  return (
    <div className="space-y-6">
      <Link to="/mentor/students" className={portalSecondaryBtnClass}>
        <ArrowLeft size={15} /> Back to My Students
      </Link>

      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#141A17] text-lg font-extrabold text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]">
            {getInitials(student.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-[var(--text-primary)]">{student.name}</h1>
              <StatusBadge status={student.is_active ? "Active" : "Inactive"} />
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
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

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            ["Mentored Teams", teams.length],
            ["Total Tasks", taskProgress.total ?? 0],
            ["Completed", taskProgress.completed ?? 0],
            ["Completion Rate", `${taskProgress.completionRate ?? 0}%`],
          ].map(([label, val]) => (
            <div key={label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5">
              <p className="text-[11px] font-bold uppercase text-[var(--text-muted)]">{label}</p>
              <p className="mt-1 text-xl font-extrabold text-[var(--text-primary)]">{val}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Teams & Projects under Your Mentorship">
          {teams.length === 0 ? (
            <EmptyState icon={FolderKanban} title="No projects yet" />
          ) : (
            <div className="space-y-3">
              {teams.map((t) => (
                <Link
                  key={t.id}
                  to={`/mentor/teams/${t.id}`}
                  className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 transition hover:border-[#15803D]/55"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-extrabold text-[var(--text-primary)]">{t.title}</p>
                    <div className="flex items-center gap-1.5">
                      {t.isLeader && <StatusBadge status="Team Leader" />}
                      <StatusBadge status={resolveProjectStatus(t)} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Deadline: {formatDate(t.deadline)}</p>
                  <div className="mt-2.5">
                    <ProgressBar value={calculateProjectProgress(t)} showLabel height="h-1.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Assigned Tasks">
          {tasks.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No tasks assigned yet" />
          ) : (
            <div className="space-y-2.5">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-[var(--text-primary)]">{task.title}</p>
                    <StatusBadge status={task.status} />
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {task.project?.title || "Team"} · Priority: {task.priority} · Due {formatDate(task.dueDate)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Recent Activity">
        {recentActivities.length === 0 ? (
          <EmptyState icon={Activity} title="No activity logged yet" />
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {recentActivities.map((act) => (
              <div key={act.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{act.description}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{act.action}</p>
                </div>
                <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{timeAgo(act.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
