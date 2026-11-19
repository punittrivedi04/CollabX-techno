import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  ArrowRightLeft,
  Award,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  ExternalLink,
  FolderKanban,
  Globe,
  MessageSquare,
  Presentation,
  Users,
} from "lucide-react";

import api from "../../services/api";
import { calculateProjectProgress, formatDate, getErrorMessage, getInitials, isValidHttpUrl, resolveProjectStatus, timeAgo } from "../../utils/portalHelpers";
import EmbeddedProjectChat from "../../components/portal/EmbeddedProjectChat";
import SearchableSelect from "../../components/portal/SearchableSelect";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  ProgressBar,
  SectionCard,
  StatusBadge,
  SuccessAlert,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

export default function AdminTeamDetail() {
  const { projectId } = useParams();
  // Chat stays collapsed by default; all team details remain visible in a single scroll
  const [showChat, setShowChat] = useState(false);
  const chatSectionRef = useRef(null);

  const handleToggleChat = () => {
    setShowChat((prev) => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() => {
          const el = chatSectionRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const headerOffset = 88;
          const isClippedBelow = rect.bottom > window.innerHeight;
          const isAboveHeader = rect.top < headerOffset;
          if (isAboveHeader) {
            window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - headerOffset), behavior: "smooth" });
          } else if (isClippedBelow) {
            const desiredDelta = Math.min(rect.bottom - window.innerHeight + 24, rect.top - headerOffset);
            if (desiredDelta > 0) {
              window.scrollBy({ top: desiredDelta, behavior: "smooth" });
            }
          }
        });
      }
      return next;
    });
  };

  const [data, setData] = useState(null);
  const [mentors, setMentors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showReassign, setShowReassign] = useState(false);
  const [selectedMentorId, setSelectedMentorId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [teamRes, mentorsRes] = await Promise.all([
        api.get(`/admin/teams/${projectId}`),
        api.get("/admin/mentors"),
      ]);
      const payload = teamRes.data?.data || teamRes.data;
      setData(payload);
      setMentors((mentorsRes.data?.mentors || []).filter((m) => m.is_active !== false));
      setSelectedMentorId(payload?.team?.mentor?.id ? String(payload.team.mentor.id) : "");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load team details."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setShowChat(false);
    load();
  }, [load]);

  const handleReassignMentor = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch(`/admin/projects/${projectId}/reassign-mentor`, {
        mentor_id: selectedMentorId ? Number(selectedMentorId) : null,
      });
      setSuccess("Project mentor reassigned cleanly. Tasks, chats, and Drive resources remain intact.");
      setShowReassign(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to reassign project mentor."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading team & project details..." />;

  if (!data?.team) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={error || "Team/Project not found."} />
        <Link to="/admin/teams" className={portalSecondaryBtnClass}>
          <ArrowLeft size={15} /> Back to Teams
        </Link>
      </div>
    );
  }

  const { team, resources = {}, tasks = [], recentActivities = [] } = data;
  const resourceLinks = [
    { label: "GitHub Repository", url: resources.githubUrl, icon: FolderKanban },
    { label: "Live Demo / Drive Folder", url: resources.demoUrl, icon: Globe },
    { label: "Presentation / PPT Link", url: resources.pptUrl, icon: Presentation },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/teams" className={portalSecondaryBtnClass}>
          <ArrowLeft size={15} /> Back to Teams
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowReassign(true)} className={portalPrimaryBtnClass}>
            <ArrowRightLeft size={14} /> Reassign Mentor
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {/* Header Summary Card */}
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xs">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
                {team.title}
              </h1>
              <StatusBadge status={resolveProjectStatus(team)} />
              <StatusBadge status={team.priority} />
            </div>
            {team.description && (
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
                {team.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-4 py-3">
              <p className="font-bold uppercase tracking-wider text-[var(--text-muted)]">Assigned Mentor</p>
              {team.mentor ? (
                <Link
                  to={`/admin/mentors/${team.mentor.id}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--accent-text)] hover:underline"
                >
                  <Award size={14} /> {team.mentor.name}
                </Link>
              ) : (
                <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">Unassigned</p>
              )}
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-4 py-3">
              <p className="font-bold uppercase tracking-wider text-[var(--text-muted)]">Deadline</p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--text-primary)]">
                <CalendarClock size={14} /> {formatDate(team.deadline)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
            <span className="text-[var(--text-secondary)]">
              Project Progress · {team.taskProgress?.completed || 0}/{team.taskProgress?.total || 0} Tasks Completed
            </span>
          </div>
          <ProgressBar value={calculateProjectProgress(team)} showLabel height="h-2.5" />
        </div>

        {/* Optional Official Team Chat Toggle */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={handleToggleChat}
            aria-expanded={showChat}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-2xs transition-all duration-200 cursor-pointer ${
              showChat
                ? "border border-[#15803D]/30 bg-[#BEF264] text-[#141A18] hover:brightness-95 dark:border-[#A3E635] dark:bg-[#A3E635] dark:text-[#090D0B]"
                : "border border-[#141A17] bg-[#141A17] text-[#BEF264] hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-[#A3E635] dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B]"
            }`}
          >
            <MessageSquare size={14} className="shrink-0" />
            <span>{showChat ? "Hide Official Team Chat" : "Official Team Chat"}</span>
            {showChat ? (
              <ChevronUp size={14} className="shrink-0" />
            ) : (
              <ChevronDown size={14} className="shrink-0" />
            )}
          </button>
        </div>
      </div>

      {showChat && (
        <div ref={chatSectionRef} className="scroll-mt-24">
          <EmbeddedProjectChat projectId={team.id} projectTitle={team.title} />
        </div>
      )}

      {/* Members & Deliverables */}
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title={`Team Roster (${team.memberCount})`} subtitle="Team Leader and enrolled students">
              <div className="space-y-2.5">
                {team.teamLeader && (
                  <Link
                    to={`/admin/students/${team.teamLeader.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/8 p-3.5 transition hover:border-amber-500/60"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-extrabold text-[#090D0B]">
                        {getInitials(team.teamLeader.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-extrabold text-[var(--text-primary)]">
                            {team.teamLeader.name}
                          </p>
                          {(team.teamLeader.roll_no || team.teamLeader.rollNumber) && (
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-800 dark:text-amber-200">
                              Roll: {team.teamLeader.roll_no || team.teamLeader.rollNumber}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">
                          {team.teamLeader.email}
                          {(team.teamLeader.roll_no || team.teamLeader.rollNumber)
                            ? ` · ${team.teamLeader.roll_no || team.teamLeader.rollNumber}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                      <Crown size={12} /> Leader
                    </span>
                  </Link>
                )}

                {(team.members || []).map((m) => (
                  <Link
                    key={m.id}
                    to={`/admin/students/${m.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 transition hover:border-[#15803D]/50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#141A17] text-[11px] font-bold text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]">
                        {getInitials(m.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-bold text-[var(--text-primary)]">{m.name}</p>
                          {(m.roll_no || m.rollNumber) && (
                            <span className="rounded-full bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--text-secondary)]">
                              Roll: {m.roll_no || m.rollNumber}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">
                          {m.email}
                          {(m.roll_no || m.rollNumber) ? ` · ${m.roll_no || m.rollNumber}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-[var(--bg-surface-subtle)] px-2.5 py-0.5 text-[11px] font-bold capitalize text-[var(--text-secondary)]">
                      {m.role || "Member"}
                    </span>
                  </Link>
                ))}

                {!team.teamLeader && (team.members || []).length === 0 && (
                  <EmptyState icon={Users} title="No team members listed" />
                )}
              </div>
            </SectionCard>

            <SectionCard title="Drive Resources & Deliverables" subtitle="Project repositories, decks, and demos">
              <div className="space-y-3">
                {resourceLinks.map((res) => {
                  const Icon = res.icon;
                  const valid = isValidHttpUrl(res.url);
                  return (
                    <div
                      key={res.label}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent-text)]">
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)]">{res.label}</p>
                          <p className="truncate text-[11px] text-[var(--text-muted)]">
                            {valid ? res.url : "Not submitted yet"}
                          </p>
                        </div>
                      </div>
                      {valid && (
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-bold text-[var(--accent-text)] transition hover:border-[#15803D]"
                        >
                          Open <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          {/* Faculty Mentor Project Review */}
          {team.mentorReview && (
            <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4ECE6] dark:border-[#1F2C26] pb-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-[#15803D]/10 dark:bg-[#A3E635]/10 px-3 py-1 font-bold text-[#15803D] dark:text-[#A3E635]">
                    <Award size={14} /> Official Faculty Mentor Review
                  </span>
                  <span className="font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                    {team.reviewedAt
                      ? `Evaluated on ${formatDate(team.reviewedAt)}`
                      : "Verified Evaluation"}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                  Restricted: Team, Mentor &amp; Leadership Only
                </span>
              </div>
              <div className="mt-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#141A18] dark:text-slate-100 font-medium">
                  {team.mentorReview}
                </p>
                {team.mentor?.name && (
                  <p className="mt-3 text-xs font-bold text-[#5C6B66] dark:text-[#94A89D]">
                    — {team.mentor.name} (Faculty Mentor)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tasks List */}
          <SectionCard
            title={`Project Tasks (${tasks.length})`}
            subtitle={`${team.taskProgress?.completed || 0} completed · ${team.taskProgress?.pending || 0} pending`}
          >
            {tasks.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No tasks yet" description="Tasks created for this team will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="border-b border-[var(--border-subtle)] text-[11px] font-extrabold uppercase text-[var(--text-muted)]">
                    <tr>
                      <th className="py-2.5 pr-4">Task</th>
                      <th className="px-3 py-2.5">Assignee</th>
                      <th className="px-3 py-2.5">Priority</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="py-2.5 pl-3 text-right">Due Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {tasks.map((t) => (
                      <tr key={t.id}>
                        <td className="py-3 pr-4">
                          <p className="font-bold text-[var(--text-primary)]">{t.title}</p>
                          {t.description && (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--text-muted)]">{t.description}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-[var(--text-secondary)]">
                          {t.assignedTo?.name || "Unassigned"}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={t.priority} />
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="py-3 pl-3 text-right text-[var(--text-muted)]">{formatDate(t.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Project Activities */}
          <SectionCard title="Recent Project Activities">
            {recentActivities.length === 0 ? (
              <EmptyState icon={Activity} title="No project activities logged yet" />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {recentActivities.map((act) => (
                  <div key={act.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">{act.description}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {act.user?.name || "System"} · {act.action}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{timeAgo(act.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

      {/* Reassign Mentor Modal */}
      <Modal
        open={showReassign}
        onClose={() => !saving && setShowReassign(false)}
        title="Reassign Project Mentor"
        description={`Change the faculty mentor for "${team.title}". All tasks, chats, team members, and resources stay intact.`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowReassign(false)}
              disabled={saving}
              className={portalSecondaryBtnClass}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="reassign-mentor-form"
              disabled={saving}
              className={portalPrimaryBtnClass}
            >
              {saving ? "Reassigning..." : "Confirm Reassignment"}
            </button>
          </>
        }
      >
        <form id="reassign-mentor-form" onSubmit={handleReassignMentor} className="space-y-4 min-h-[280px]">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Target Faculty Mentor
            </label>
            <SearchableSelect
              options={mentors.map((m) => ({
                value: String(m.id),
                label: m.name,
              }))}
              value={selectedMentorId}
              onChange={setSelectedMentorId}
              placeholder="Search a Faculty Mentor by name..."
              searchPlaceholder="Type mentor name..."
              allowEmpty
              emptyOptionLabel="Unassign Mentor"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
