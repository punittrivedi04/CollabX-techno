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
import {
  calculateProjectProgress,
  formatDate,
  getErrorMessage,
  getInitials,
  isValidHttpUrl,
  resolveProjectStatus,
  timeAgo,
} from "../../utils/portalHelpers";
import EmbeddedProjectChat from "../../components/portal/EmbeddedProjectChat";
import SearchableSelect from "../../components/portal/SearchableSelect";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
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
            window.scrollTo({
              top: Math.max(0, window.scrollY + rect.top - headerOffset),
              behavior: "smooth",
            });
          } else if (isClippedBelow) {
            const desiredDelta = Math.min(
              rect.bottom - window.innerHeight + 24,
              rect.top - headerOffset,
            );
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
      setMentors(
        (Array.isArray(mentorsRes.data?.mentors)
          ? mentorsRes.data.mentors
          : []
        ).filter((m) => m.is_active !== false),
      );
      setSelectedMentorId(
        payload?.team?.mentor?.id ? String(payload.team.mentor.id) : "",
      );
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
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch(`/admin/projects/${projectId}/reassign-mentor`, {
        mentor_id: selectedMentorId ? Number(selectedMentorId) : null,
      });
      setSuccess(
        "Project mentor reassigned cleanly. Tasks, chats, and Drive resources remain intact.",
      );
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
      <div className="space-y-4 text-neutral-950 dark:text-white">
        <ErrorAlert message={error || "Team/Project not found."} />
        <Link
          to="/admin/teams"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to Teams</span>
        </Link>
      </div>
    );
  }

  const { team, resources = {}, tasks = [], recentActivities = [] } = data;
  const memberCount =
    Number(team.memberCount) ||
    (Array.isArray(team.members) ? team.members.length : 0);
  const completedTasksCount = Number(team.taskProgress?.completed) || 0;
  const totalTasksCount = Number(team.taskProgress?.total) || 0;
  const pendingTasksCount = Number(team.taskProgress?.pending) || 0;

  const resourceLinks = [
    {
      label: "GitHub Repository",
      url: resources.githubUrl,
      icon: FolderKanban,
    },
    {
      label: "Live Demo / Drive Folder",
      url: resources.demoUrl,
      icon: Globe,
    },
    {
      label: "Presentation / PPT Link",
      url: resources.pptUrl,
      icon: Presentation,
    },
  ];

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/teams"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to Teams</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReassign(true)}
            className={`${portalPrimaryBtnClass} cursor-pointer rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
          >
            <ArrowRightLeft size={14} strokeWidth={1.85} />
            <span>Reassign Mentor</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {/* Header Summary Card */}
      <div className="rounded-2xl border border-black/12 bg-white p-6 shadow-2xs dark:border-white/12 dark:bg-[#08080A]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white">
                {team.title}
              </h1>
              <NeutralPill label={resolveProjectStatus(team)} />
              {team.priority && <NeutralPill label={team.priority} />}
            </div>
            {team.description && (
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {team.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            <div className="rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-[#101014]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Assigned Mentor
              </p>
              {team.mentor ? (
                <Link
                  to={`/admin/mentors/${team.mentor.id}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-extrabold text-neutral-950 hover:underline dark:text-white"
                >
                  <Award size={14} strokeWidth={1.85} />
                  <span>{team.mentor.name}</span>
                </Link>
              ) : (
                <p className="mt-1 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                  Unassigned
                </p>
              )}
            </div>

            <div className="rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-[#101014]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Deadline
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-extrabold tabular-nums text-neutral-950 dark:text-white">
                <CalendarClock size={14} strokeWidth={1.85} />
                <span>{formatDate(team.deadline)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs font-bold tabular-nums">
            <span className="text-neutral-600 dark:text-neutral-400">
              Project Progress · {completedTasksCount}/{totalTasksCount} Tasks
              Completed
            </span>
          </div>
          <ProgressBar
            value={calculateProjectProgress(team)}
            showLabel
            height="h-2"
          />
        </div>

        {/* Optional Official Team Chat Toggle */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-black/10 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={handleToggleChat}
            aria-expanded={showChat}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition ${
              showChat
                ? "border-black/25 bg-neutral-950 text-white dark:border-white/25 dark:bg-white dark:text-black"
                : "border-black/15 bg-neutral-50 text-neutral-900 hover:border-black/35 hover:bg-neutral-100 dark:border-white/15 dark:bg-[#101014] dark:text-white dark:hover:border-white/35 dark:hover:bg-[#18181E]"
            }`}
          >
            <MessageSquare size={14} strokeWidth={1.85} className="shrink-0" />
            <span>
              {showChat ? "Hide Official Team Chat" : "Official Team Chat"}
            </span>
            {showChat ? (
              <ChevronUp size={14} strokeWidth={1.85} className="shrink-0" />
            ) : (
              <ChevronDown size={14} strokeWidth={1.85} className="shrink-0" />
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
        <SectionCard
          title={`Team Roster (${memberCount})`}
          subtitle="Team Leader and enrolled students"
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          <div className="space-y-2.5">
            {team.teamLeader && (
              <Link
                to={`/admin/students/${team.teamLeader.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-black/15 bg-neutral-50 p-3.5 transition hover:border-black/35 dark:border-white/15 dark:bg-[#101014] dark:hover:border-white/35"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-xs font-extrabold text-white dark:bg-white dark:text-black">
                    {getInitials(team.teamLeader.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-xs font-extrabold text-neutral-950 dark:text-white">
                        {team.teamLeader.name}
                      </p>
                      {(team.teamLeader.roll_no ||
                        team.teamLeader.rollNumber) && (
                        <span className="rounded-md border border-black/10 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-700 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-300">
                          Roll:{" "}
                          {team.teamLeader.roll_no ||
                            team.teamLeader.rollNumber}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                      {team.teamLeader.email}
                      {team.teamLeader.roll_no || team.teamLeader.rollNumber
                        ? ` · ${
                            team.teamLeader.roll_no ||
                            team.teamLeader.rollNumber
                          }`
                        : ""}
                    </p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-black/12 bg-white px-2.5 py-1 text-[11px] font-bold text-neutral-900 dark:border-white/14 dark:bg-[#08080A] dark:text-white">
                  <Crown size={12} strokeWidth={1.9} />
                  <span>Leader</span>
                </span>
              </Link>
            )}

            {(team.members || []).map((m) => (
              <Link
                key={m.id}
                to={`/admin/students/${m.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-3.5 transition hover:border-black/35 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-white text-[11px] font-bold text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                    {getInitials(m.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                        {m.name}
                      </p>
                      {(m.roll_no || m.rollNumber) && (
                        <span className="rounded-md border border-black/10 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-700 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-300">
                          Roll: {m.roll_no || m.rollNumber}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                      {m.email}
                      {m.roll_no || m.rollNumber
                        ? ` · ${m.roll_no || m.rollNumber}`
                        : ""}
                    </p>
                  </div>
                </div>
                <span className="rounded-md border border-black/10 bg-white px-2 py-0.5 text-[11px] font-semibold capitalize text-neutral-700 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-300">
                  {m.role || "Member"}
                </span>
              </Link>
            ))}

            {!team.teamLeader && (team.members || []).length === 0 && (
              <EmptyState icon={Users} title="No team members listed" />
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Drive Resources & Deliverables"
          subtitle="Project repositories, decks, and demos"
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          <div className="space-y-3">
            {resourceLinks.map((res) => {
              const Icon = res.icon;
              const valid = isValidHttpUrl(res.url);
              return (
                <div
                  key={res.label}
                  className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-white text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                      <Icon size={16} strokeWidth={1.85} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-neutral-950 dark:text-white">
                        {res.label}
                      </p>
                      <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                        {valid ? res.url : "Not submitted yet"}
                      </p>
                    </div>
                  </div>
                  {valid && (
                    <a
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-black/15 bg-white px-3 py-1.5 text-[11px] font-bold text-neutral-900 transition hover:border-black/35 dark:border-white/15 dark:bg-[#08080A] dark:text-white dark:hover:border-white/35"
                    >
                      <span>Open</span>
                      <ExternalLink size={12} strokeWidth={1.85} />
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
        <div className="rounded-2xl border border-black/12 bg-white p-6 shadow-2xs dark:border-white/12 dark:bg-[#08080A]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-3 text-xs dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-black/12 bg-neutral-100 px-2.5 py-1 font-bold text-neutral-900 dark:border-white/14 dark:bg-[#101014] dark:text-white">
                <Award size={14} strokeWidth={1.85} />
                <span>Official Faculty Mentor Review</span>
              </span>
              <span className="font-medium text-neutral-500 dark:text-neutral-400">
                {team.reviewedAt
                  ? `Evaluated on ${formatDate(team.reviewedAt)}`
                  : "Verified Evaluation"}
              </span>
            </div>
            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Restricted: Team, Mentor &amp; Leadership Only
            </span>
          </div>
          <div className="mt-4">
            <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-neutral-950 dark:text-neutral-100">
              {team.mentorReview}
            </p>
            {team.mentor?.name && (
              <p className="mt-3 text-xs font-bold text-neutral-500 dark:text-neutral-400">
                — {team.mentor.name} (Faculty Mentor)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tasks List */}
      <SectionCard
        title={`Project Tasks (${tasks.length})`}
        subtitle={`${completedTasksCount} completed · ${pendingTasksCount} pending`}
        className="dark:!border-white/12 dark:!bg-[#08080A]"
      >
        {tasks.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No tasks yet"
            description="Tasks created for this team will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-black/10 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:border-white/10 dark:text-neutral-400">
                <tr>
                  <th className="py-2.5 pr-4">Task</th>
                  <th className="px-3 py-2.5">Assignee</th>
                  <th className="px-3 py-2.5">Priority</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="py-2.5 pl-3 text-right">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td className="py-3 pr-4">
                      <p className="font-bold text-neutral-950 dark:text-white">
                        {t.title}
                      </p>
                      {t.description && (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                          {t.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-neutral-700 dark:text-neutral-300">
                      {t.assignedTo?.name || "Unassigned"}
                    </td>
                    <td className="px-3 py-3">
                      <NeutralPill label={t.priority || "Normal"} />
                    </td>
                    <td className="px-3 py-3">
                      <NeutralPill label={t.status || "Pending"} />
                    </td>
                    <td className="py-3 pl-3 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                      {formatDate(t.dueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Project Activities */}
      <SectionCard
        title="Recent Project Activities"
        className="dark:!border-white/12 dark:!bg-[#08080A]"
      >
        {recentActivities.length === 0 ? (
          <EmptyState icon={Activity} title="No project activities logged yet" />
        ) : (
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {recentActivities.map((act) => (
              <div
                key={act.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-xs font-semibold text-neutral-950 dark:text-white">
                    {act.description}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {act.user?.name || "System"} · {act.action}
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
              className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="reassign-mentor-form"
              disabled={saving}
              className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
            >
              <span>
                {saving ? "Reassigning..." : "Confirm Reassignment"}
              </span>
            </button>
          </>
        }
      >
        <form
          id="reassign-mentor-form"
          onSubmit={handleReassignMentor}
          className="min-h-[280px] space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
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