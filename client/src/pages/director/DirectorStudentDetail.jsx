import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Award,
  CheckCircle2,
  Crown,
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

export default function DirectorStudentDetail() {
  const { id } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inspectProjectId, setInspectProjectId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/director/students/${id}`);
      const payload = res.data?.data || res.data;
      setData(payload);
    } catch (err) {
      setError(
        getErrorMessage(err, "Unable to load student executive inspection."),
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Loading student executive inspection..." />;

  if (!data?.student) {
    return (
      <div className="space-y-4 text-neutral-950 dark:text-white">
        <ErrorAlert message={error || "Student not found."} />
        <Link
          to="/director/students"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to Students Directory</span>
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
    recentActivities = [],
  } = data;

  const activities =
    activityHistory.length > 0 ? activityHistory : recentActivities;

  const totalTasksCount =
    typeof taskProgress.total === "number"
      ? taskProgress.total
      : typeof taskProgress.totalTasks === "number"
        ? taskProgress.totalTasks
        : Array.isArray(tasks)
          ? tasks.length
          : 0;

  const completedTasksCount =
    typeof taskProgress.completed === "number"
      ? taskProgress.completed
      : typeof taskProgress.completedTasks === "number"
        ? taskProgress.completedTasks
        : Array.isArray(tasks)
          ? tasks.filter((t) => {
              const s = String(t.status || "").trim().toLowerCase();
              return s === "completed" || s === "done";
            }).length
          : 0;

  const completionRateVal =
    typeof taskProgress.completionRate === "number"
      ? taskProgress.completionRate
      : totalTasksCount > 0
        ? Math.round((completedTasksCount / totalTasksCount) * 100)
        : 0;

  const isLeader = Boolean(
    student.isLeader || teams.some((t) => t.isLeader),
  );

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Top Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/director/students"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to Students Directory</span>
        </Link>

        <div className="flex items-center gap-2">
          <NeutralPill
            label="Director Inspection"
            className="border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-white/20 dark:bg-neutral-900 dark:text-neutral-300"
          />
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />

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
                <NeutralPill label={student.isActive ?? student.is_active ? "Active" : "Inactive"} />
                {isLeader && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
                    <Crown size={11} strokeWidth={2} />
                    Team Leader
                  </span>
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
                {student.department && (
                  <span className="inline-flex items-center rounded-md border border-black/10 bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-800 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-200">
                    Dept: {student.department}
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
              <div className="mt-1">
                <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-neutral-950 dark:text-white">
                  <Award size={15} strokeWidth={1.85} />
                  <span>{mentor.name}</span>
                </div>
                {mentor.email && (
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {mentor.email}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                Unassigned
              </p>
            )}
          </div>
        </div>

        {/* 4 KPI Stat Cards */}
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            ["Teams / Projects", teams.length],
            ["Total Tasks", totalTasksCount],
            ["Completed Tasks", completedTasksCount],
            ["Completion Rate", `${completionRateVal}%`],
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

      {/* Teams + Tasks 2-Column Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Assigned Teams & Projects"
          subtitle={`${teams.length} project team(s)`}
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
                <div
                  key={t.id}
                  onClick={() => setInspectProjectId(t.id)}
                  className="block cursor-pointer rounded-xl border border-black/10 bg-neutral-50 p-4 transition hover:border-black/35 hover:bg-neutral-100/70 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35 dark:hover:bg-[#16161c]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-extrabold text-neutral-950 dark:text-white">
                      {t.title}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {t.isLeader && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
                          <Crown size={10} strokeWidth={2} />
                          Team Leader
                        </span>
                      )}
                      <NeutralPill label={resolveProjectStatus(t)} />
                      <span className="text-[10px] font-bold text-neutral-600 underline dark:text-neutral-400">
                        View Project &rarr;
                      </span>
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
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Assigned Tasks"
          subtitle={`${completedTasksCount} of ${totalTasksCount} completed`}
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
                    {task.projectTitle || task.project?.title || "Project"} · Priority: {task.priority || "Medium"}{" "}
                    · Due {formatDate(task.dueDate || task.deadline)}
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
        subtitle="Recent project and account timeline"
        className="dark:!border-white/12 dark:!bg-[#08080A]"
      >
        {activities.length === 0 ? (
          <EmptyState icon={Activity} title="No activity recorded yet" />
        ) : (
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {activities.map((act) => (
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

      {/* Executive Project Inspect Drawer */}
      <DirectorInspectDrawer
        projectId={inspectProjectId}
        onClose={() => setInspectProjectId(null)}
      />
    </div>
  );
}
