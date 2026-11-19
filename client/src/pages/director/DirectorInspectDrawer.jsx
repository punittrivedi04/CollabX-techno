import { useEffect, useState } from "react";
import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Crown,
  ExternalLink,
  FolderKanban,
  GraduationCap,
  Presentation,
  ShieldCheck,
  Users,
  Video,
  X,
} from "lucide-react";

import api from "../../services/api";
import { formatDate, getErrorMessage, getInitials, isValidHttpUrl } from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  ProgressBar,
  StatusBadge,
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
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

/**
 * Clean, practical, strictly read-only executive drill-down modal for Projects and Mentors.
 * Single progress bar only — strictly NO task-level checklists or breakdowns, and NO chat.
 */
export default function DirectorInspectDrawer({
  projectId,
  mentorId,
  onClose,
  onSelectProject,
  onSelectMentor,
}) {
  const [projectData, setProjectData] = useState(null);
  const [mentorData, setMentorData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load project details if projectId is present
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
          setError(getErrorMessage(err, "Unable to load project executive details."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Load mentor details if mentorId is present
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
          setError(getErrorMessage(err, "Unable to load faculty mentor details."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mentorId]);

  if (!projectId && !mentorId) return null;

  // ==========================================
  // 1. PROJECT INSPECTION VIEW
  // ==========================================
  if (projectId) {
    const p = projectData;
    const isPastDue = p?.deadline && new Date(p.deadline).getTime() < Date.now() && p?.status !== "Completed";
    const hasPpt = p && isValidHttpUrl(p.deliverables?.pptUrl);
    const hasDemo = p && isValidHttpUrl(p.deliverables?.demoUrl);
    const hasGithub = p && isValidHttpUrl(p.deliverables?.githubUrl);

    return (
      <Modal
        open={Boolean(projectId)}
        onClose={onClose}
        title={
          p ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-[var(--text-primary)]">{p.title}</span>
              <StatusBadge status={p.status} />
              {isPastDue && (
                <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-extrabold text-rose-600 dark:text-rose-300">
                  Overdue
                </span>
              )}
            </div>
          ) : (
            "Project Inspection"
          )
        }
        description="Executive Read-Only Overview · Single Progress Bar · High-Level Deliverables"
        size="max-w-2xl"
        footer={
          <button type="button" onClick={onClose} className={portalSecondaryBtnClass}>
            Close Inspection
          </button>
        }
      >
        {loading ? (
          <LoadingState label="Loading project executive details..." />
        ) : error ? (
          <ErrorAlert message={error} />
        ) : p ? (
          <div className="space-y-5">
            {/* Overall Progress & Deadline Strip */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
                    Overall Project Completion
                  </p>
                  <p className="mt-0.5 text-2xl font-black text-[var(--text-primary)]">
                    {p.progress}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
                    Project Deadline
                  </p>
                  <p
                    className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-bold ${
                      isPastDue ? "text-rose-600 dark:text-rose-400" : "text-[var(--text-primary)]"
                    }`}
                  >
                    <Calendar size={13} />
                    <span>{formatDate(p.deadline)}</span>
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <ProgressBar value={p.progress} height="h-2.5" />
              </div>
            </div>

            {/* About Project */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                About the Project
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-primary)] sm:text-sm">
                {p.description || "No project description provided."}
              </p>
            </div>

            {/* Showcase Deliverables (PPT, Live Demo, GitHub) */}
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Showcase Deliverables
              </h3>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {hasPpt ? (
                  <a
                    href={p.deliverables.pptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-xs font-bold text-sky-700 dark:text-sky-300 transition hover:bg-sky-500/20"
                  >
                    <Presentation size={14} /> PPT Slides <ExternalLink size={12} />
                  </a>
                ) : (
                  <div className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-3 py-2.5 text-xs font-medium text-[var(--text-muted)] opacity-60">
                    <Presentation size={14} /> PPT Not Submitted
                  </div>
                )}

                {hasDemo ? (
                  <a
                    href={p.deliverables.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-500/20"
                  >
                    <Video size={14} /> Live Hosted Demo <ExternalLink size={12} />
                  </a>
                ) : (
                  <div className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-3 py-2.5 text-xs font-medium text-[var(--text-muted)] opacity-60">
                    <Video size={14} /> Demo Not Submitted
                  </div>
                )}

                {hasGithub ? (
                  <a
                    href={p.deliverables.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-2.5 text-xs font-bold text-[var(--text-primary)] transition hover:border-[#15803D]/50"
                  >
                    <GithubIcon size={14} /> GitHub Repo <ExternalLink size={12} />
                  </a>
                ) : (
                  <div className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-3 py-2.5 text-xs font-medium text-[var(--text-muted)] opacity-60">
                    <GithubIcon size={14} /> GitHub Not Submitted
                  </div>
                )}
              </div>
            </div>

            {/* Assigned Faculty Mentor */}
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Assigned Faculty Mentor
              </h3>
              {p.mentor ? (
                <div
                  onClick={() => onSelectMentor?.(p.mentor.id)}
                  className="group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 transition hover:border-[#15803D]/60 dark:hover:border-[#A3E635]/60"
                  title="Click to inspect Faculty Mentor"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-xs font-extrabold text-[var(--accent-text)]">
                      <GraduationCap size={18} />
                    </div>
                    <div>
                      <p className="font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-text)]">
                        {p.mentor.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{p.mentor.email}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">
                    View Mentor →
                  </span>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] p-4 text-center text-xs text-[var(--text-muted)]">
                  No Faculty Mentor assigned to this project yet.
                </div>
              )}
            </div>

            {/* Student Team Roster (Leader + Members) */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Student Team Roster
                </h3>
                <span className="text-xs font-bold text-[var(--text-secondary)]">
                  {p.memberCount} student(s)
                </span>
              </div>

              <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5">
                {/* Team Leader */}
                {p.teamLeader && (
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <Crown size={14} />
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-[var(--text-primary)]">
                          {p.teamLeader.name}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">{p.teamLeader.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-400">
                        Team Leader
                      </span>
                      {p.teamLeader.roll_no && (
                        <p className="font-mono text-[10px] text-[var(--text-muted)]">
                          Roll: {p.teamLeader.roll_no}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Squad Members */}
                {p.members && p.members.length > 0 ? (
                  p.members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 pt-1.5 first:pt-0"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface-subtle)] text-[11px] font-bold text-[var(--text-secondary)]">
                          {getInitials(m.name)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[var(--text-primary)]">{m.name}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">{m.email}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="rounded-full bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                          {m.role || "Member"}
                        </span>
                        {m.roll_no && (
                          <p className="font-mono text-[10px] text-[var(--text-muted)]">
                            Roll: {m.roll_no}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                ) : !p.teamLeader ? (
                  <p className="py-2 text-center text-xs text-[var(--text-muted)]">
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
            <span className="font-extrabold text-[var(--text-primary)]">{m.name}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              <ShieldCheck size={11} /> Faculty Mentor
            </span>
          </div>
        ) : (
          "Faculty Mentor Inspection"
        )
      }
      description={m ? m.email : "Executive Faculty Mentorship Overview"}
      size="max-w-3xl"
      footer={
        <button type="button" onClick={onClose} className={portalSecondaryBtnClass}>
          Close Inspection
        </button>
      }
    >
      {loading ? (
        <LoadingState label="Loading faculty mentor details..." />
      ) : error ? (
        <ErrorAlert message={error} />
      ) : m ? (
        <div className="space-y-5">
          {/* Executive Workload KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 text-center">
              <p className="text-[10px] font-extrabold uppercase text-[var(--text-muted)]">
                Assigned Teams
              </p>
              <p className="mt-1 text-xl font-black text-[var(--text-primary)]">{m.teamCount}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 text-center">
              <p className="text-[10px] font-extrabold uppercase text-[var(--text-muted)]">
                Active Projects
              </p>
              <p className="mt-1 text-xl font-black text-amber-600 dark:text-amber-400">
                {m.activeProjects}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 text-center">
              <p className="text-[10px] font-extrabold uppercase text-[var(--text-muted)]">
                Completed
              </p>
              <p className="mt-1 text-xl font-black text-emerald-600 dark:text-emerald-400">
                {m.completedProjects}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 text-center">
              <p className="text-[10px] font-extrabold uppercase text-[var(--text-muted)]">
                Avg Progress
              </p>
              <p className="mt-1 text-xl font-black text-[var(--accent-text)]">{m.avgProgress}%</p>
            </div>
          </div>

          {/* Assigned Projects Table */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Assigned Projects &amp; Teams ({m.projects?.length || 0})
              </h3>
              <span className="text-[11px] text-[var(--text-muted)]">
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
              <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]">
                {m.projects.map((proj) => {
                  const isPastDue =
                    proj.deadline &&
                    new Date(proj.deadline).getTime() < Date.now() &&
                    proj.status !== "Completed";

                  return (
                    <div
                      key={proj.id}
                      onClick={() => onSelectProject?.(proj.id)}
                      className="group flex cursor-pointer flex-col justify-between gap-3 p-4 transition hover:bg-[var(--bg-surface-subtle)] sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-text)]">
                            {proj.title}
                          </p>
                          <StatusBadge status={proj.status} />
                          {isPastDue && (
                            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-300">
                              Overdue
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                          {proj.teamLeader?.name ? `Lead: ${proj.teamLeader.name}` : "Team Lead"} ·{" "}
                          {proj.memberCount} student(s) · Due {formatDate(proj.deadline)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-4">
                        <div className="w-28 text-right">
                          <p className="text-xs font-extrabold text-[var(--text-primary)]">
                            {proj.progress}%
                          </p>
                          <div className="mt-1">
                            <ProgressBar value={proj.progress} height="h-1.5" />
                          </div>
                        </div>

                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] transition group-hover:border-[#15803D]/60 group-hover:text-[var(--accent-text)]">
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
}
