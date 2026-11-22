import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  CheckCircle2,
  Crown,
  ExternalLink,
  FolderKanban,
  GraduationCap,
  Presentation,
  ShieldCheck,
  Video,
} from "lucide-react";

import api from "../../services/api";
import {
  formatDate,
  getErrorMessage,
  getInitials,
  isValidHttpUrl,
} from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  ProgressBar,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

function GithubIcon({ size = 14, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

function NeutralBadge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200 ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Clean, practical, strictly read-only executive drill-down modal for Projects and Mentors.
 * Single progress bar only — strictly NO task-level checklists or breakdowns, and NO chat.
 */
export default function DirectorInspectDrawer({
  projectId,
  mentorId,
  studentId,
  onClose,
  onSelectProject,
  onSelectMentor,
  onSelectStudent,
}) {
  const navigate = useNavigate();
  const [projectData, setProjectData] = useState(null);
  const [mentorData, setMentorData] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) {
      setProjectData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");

    api
      .get(`/director/projects/${projectId}`)
      .then((res) => {
        if (!cancelled) {
          setProjectData(res.data?.project || res.data?.data || null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            getErrorMessage(err, "Unable to load project executive details."),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!mentorId) {
      setMentorData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");

    api
      .get(`/director/mentors/${mentorId}`)
      .then((res) => {
        if (!cancelled) {
          setMentorData(res.data?.mentor || res.data?.data || null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            getErrorMessage(err, "Unable to load faculty mentor details."),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mentorId]);

  useEffect(() => {
    if (!studentId) {
      setStudentData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");

    api
      .get(`/director/students/${studentId}`)
      .then((res) => {
        if (!cancelled) {
          setStudentData(res.data?.data || res.data || null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            getErrorMessage(err, "Unable to load student executive details."),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (!projectId && !mentorId && !studentId) return null;

  // ==========================================
  // 1. PROJECT INSPECTION VIEW
  // ==========================================
  if (projectId) {
    const p = projectData;
    const isPastDue =
      p?.deadline &&
      new Date(p.deadline).getTime() < Date.now() &&
      p?.status !== "Completed";
    const hasPpt = p && isValidHttpUrl(p.deliverables?.pptUrl);
    const hasDemo = p && isValidHttpUrl(p.deliverables?.demoUrl);
    const hasGithub = p && isValidHttpUrl(p.deliverables?.githubUrl);
    const memberCount =
      Number(p?.memberCount) ||
      (Array.isArray(p?.members) ? p.members.length : 0);

    return (
      <Modal
        open={Boolean(projectId)}
        onClose={onClose}
        title={
          p ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-neutral-950 dark:text-white">
                {p.title}
              </span>
              {p.status && <NeutralBadge>{p.status}</NeutralBadge>}
              {isPastDue && <NeutralBadge>Overdue</NeutralBadge>}
            </div>
          ) : (
            "Project Inspection"
          )
        }
        description="Executive Overview · Single Progress Bar · High-Level Deliverables"
        size="max-w-2xl"
        footer={
          <button
            type="button"
            onClick={onClose}
            className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
          >
            <span>Close Inspection</span>
          </button>
        }
      >
        {loading ? (
          <LoadingState label="Loading project executive details..." />
        ) : error ? (
          <ErrorAlert message={error} />
        ) : p ? (
          <div className="space-y-5 text-neutral-950 dark:text-white">
            {/* Overall Progress & Deadline Strip */}
            <div className="rounded-xl border border-black/10 bg-neutral-50 p-4 shadow-2xs dark:border-white/10 dark:bg-[#101014]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Overall Project Completion
                  </p>
                  <p className="mt-0.5 text-2xl font-black tabular-nums text-neutral-950 dark:text-white">
                    {p.progress ?? 0}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Project Deadline
                  </p>
                  <p
                    className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold tabular-nums ${
                      isPastDue
                        ? "underline decoration-neutral-400 underline-offset-2 text-neutral-950 dark:text-white"
                        : "text-neutral-800 dark:text-neutral-200"
                    }`}
                  >
                    <Calendar size={13} strokeWidth={1.85} />
                    <span>{formatDate(p.deadline)}</span>
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <ProgressBar value={p.progress ?? 0} height="h-1.5" />
              </div>
            </div>

            {/* About Project */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                About the Project
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 sm:text-sm">
                {p.description || "No project description provided."}
              </p>
            </div>

            {/* Showcase Deliverables */}
            <div>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Showcase Deliverables
              </h3>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {hasPpt ? (
                  <a
                    href={p.deliverables.pptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/15 bg-white px-3 py-2.5 text-xs font-bold text-neutral-950 transition hover:border-black/35 dark:border-white/15 dark:bg-[#101014] dark:text-white dark:hover:border-white/35"
                  >
                    <Presentation size={14} strokeWidth={1.85} />
                    <span>PPT Slides</span>
                    <ExternalLink size={12} strokeWidth={1.85} />
                  </a>
                ) : (
                  <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2.5 text-xs font-medium text-neutral-400 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-500">
                    <Presentation size={14} strokeWidth={1.85} />
                    <span>PPT Not Submitted</span>
                  </div>
                )}

                {hasDemo ? (
                  <a
                    href={p.deliverables.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/15 bg-white px-3 py-2.5 text-xs font-bold text-neutral-950 transition hover:border-black/35 dark:border-white/15 dark:bg-[#101014] dark:text-white dark:hover:border-white/35"
                  >
                    <Video size={14} strokeWidth={1.85} />
                    <span>Live Hosted Demo</span>
                    <ExternalLink size={12} strokeWidth={1.85} />
                  </a>
                ) : (
                  <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2.5 text-xs font-medium text-neutral-400 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-500">
                    <Video size={14} strokeWidth={1.85} />
                    <span>Demo Not Submitted</span>
                  </div>
                )}

                {hasGithub ? (
                  <a
                    href={p.deliverables.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/15 bg-white px-3 py-2.5 text-xs font-bold text-neutral-950 transition hover:border-black/35 dark:border-white/15 dark:bg-[#101014] dark:text-white dark:hover:border-white/35"
                  >
                    <GithubIcon size={14} />
                    <span>GitHub Repo</span>
                    <ExternalLink size={12} strokeWidth={1.85} />
                  </a>
                ) : (
                  <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2.5 text-xs font-medium text-neutral-400 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-500">
                    <GithubIcon size={14} />
                    <span>GitHub Not Submitted</span>
                  </div>
                )}
              </div>
            </div>

            {/* Assigned Faculty Mentor */}
            <div>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Assigned Faculty Mentor
              </h3>
              {p.mentor ? (
                <div
                  onClick={() => onSelectMentor?.(p.mentor.id)}
                  className="group flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-3.5 transition hover:border-black/35 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35"
                  title="Click to inspect Faculty Mentor"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-white text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                      <GraduationCap size={18} strokeWidth={1.85} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-neutral-950 group-hover:underline dark:text-white sm:text-sm">
                        {p.mentor.name}
                      </p>
                      <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                        {p.mentor.email}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-xl border border-black/12 bg-white px-3 py-1 text-xs font-bold text-neutral-800 transition group-hover:border-black/35 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-200 dark:group-hover:border-white/35">
                    View Mentor →
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-black/15 bg-neutral-50 p-4 text-center text-xs text-neutral-500 dark:border-white/15 dark:bg-[#101014] dark:text-neutral-400">
                  No Faculty Mentor assigned to this project yet.
                </div>
              )}
            </div>

            {/* Student Team Roster */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Student Team Roster
                </h3>
                <span className="text-xs font-bold tabular-nums text-neutral-700 dark:text-neutral-300">
                  {memberCount} student(s)
                </span>
              </div>

              <div className="space-y-2 rounded-xl border border-black/10 bg-neutral-50 p-3.5 dark:border-white/10 dark:bg-[#101014]">
                {p.teamLeader && (
                  <div
                    onClick={() => {
                      if (p.teamLeader.id) {
                        if (onSelectStudent) {
                          onSelectStudent(p.teamLeader.id);
                        } else {
                          onClose?.();
                          navigate(`/director/students/${p.teamLeader.id}`);
                        }
                      }
                    }}
                    className={`flex items-center justify-between gap-2 border-b border-black/10 pb-2.5 dark:border-white/10 ${
                      p.teamLeader.id
                        ? "cursor-pointer rounded-lg p-1.5 transition hover:bg-white dark:hover:bg-[#14141A]"
                        : ""
                    }`}
                    title={p.teamLeader.id ? "Inspect student details" : undefined}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-black/12 bg-white text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                        <Crown size={14} strokeWidth={1.85} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-neutral-950 dark:text-white">
                          {p.teamLeader.name}
                        </p>
                        <p className="truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                          {p.teamLeader.email}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <NeutralBadge>Team Leader</NeutralBadge>
                      {p.teamLeader.roll_no && (
                        <p className="mt-0.5 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                          Roll: {p.teamLeader.roll_no}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {p.members && p.members.length > 0 ? (
                  p.members.map((member) => (
                    <div
                      key={member.id}
                      onClick={() => {
                        if (member.id) {
                          if (onSelectStudent) {
                            onSelectStudent(member.id);
                          } else {
                            onClose?.();
                            navigate(`/director/students/${member.id}`);
                          }
                        }
                      }}
                      className={`flex items-center justify-between gap-2 pt-1.5 first:pt-0 ${
                        member.id
                          ? "cursor-pointer rounded-lg p-1.5 transition hover:bg-white dark:hover:bg-[#14141A]"
                          : ""
                      }`}
                      title={member.id ? "Inspect student details" : undefined}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-black/12 bg-white text-[11px] font-bold text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                          {getInitials(member.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                            {member.name}
                          </p>
                          <p className="truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                            {member.email}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <NeutralBadge>{member.role || "Member"}</NeutralBadge>
                        {member.roll_no && (
                          <p className="mt-0.5 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                            Roll: {member.roll_no}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                ) : !p.teamLeader ? (
                  <p className="py-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
                    No student members assigned.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    );
  }

  // ==========================================
  // 2. MENTOR INSPECTION VIEW
  // ==========================================
  const m = mentorData;
  return (
    <Modal
      open={Boolean(mentorId)}
      onClose={onClose}
      title={
        m ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-neutral-950 dark:text-white">
              {m.name}
            </span>
            <NeutralBadge>
              <ShieldCheck size={11} strokeWidth={1.85} />
              <span>Faculty Mentor</span>
            </NeutralBadge>
          </div>
        ) : (
          "Faculty Mentor Inspection"
        )
      }
      description={m ? m.email : "Executive Faculty Mentorship Overview"}
      size="max-w-3xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
        >
          <span>Close Inspection</span>
        </button>
      }
    >
      {loading ? (
        <LoadingState label="Loading faculty mentor details..." />
      ) : error ? (
        <ErrorAlert message={error} />
      ) : m ? (
        <div className="space-y-5 text-neutral-950 dark:text-white">
          {/* Executive Workload KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Assigned Teams", m.teamCount ?? 0],
              ["Active Projects", m.activeProjects ?? 0],
              ["Completed", m.completedProjects ?? 0],
              ["Avg Progress", `${m.avgProgress ?? 0}%`],
            ].map(([label, val]) => (
              <div
                key={label}
                className="rounded-xl border border-black/10 bg-neutral-50 p-3.5 text-center dark:border-white/10 dark:bg-[#101014]"
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

          {/* Assigned Projects Table */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Assigned Projects &amp; Teams ({m.projects?.length || 0})
              </h3>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Click any project to inspect full roster &amp; deliverables
              </span>
            </div>

            {m.projects?.length === 0 ? (
              <EmptyState
                icon={FolderKanban}
                title="No projects currently assigned"
                description="This faculty mentor currently has no active student project teams assigned."
              />
            ) : (
              <div className="divide-y divide-black/10 overflow-hidden rounded-xl border border-black/10 bg-neutral-50 dark:divide-white/10 dark:border-white/10 dark:bg-[#101014]">
                {m.projects.map((proj) => {
                  const isPastDue =
                    proj.deadline &&
                    new Date(proj.deadline).getTime() < Date.now() &&
                    proj.status !== "Completed";

                  return (
                    <div
                      key={proj.id}
                      onClick={() => onSelectProject?.(proj.id)}
                      className="group flex cursor-pointer flex-col justify-between gap-3 p-4 transition hover:bg-white dark:hover:bg-[#14141A] sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-extrabold text-neutral-950 group-hover:underline dark:text-white">
                            {proj.title}
                          </p>
                          {proj.status && (
                            <NeutralBadge>{proj.status}</NeutralBadge>
                          )}
                          {isPastDue && <NeutralBadge>Overdue</NeutralBadge>}
                        </div>
                        <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {proj.teamLeader?.name
                            ? `Lead: ${proj.teamLeader.name}`
                            : "Team Lead"}{" "}
                          · {proj.memberCount ?? 0} student(s) · Due{" "}
                          {formatDate(proj.deadline)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-4">
                        <div className="w-28 text-right">
                          <p className="text-xs font-extrabold tabular-nums text-neutral-950 dark:text-white">
                            {proj.progress ?? 0}%
                          </p>
                          <div className="mt-1">
                            <ProgressBar
                              value={proj.progress ?? 0}
                              height="h-1.5"
                            />
                          </div>
                        </div>

                        <span className="inline-flex items-center gap-1 rounded-xl border border-black/12 bg-white px-3 py-1 text-xs font-bold text-neutral-800 transition group-hover:border-black/35 group-hover:text-neutral-950 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-200 dark:group-hover:border-white/35 dark:group-hover:text-white">
                          Inspect →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );

  // ==========================================
  // 3. STUDENT INSPECTION VIEW
  // ==========================================
  if (studentId) {
    const s = studentData?.student || studentData;
    const teams = studentData?.teams || studentData?.projects || [];
    const tasks = studentData?.tasks || [];
    const tp = studentData?.taskProgress || {};
    const totalT =
      typeof tp.total === "number"
        ? tp.total
        : typeof tp.totalTasks === "number"
          ? tp.totalTasks
          : tasks.length;
    const compT =
      typeof tp.completed === "number"
        ? tp.completed
        : typeof tp.completedTasks === "number"
          ? tp.completedTasks
          : tasks.filter((t) =>
              ["completed", "done"].includes(
                String(t.status || "").trim().toLowerCase(),
              ),
            ).length;
    const compRate =
      typeof tp.completionRate === "number"
        ? tp.completionRate
        : totalT > 0
          ? Math.round((compT / totalT) * 100)
          : 0;

    return (
      <Modal
        open={Boolean(studentId)}
        onClose={onClose}
        title={
          s ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-neutral-950 dark:text-white">
                {s.name}
              </span>
              {s.roll_no && <NeutralBadge>{s.roll_no}</NeutralBadge>}
              {s.department && <NeutralBadge>{s.department}</NeutralBadge>}
            </div>
          ) : (
            "Student Inspection"
          )
        }
        description="Executive Overview · Task Metrics · Assigned Projects"
        size="max-w-2xl"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {s?.id && (
              <button
                type="button"
                onClick={() => {
                  onClose?.();
                  navigate(`/director/students/${s.id}`);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-black/12 bg-white px-3.5 py-2 text-xs font-bold text-neutral-900 transition hover:border-black/35 hover:bg-neutral-50 dark:border-white/15 dark:bg-[#08080A] dark:text-white dark:hover:bg-[#141418]"
              >
                <span>Full Profile Summary</span>
                <ExternalLink size={13} strokeWidth={1.85} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`${portalSecondaryBtnClass} ml-auto rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
            >
              Close
            </button>
          </div>
        }
      >
        {loading ? (
          <LoadingState message="Loading student executive overview..." />
        ) : error ? (
          <ErrorAlert message={error} />
        ) : s ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-black/15 bg-neutral-950 text-base font-extrabold text-white dark:border-white/15 dark:bg-white dark:text-black">
                  {getInitials(s.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-extrabold text-neutral-950 dark:text-white">
                    {s.name}
                  </p>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {s.email} {s.phone ? `· ${s.phone}` : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Teams / Projects", teams.length],
                ["Total Tasks", totalT],
                ["Completed Tasks", compT],
                ["Completion Rate", `${compRate}%`],
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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Assigned Teams &amp; Projects
                </span>
                <span className="text-xs text-neutral-400">
                  Click any project to inspect full roster
                </span>
              </div>

              {teams.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="No projects currently assigned"
                  description="This student is not currently assigned to any projects."
                />
              ) : (
                <div className="divide-y divide-black/10 overflow-hidden rounded-xl border border-black/10 bg-neutral-50 dark:divide-white/10 dark:border-white/10 dark:bg-[#101014]">
                  {teams.map((proj) => (
                    <div
                      key={proj.id}
                      onClick={() => onSelectProject?.(proj.id)}
                      className="group flex cursor-pointer flex-col justify-between gap-3 p-4 transition hover:bg-white dark:hover:bg-[#14141A] sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-extrabold text-neutral-950 group-hover:underline dark:text-white">
                            {proj.title}
                          </p>
                          {proj.status && (
                            <NeutralBadge>{proj.status}</NeutralBadge>
                          )}
                          {proj.isLeader && (
                            <NeutralBadge className="border-amber-500/30 text-amber-600 dark:text-amber-400">
                              Leader
                            </NeutralBadge>
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {proj.mentor?.name ? `Mentor: ${proj.mentor.name}` : "Faculty Mentor"} · Due {formatDate(proj.deadline)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-4">
                        <div className="w-28 text-right">
                          <p className="text-xs font-extrabold tabular-nums text-neutral-950 dark:text-white">
                            {proj.progress ?? 0}%
                          </p>
                          <div className="mt-1">
                            <ProgressBar
                              value={proj.progress ?? 0}
                              height="h-1.5"
                            />
                          </div>
                        </div>

                        <span className="inline-flex items-center gap-1 rounded-xl border border-black/12 bg-white px-3 py-1 text-xs font-bold text-neutral-800 transition group-hover:border-black/35 group-hover:text-neutral-950 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-200 dark:group-hover:border-white/35 dark:group-hover:text-white">
                          Inspect →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assigned Tasks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Assigned Tasks ({tasks.length})
                </span>
                <span className="text-xs text-neutral-400">
                  {compT} of {totalT} completed
                </span>
              </div>

              {tasks.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="No tasks currently assigned"
                  description="Tasks assigned to this student will appear here."
                />
              ) : (
                <div className="space-y-2 rounded-xl border border-black/10 bg-neutral-50 p-3.5 dark:border-white/10 dark:bg-[#101014]">
                  {tasks.slice(0, 10).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between gap-2 border-b border-black/5 pb-2 last:border-b-0 last:pb-0 dark:border-white/5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                          {task.title}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                          {task.projectTitle || "Project"} · Priority: {task.priority || "Medium"} · Due {formatDate(task.dueDate || task.deadline)}
                        </p>
                      </div>
                      <NeutralBadge>{task.status}</NeutralBadge>
                    </div>
                  ))}
                  {tasks.length > 10 && (
                    <p className="pt-1 text-center text-[10px] text-neutral-400">
                      Showing 10 of {tasks.length} tasks
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    );
  }
}