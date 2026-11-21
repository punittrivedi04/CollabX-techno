import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  FolderKanban,
  Mail,
  Phone,
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
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  SectionCard,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

function NeutralBadge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200 ${className}`}
    >
      {children}
    </span>
  );
}

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
      <div className="space-y-4 text-neutral-950 dark:text-white">
        <ErrorAlert
          message={error || "Student not found or not assigned to you."}
        />
        <Link
          to="/mentor/students"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to My Students</span>
        </Link>
      </div>
    );
  }

  const {
    student,
    teams = [],
    tasks = [],
    taskProgress = {},
    recentActivities = [],
  } = data;

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      <Link
        to="/mentor/students"
        className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
      >
        <ArrowLeft size={15} strokeWidth={1.85} />
        <span>Back to My Students</span>
      </Link>

      <div className="rounded-2xl border border-black/12 bg-white p-5 shadow-2xs dark:border-white/12 dark:bg-[#08080A] sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-black/15 bg-neutral-950 text-lg font-extrabold text-white dark:border-white/15 dark:bg-white dark:text-black">
            {getInitials(student.name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-extrabold text-neutral-950 dark:text-white">
                {student.name}
              </h1>
              <NeutralBadge>
                {student.is_active ? "Active" : "Inactive"}
              </NeutralBadge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
              <span className="inline-flex items-center gap-1.5">
                <Mail size={13} strokeWidth={1.85} />
                <span>{student.email}</span>
              </span>
              {(student.roll_no || student.rollNumber) && (
                <NeutralBadge>
                  <span className="font-mono">
                    Roll: {student.roll_no || student.rollNumber}
                  </span>
                </NeutralBadge>
              )}
              {student.phone && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Phone size={13} strokeWidth={1.85} />
                  <span>{student.phone}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Mentored Teams", teams.length],
            ["Total Tasks", taskProgress.total ?? 0],
            ["Completed", taskProgress.completed ?? 0],
            ["Completion Rate", `${taskProgress.completionRate ?? 0}%`],
          ].map(([label, val]) => (
            <div
              key={label}
              className="rounded-xl border border-black/10 bg-neutral-50 p-3.5 dark:border-white/10 dark:bg-[#101014]"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {label}
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-neutral-950 dark:text-white">
                {val}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Teams & Projects under Your Mentorship"
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          {teams.length === 0 ? (
            <EmptyState icon={FolderKanban} title="No projects yet" />
          ) : (
            <div className="space-y-3">
              {teams.map((t) => (
                <Link
                  key={t.id}
                  to={`/mentor/teams/${t.id}`}
                  className="block rounded-xl border border-black/10 bg-neutral-50 p-4 transition hover:border-black/35 hover:bg-white dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35 dark:hover:bg-[#14141A]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="truncate text-sm font-extrabold text-neutral-950 dark:text-white">
                      {t.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {t.isLeader && <NeutralBadge>Team Leader</NeutralBadge>}
                      <NeutralBadge>{resolveProjectStatus(t)}</NeutralBadge>
                    </div>
                  </div>
                  <p className="mt-1 tabular-nums text-xs text-neutral-500 dark:text-neutral-400">
                    Deadline: {formatDate(t.deadline)}
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
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          {tasks.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No tasks assigned yet" />
          ) : (
            <div className="space-y-2.5">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-black/10 bg-neutral-50 p-3.5 dark:border-white/10 dark:bg-[#101014]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                      {task.title}
                    </p>
                    <NeutralBadge>{task.status}</NeutralBadge>
                  </div>
                  <p className="mt-1 tabular-nums text-[11px] text-neutral-500 dark:text-neutral-400">
                    {task.project?.title || "Team"} · Priority: {task.priority}{" "}
                    · Due {formatDate(task.dueDate)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Recent Activity"
        className="dark:!border-white/12 dark:!bg-[#08080A]"
      >
        {recentActivities.length === 0 ? (
          <EmptyState icon={Activity} title="No activity logged yet" />
        ) : (
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {recentActivities.map((act) => (
              <div
                key={act.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-neutral-950 dark:text-white">
                    {act.description}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {act.action}
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
    </div>
  );
}