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
  Users,
  X,
} from "lucide-react";

import api from "../../services/api";
import { calculateProjectProgress, formatDate, getErrorMessage, resolveProjectStatus, timeAgo } from "../../utils/portalHelpers";
import {
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

export default function MentorTeams() {
  const [teams, setTeams] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [processingInvId, setProcessingInvId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [teamsRes, invRes] = await Promise.all([
        api.get("/mentor/teams"),
        api.get("/mentor/invitations").catch(() => ({ data: { invitations: [] } })),
      ]);
      setTeams(teamsRes.data?.teams || []);
      setInvitations(invRes.data?.invitations || invRes.data?.data || []);
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
      const res = await api.patch(`/mentor/invitations/${invitationId}/${action}`);
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
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
            Mentor · Mentored Squads
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            My Teams &amp; Projects
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {teams.length} authorized team(s). Open any team to inspect details, manage deliverables, or open Official Team Chat.
          </p>
        </div>

        <button type="button" onClick={load} disabled={loading} className={portalSecondaryBtnClass}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {!loading && invitations.length > 0 && (
        <SectionCard
          title={`Pending Mentor Invitations (${invitations.length})`}
          subtitle="Accept student mentor requests to officially assign yourself to their team."
        >
          <div className="space-y-3">
            {invitations.map((inv) => {
              const busy = processingInvId === inv.id;
              return (
                <div
                  key={inv.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-[#15803D]/30 bg-[var(--bg-surface-elevated)] p-4 sm:flex-row sm:items-center dark:border-[#A3E635]/25"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                        <Award size={12} /> Mentor Request
                      </span>
                      <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">
                        {inv.project?.title || "Student Project"}
                      </p>
                      {inv.project?.status && <StatusBadge status={inv.project.status} />}
                    </div>
                    {inv.project?.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                        {inv.project.description}
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                      Invited by <strong className="text-[var(--text-primary)]">{inv.sender?.name || "Student"}</strong>
                      {inv.sender?.email ? ` (${inv.sender.email})` : ""} · {inv.project?.memberCount || 1} member(s) · {timeAgo(inv.createdAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRespondInvitation(inv.id, "accept")}
                      className={portalPrimaryBtnClass}
                    >
                      <Check size={14} /> {busy ? "Processing..." : "Accept & Mentor Team"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRespondInvitation(inv.id, "reject")}
                      className={portalSecondaryBtnClass}
                    >
                      <X size={14} /> Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {loading ? (
        <LoadingState label="Loading your teams..." />
      ) : teams.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No teams assigned yet"
          description="Teams assigned to you by an administrator or accepted via student mentor invitations will appear here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <Link
              key={t.id}
              to={`/mentor/teams/${t.id}`}
              className="group flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-[#15803D]/55 dark:hover:border-[#A3E635]/55"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="line-clamp-1 text-base font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-text)]">
                    {t.title}
                  </h2>
                  <StatusBadge status={resolveProjectStatus(t)} />
                </div>

                {t.description && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {t.description}
                  </p>
                )}

                <div className="mt-4 space-y-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <Crown size={13} className="text-amber-500" /> Team Leader
                    </span>
                    <span className="truncate font-bold text-[var(--text-primary)]">
                      {t.teamLeader?.name || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <Users size={13} /> Roster
                    </span>
                    <span className="font-bold text-[var(--text-primary)]">{t.memberCount} student(s)</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <CalendarClock size={13} /> Deadline
                    </span>
                    <span className="font-bold text-[var(--text-primary)]">{formatDate(t.deadline)}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-1 text-[11px] font-bold text-[var(--text-muted)]">
                    Progress · Tasks {t.taskProgress?.completed || 0}/{t.taskProgress?.total || 0}
                  </p>
                  <ProgressBar value={calculateProjectProgress(t)} showLabel height="h-2" />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-xs font-bold text-[var(--accent-text)]">
                <span>Manage Team &amp; Details</span>
                <ArrowUpRight size={15} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
