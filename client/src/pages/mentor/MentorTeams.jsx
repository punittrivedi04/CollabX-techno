import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Award,
  CalendarClock,
  Check,
  Crown,
  FolderKanban,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";

import api from "../../services/api";
import {
  calculateProjectProgress,
  formatDate,
  getErrorMessage,
  resolveProjectStatus,
  timeAgo,
} from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  ProgressBar,
  SectionCard,
  SuccessAlert,
  portalPrimaryBtnClass,
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

export default function MentorTeams() {
  const [teams, setTeams] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [processingInvId, setProcessingInvId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

  const filteredTeams = teams.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;

    // 1. Project title / name
    const title = String(t.title || t.name || "").toLowerCase();
    if (title.includes(q)) return true;

    // 2. Project description
    const desc = String(t.description || "").toLowerCase();
    if (desc.includes(q)) return true;

    // 3. Team leader name, email, roll number
    const leaderName = String(
      t.teamLeader?.name || t.owner?.name || t.owner_name || "",
    ).toLowerCase();
    const leaderEmail = String(
      t.teamLeader?.email || t.owner?.email || t.owner_email || "",
    ).toLowerCase();
    const leaderRoll = String(
      t.teamLeader?.roll_no || t.teamLeader?.rollNumber || "",
    ).toLowerCase();
    if (
      leaderName.includes(q) ||
      leaderEmail.includes(q) ||
      leaderRoll.includes(q)
    ) {
      return true;
    }

    // 4. Team member names, emails, roll numbers
    if (
      Array.isArray(t.members) &&
      t.members.some((m) => {
        const mName = String(m?.name || "").toLowerCase();
        const mEmail = String(m?.email || "").toLowerCase();
        const mRoll = String(m?.roll_no || m?.rollNumber || "").toLowerCase();
        return mName.includes(q) || mEmail.includes(q) || mRoll.includes(q);
      })
    ) {
      return true;
    }

    // 5. Project tags, keywords, category
    if (
      Array.isArray(t.tags) &&
      t.tags.some((tag) => String(tag || "").toLowerCase().includes(q))
    ) {
      return true;
    }
    if (typeof t.tags === "string" && t.tags.toLowerCase().includes(q)) {
      return true;
    }
    if (
      Array.isArray(t.keywords) &&
      t.keywords.some((k) => String(k || "").toLowerCase().includes(q))
    ) {
      return true;
    }
    if (typeof t.keywords === "string" && t.keywords.toLowerCase().includes(q)) {
      return true;
    }
    if (t.category && String(t.category).toLowerCase().includes(q)) {
      return true;
    }

    return false;
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [teamsRes, invRes] = await Promise.all([
        api.get("/mentor/teams"),
        api
          .get("/mentor/invitations")
          .catch(() => ({ data: { invitations: [] } })),
      ]);
      setTeams(Array.isArray(teamsRes.data?.teams) ? teamsRes.data.teams : []);
      setInvitations(
        Array.isArray(invRes.data?.invitations || invRes.data?.data)
          ? invRes.data?.invitations || invRes.data?.data
          : [],
      );
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load your teams."));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRespondInvitation = async (invitationId, action) => {
    setProcessingInvId(invitationId);
    setError("");
    setSuccess("");
    try {
      const res = await api.patch(
        `/mentor/invitations/${invitationId}/${action}`,
      );
      setSuccess(
        res.data?.message ||
          (action === "accept"
            ? "Mentor invitation accepted! The team has been added to your workspace."
            : "Mentor invitation declined."),
      );
      await load();
    } catch (err) {
      setError(getErrorMessage(err, `Failed to ${action} mentor invitation.`));
    } finally {
      setProcessingInvId(null);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Mentor · Mentored Squads
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            My Teams &amp; Projects
          </h1>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 sm:text-sm">
            {search.trim() ? (
              <>
                Showing{" "}
                <span className="tabular-nums font-bold text-neutral-950 dark:text-white">
                  {filteredTeams.length}
                </span>{" "}
                of{" "}
                <span className="tabular-nums font-bold text-neutral-950 dark:text-white">
                  {teams.length}
                </span>{" "}
                authorized team(s).
              </>
            ) : (
              <>
                <span className="tabular-nums">{teams.length}</span> authorized
                team(s). Open any team to inspect details, manage deliverables, or
                open Official Team Chat.
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418] sm:w-auto`}
        >
          <RefreshCw
            size={15}
            strokeWidth={1.85}
            className={loading ? "animate-spin" : ""}
          />
          <span>Refresh</span>
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {!loading && invitations.length > 0 && (
        <SectionCard
          title={`Pending Mentor Invitations (${invitations.length})`}
          subtitle="Accept student mentor requests to officially assign yourself to their team."
          className="dark:!border-white/12 dark:!bg-[#08080A]"
        >
          <div className="space-y-3">
            {invitations.map((inv) => {
              const busy = processingInvId === inv.id;
              return (
                <div
                  key={inv.id}
                  className="flex flex-col justify-between gap-4 rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014] sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <NeutralBadge>
                        <Award size={11} strokeWidth={1.85} />
                        <span>Mentor Request</span>
                      </NeutralBadge>
                      <p className="truncate text-sm font-extrabold text-neutral-950 dark:text-white">
                        {inv.project?.title || "Student Project"}
                      </p>
                      {inv.project?.status && (
                        <NeutralBadge>{inv.project.status}</NeutralBadge>
                      )}
                    </div>
                    {inv.project?.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">
                        {inv.project.description}
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                      Invited by{" "}
                      <strong className="text-neutral-900 dark:text-neutral-200">
                        {inv.sender?.name || "Student"}
                      </strong>
                      {inv.sender?.email ? ` (${inv.sender.email})` : ""} ·{" "}
                      {inv.project?.memberCount || 1} member(s) ·{" "}
                      {timeAgo(inv.createdAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRespondInvitation(inv.id, "accept")}
                      className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
                    >
                      <Check size={14} strokeWidth={2} />
                      <span>
                        {busy ? "Processing..." : "Accept & Mentor Team"}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRespondInvitation(inv.id, "reject")}
                      className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white sm:w-auto`}
                    >
                      <X size={14} strokeWidth={1.85} />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {loading && teams.length === 0 ? (
        <LoadingState label="Loading your teams..." />
      ) : teams.length === 0 ? (
        <div className="rounded-2xl border border-black/12 bg-white p-6 dark:border-white/12 dark:bg-[#08080A]">
          <EmptyState
            icon={FolderKanban}
            title="No teams assigned yet"
            description="Teams assigned to you by an administrator or accepted via student mentor invitations will appear here."
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative flex items-center">
            <Search
              size={16}
              strokeWidth={1.85}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project title, leader, members, or description..."
              aria-label="Search teams and projects"
              className="w-full rounded-xl border border-black/12 bg-white py-2.5 pl-10 pr-10 text-xs font-medium text-neutral-950 shadow-2xs outline-none transition placeholder:text-neutral-400 focus:border-black/40 focus:ring-2 focus:ring-black/5 dark:border-white/12 dark:bg-[#08080A] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/40 dark:focus:ring-white/5 sm:text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <X size={15} strokeWidth={2} />
              </button>
            )}
          </div>

          {filteredTeams.length === 0 ? (
            <div className="rounded-2xl border border-black/12 bg-white p-6 dark:border-white/12 dark:bg-[#08080A]">
              <EmptyState
                icon={Search}
                title="No matching teams found"
                description={`No teams or projects matched "${search.trim()}". Try searching with a different title, leader, member, or keyword.`}
                action={
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
                  >
                    <X size={14} strokeWidth={1.85} />
                    <span>Clear search</span>
                  </button>
                }
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTeams.map((t) => (
                <Link
                  key={t.id}
                  to={`/mentor/teams/${t.id}`}
                  className="group flex flex-col justify-between rounded-2xl border border-black/12 bg-white p-5 shadow-2xs transition hover:border-black/35 dark:border-white/12 dark:bg-[#08080A] dark:hover:border-white/35"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="line-clamp-1 text-base font-extrabold text-neutral-950 group-hover:underline dark:text-white">
                        {t.title}
                      </h2>
                      <NeutralBadge>{resolveProjectStatus(t)}</NeutralBadge>
                    </div>

                    {t.description && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                        {t.description}
                      </p>
                    )}

                    <div className="mt-4 space-y-2 rounded-xl border border-black/10 bg-neutral-50 p-3.5 text-xs dark:border-white/10 dark:bg-[#101014]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                          <Crown size={13} strokeWidth={1.85} />
                          <span>Team Leader</span>
                        </span>
                        <span className="truncate font-bold text-neutral-950 dark:text-white">
                          {t.teamLeader?.name || "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                          <Users size={13} strokeWidth={1.85} />
                          <span>Roster</span>
                        </span>
                        <span className="font-bold tabular-nums text-neutral-950 dark:text-white">
                          {t.memberCount ?? 0} student(s)
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                          <CalendarClock size={13} strokeWidth={1.85} />
                          <span>Deadline</span>
                        </span>
                        <span className="font-bold tabular-nums text-neutral-950 dark:text-white">
                          {formatDate(t.deadline)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="mb-1.5 tabular-nums text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                        Progress · Tasks {t.taskProgress?.completed || 0}/
                        {t.taskProgress?.total || 0}
                      </p>
                      <ProgressBar
                        value={calculateProjectProgress(t)}
                        showLabel
                        height="h-1.5"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-black/10 pt-3 text-xs font-bold text-neutral-900 dark:border-white/10 dark:text-white">
                    <span>Manage Team &amp; Details</span>
                    <ArrowUpRight size={15} strokeWidth={1.85} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}