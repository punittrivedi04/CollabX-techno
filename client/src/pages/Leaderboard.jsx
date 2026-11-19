import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Crown,
  ExternalLink,
  FolderKanban,
  GraduationCap,
  Info,
  Presentation,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Users,
  Video,
  X,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getSocket } from "../services/socket";
import {
  formatDate,
  formatRelativeTime,
  getErrorMessage,
  getInitials,
  isValidHttpUrl,
} from "../utils/portalHelpers";
import { getEffectiveRole, getRoleDisplayLabel } from "../utils/roles";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  StatusBadge,
  SuccessAlert,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../components/portal/PortalUI";

function rankProjects(list) {
  if (!Array.isArray(list)) return [];
  const sorted = [...list].sort((a, b) => {
    const starDiff = (Number(b.starCount) || 0) - (Number(a.starCount) || 0);
    if (starDiff !== 0) return starDiff;
    const timeA = new Date(a.submittedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.submittedAt || b.createdAt || 0).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
  return sorted.map((p, idx) => ({
    ...p,
    rank: idx + 1,
  }));
}

export default function Leaderboard() {
  const { user } = useAuth();
  const currentUserId = user?.id || user?._id;

  const [projects, setProjects] = useState([]);
  const [eligibleProjects, setEligibleProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Public Inspection Modal
  const [selectedProject, setSelectedProject] = useState(null);

  // Categorized Stars Breakdown Panel
  const [inspectingStarsProject, setInspectingStarsProject] = useState(null);
  const [starsBreakdown, setStarsBreakdown] = useState(null);
  const [starsLoading, setStarsLoading] = useState(false);
  const [starsError, setStarsError] = useState("");

  // Submit / Manage Modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submittingId, setSubmittingId] = useState(null);
  const [votingId, setVotingId] = useState(null);

  // Fetch stars breakdown
  const fetchStarsBreakdown = useCallback(async (project) => {
    if (!project?.id) return;
    setStarsLoading(true);
    setStarsError("");
    try {
      const res = await api.get(`/leaderboard/projects/${project.id}/stars`);
      setStarsBreakdown(res.data);
    } catch (err) {
      setStarsError(getErrorMessage(err, "Failed to load star endorsements."));
    } finally {
      setStarsLoading(false);
    }
  }, []);

  const openStarsBreakdown = (project) => {
    setInspectingStarsProject(project);
    fetchStarsBreakdown(project);
  };

  const closeStarsBreakdown = () => {
    setInspectingStarsProject(null);
    setStarsBreakdown(null);
    setStarsError("");
  };

  const loadLeaderboard = useCallback(async (bg = false) => {
    if (!bg) setLoading(true);
    setError("");
    try {
      const [boardRes, eligibleRes] = await Promise.all([
        api.get("/leaderboard"),
        api.get("/leaderboard/my-eligible").catch(() => ({ data: { projects: [] } })),
      ]);

      const list = boardRes.data?.projects || boardRes.data?.data || [];
      const rawProjects = Array.isArray(list) ? list : [];
      setProjects(rankProjects(rawProjects));
      setEligibleProjects(eligibleRes.data?.projects || []);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load College Leaderboard."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  // Keep selectedProject in sync with master projects list if open
  useEffect(() => {
    if (!selectedProject?.id) return;
    const current = projects.find((p) => String(p.id) === String(selectedProject.id));
    if (
      current &&
      (current.rank !== selectedProject.rank ||
        current.starCount !== selectedProject.starCount ||
        current.isStarred !== selectedProject.isStarred)
    ) {
      setSelectedProject((prev) => (prev ? { ...prev, ...current } : null));
    }
  }, [projects, selectedProject?.id]);

  // Filter projects by search keyword while preserving true original rank
  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const title = (p.title || p.name || "").toLowerCase();
      const desc = (p.description || "").toLowerCase();
      const leaderName = (p.teamLeader?.name || "").toLowerCase();
      const leaderRoll = (p.teamLeader?.roll_no || "").toLowerCase();
      const mentorName = (p.mentor?.name || "").toLowerCase();
      const membersMatch =
        Array.isArray(p.members) &&
        p.members.some(
          (m) =>
            (m.name || "").toLowerCase().includes(q) ||
            (m.roll_no || "").toLowerCase().includes(q),
        );
      return (
        title.includes(q) ||
        desc.includes(q) ||
        leaderName.includes(q) ||
        leaderRoll.includes(q) ||
        mentorName.includes(q) ||
        membersMatch
      );
    });
  }, [projects, search]);

  // Real-time Socket.IO listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleStarUpdate = ({ projectId, starCount }) => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          String(p.id) === String(projectId) ? { ...p, starCount: Number(starCount) } : p,
        );
        return rankProjects(next);
      });
      setSelectedProject((prev) => {
        if (prev && String(prev.id) === String(projectId)) {
          return { ...prev, starCount: Number(starCount) };
        }
        return prev;
      });
      setInspectingStarsProject((prev) => {
        if (prev && String(prev.id) === String(projectId)) {
          fetchStarsBreakdown(prev);
        }
        return prev;
      });
    };

    const handleNewProject = () => {
      loadLeaderboard(true);
    };

    const handleProjectWithdrawn = ({ projectId }) => {
      setProjects((prev) => {
        const next = prev.filter((p) => String(p.id) !== String(projectId));
        return rankProjects(next);
      });
      setSelectedProject((prev) => (prev && String(prev.id) === String(projectId) ? null : prev));
    };

    socket.on("leaderboard:star_update", handleStarUpdate);
    socket.on("leaderboard:new_project", handleNewProject);
    socket.on("leaderboard:project_withdrawn", handleProjectWithdrawn);

    return () => {
      socket.off("leaderboard:star_update", handleStarUpdate);
      socket.off("leaderboard:new_project", handleNewProject);
      socket.off("leaderboard:project_withdrawn", handleProjectWithdrawn);
    };
  }, [fetchStarsBreakdown, loadLeaderboard]);

  // Toggle star vote
  const handleToggleStar = async (projectId) => {
    if (votingId) return;
    setVotingId(projectId);
    setError("");

    // Optimistic UI update
    setProjects((prev) => {
      const next = prev.map((p) => {
        if (String(p.id) === String(projectId)) {
          const nextStarred = !p.isStarred;
          const nextCount = nextStarred ? p.starCount + 1 : Math.max(0, p.starCount - 1);
          return { ...p, isStarred: nextStarred, starCount: nextCount };
        }
        return p;
      });
      return rankProjects(next);
    });
    if (selectedProject && String(selectedProject.id) === String(projectId)) {
      setSelectedProject((prev) => ({
        ...prev,
        isStarred: !prev.isStarred,
        starCount: !prev.isStarred ? prev.starCount + 1 : Math.max(0, prev.starCount - 1),
      }));
    }

    try {
      const res = await api.post(`/leaderboard/projects/${projectId}/star`);
      const { isStarred, starCount } = res.data;

      setProjects((prev) => {
        const next = prev.map((p) =>
          String(p.id) === String(projectId)
            ? { ...p, isStarred, starCount: Number(starCount) }
            : p,
        );
        return rankProjects(next);
      });
      if (selectedProject && String(selectedProject.id) === String(projectId)) {
        setSelectedProject((prev) => ({ ...prev, isStarred, starCount: Number(starCount) }));
      }
      if (inspectingStarsProject && String(inspectingStarsProject.id) === String(projectId)) {
        fetchStarsBreakdown(inspectingStarsProject);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update star vote."));
      loadLeaderboard(true);
    } finally {
      setVotingId(null);
    }
  };

  // Submit project to leaderboard
  const handleSubmitProject = async (projectId) => {
    setSubmittingId(projectId);
    setError("");
    setSuccess("");
    try {
      const res = await api.post(`/leaderboard/projects/${projectId}/submit`);
      setSuccess(res.data?.message || "Project published on Leaderboard!");
      await loadLeaderboard(true);
      setShowSubmitModal(false);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to submit project to Leaderboard."));
    } finally {
      setSubmittingId(null);
    }
  };

  // Withdraw project from leaderboard
  const handleWithdrawProject = async (projectId) => {
    if (!window.confirm("Withdraw this project from the College Leaderboard?")) return;
    setSubmittingId(projectId);
    setError("");
    setSuccess("");
    try {
      const res = await api.delete(`/leaderboard/projects/${projectId}/submit`);
      setSuccess(res.data?.message || "Project withdrawn from Leaderboard.");
      await loadLeaderboard(true);
      setShowSubmitModal(false);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to withdraw project."));
    } finally {
      setSubmittingId(null);
    }
  };

  const getRankBadge = (rank) => {
    const num = Number(rank);
    if (num === 1) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-gradient-to-r from-amber-500/20 to-yellow-400/20 px-3 py-1 text-xs font-black text-amber-700 dark:text-amber-300 shadow-sm">
          <Trophy size={13} className="text-amber-500 fill-amber-500/20" />
          <span>#1</span>
        </span>
      );
    }
    if (num === 2) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-slate-600 bg-gradient-to-r from-slate-200/70 to-slate-300/40 dark:from-slate-700/50 dark:to-slate-800/50 px-3 py-1 text-xs font-black text-slate-700 dark:text-slate-200 shadow-sm">
          <Award size={13} className="text-slate-500 dark:text-slate-300" />
          <span>#2</span>
        </span>
      );
    }
    if (num === 3) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-700/40 dark:border-amber-600/40 bg-gradient-to-r from-amber-700/15 to-amber-900/15 px-3 py-1 text-xs font-black text-amber-900 dark:text-amber-300 shadow-sm">
          <Award size={13} className="text-amber-700 dark:text-amber-500" />
          <span>#3</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-2.5 py-1 text-xs font-extrabold text-[var(--text-secondary)] shadow-2xs">
        #{num || "-"}
      </span>
    );
  };

  const myEligibleCount = eligibleProjects.filter((p) => !p.isOnLeaderboard).length;

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-[32px] border border-[var(--border-subtle)] bg-gradient-to-br from-[var(--bg-surface)] via-[var(--bg-surface-elevated)] to-[var(--bg-surface)] p-6 shadow-2xs sm:p-8">
        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-black tracking-tight text-[var(--text-primary)] sm:text-4xl">
              College Project Leaderboard
            </h1>

            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)] sm:text-sm">
              Explore standout student projects completed across all squads. Dual-ranked by total peer &amp; faculty
              stars, with newest competing projects naturally rewarded.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {eligibleProjects.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSubmitModal(true)}
                className={portalPrimaryBtnClass}
              >
                <Sparkles size={14} /> Submit My Project
                {myEligibleCount > 0 && (
                  <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    {myEligibleCount} Ready
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => loadLeaderboard(true)}
              disabled={loading}
              className={portalSecondaryBtnClass}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {/* Search & Statistics Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-2xs sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by title, keywords, team leader, or roll number..."
            className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-input)] py-2.5 pl-10 pr-4 text-xs font-medium text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[#15803D] dark:focus:border-[#22C55E]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
          <span className="rounded-full bg-[var(--bg-surface-elevated)] px-3 py-1">
            {search.trim()
              ? `${filteredProjects.length} of ${projects.length} project(s)`
              : `${projects.length} project(s) ranked`}
          </span>
        </div>
      </div>

      {/* Leaderboard Cards Grid */}
      {loading ? (
        <LoadingState label="Loading College Leaderboard ranking..." />
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={search ? "No matching projects found" : "No projects published yet"}
          description={
            search
              ? "Try adjusting your search query or clear the filter."
              : "Completed projects submitted by their Project Leaders will be ranked here. Only 100% finished projects are eligible!"
          }
          action={
            eligibleProjects.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowSubmitModal(true)}
                className={portalPrimaryBtnClass}
              >
                <Sparkles size={14} /> Submit a Completed Project
              </button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((proj) => {
            const hasPpt = isValidHttpUrl(proj.pptUrl);
            const hasDemo = isValidHttpUrl(proj.demoUrl);
            const isMyProject =
              currentUserId && proj.teamLeader && String(proj.teamLeader.id) === String(currentUserId);

            return (
              <div
                key={proj.id}
                className="group relative flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-[#15803D]/55 dark:hover:border-[#A3E635]/55"
              >
                <div>
                  {/* Top Row: Rank, Time Ago & Star Voting */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {getRankBadge(proj.rank)}
                      {/* Dynamic Time Ago */}
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]"
                        title={`Published ${formatDate(proj.submittedAt || proj.createdAt)}`}
                      >
                        <Clock size={10} className="text-[var(--text-muted)]" />
                        <span>{formatRelativeTime(proj.submittedAt || proj.createdAt)}</span>
                      </span>
                    </div>

                    {/* Star Actions: Give Star + View Categorized Breakdown */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        disabled={votingId === proj.id}
                        onClick={() => handleToggleStar(proj.id)}
                        title={proj.isStarred ? "Click to remove your star" : "Click to give 1 star"}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                          proj.isStarred
                            ? "border-amber-400/60 bg-amber-400/15 text-amber-800 dark:text-amber-200 shadow-xs"
                            : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:border-amber-400/50 hover:text-amber-600"
                        }`}
                      >
                        <Star
                          size={13}
                          className={`transition-colors ${
                            proj.isStarred ? "fill-amber-400 text-amber-500" : "text-[var(--text-muted)]"
                          }`}
                        />
                        <span>{proj.starCount}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openStarsBreakdown(proj)}
                        title="Inspect who gave a star (Categorized by Directors, Mentors, and Students)"
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:border-[#15803D]/50 dark:hover:border-[#A3E635]/50 hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Users size={11} className="text-[var(--text-muted)]" />
                        <span>Stars</span>
                      </button>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h2 className="mt-3.5 line-clamp-1 text-base font-extrabold text-[var(--text-primary)]">
                    {proj.title}
                  </h2>

                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {proj.description || "No project description provided."}
                  </p>

                  {/* Team Leader & Squad details */}
                  <div className="mt-4 space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                        <Crown size={13} className="text-amber-500" /> Leader
                      </span>
                      <div className="min-w-0 text-right">
                        <p className="truncate font-bold text-[var(--text-primary)]">
                          {proj.teamLeader?.name || "Unassigned"}
                        </p>
                        {proj.teamLeader?.roll_no && (
                          <p className="font-mono text-[10px] text-[var(--text-muted)]">
                            {proj.teamLeader.roll_no}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-1.5">
                      <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                        <Users size={13} /> Squad
                      </span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {proj.memberCount} student(s)
                      </span>
                    </div>

                    {proj.mentor && (
                      <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-1.5">
                        <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                          <GraduationCap size={13} className="text-[var(--accent-text)]" /> Mentor
                        </span>
                        <span className="truncate font-bold text-[var(--text-primary)]">
                          {proj.mentor.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Deliverable Links + Public Inspect Button */}
                <div className="mt-4 border-t border-[var(--border-subtle)] pt-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {hasPpt ? (
                        <a
                          href={proj.pptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open Presentation PPT"
                          className="inline-flex items-center gap-1 rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-300 transition hover:bg-sky-500/20"
                        >
                          <Presentation size={13} /> PPT
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-xl bg-[var(--bg-surface-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] opacity-60">
                          <Presentation size={13} /> PPT —
                        </span>
                      )}

                      {hasDemo ? (
                        <a
                          href={proj.demoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open Live Demo"
                          className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-500/20"
                        >
                          <Video size={13} /> Live Demo
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-xl bg-[var(--bg-surface-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] opacity-60">
                          <Video size={13} /> Demo —
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedProject(proj)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent-text)] transition hover:underline cursor-pointer"
                    >
                      <span>Inspect Project</span>
                      <ExternalLink size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PUBLIC PROJECT DETAIL MODAL (Exposes ONLY core details, PPT & Demo link, Zero internal chats) */}
      <Modal
        open={Boolean(selectedProject)}
        onClose={() => setSelectedProject(null)}
        title={
          selectedProject ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black">{selectedProject.title}</span>
              {getRankBadge(selectedProject.rank)}
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                <Clock size={10} className="text-[var(--text-muted)]" />
                <span>Published {formatRelativeTime(selectedProject.submittedAt || selectedProject.createdAt)}</span>
              </span>
            </div>
          ) : (
            "Project Showcase"
          )
        }
        description="Public view on College Leaderboard · PPT & Live Demo links"
        size="max-w-2xl"
      >
        {selectedProject && (
          <div className="space-y-5">
            {/* Project Summary */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                About the Project
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-primary)] sm:text-sm">
                {selectedProject.description || "No project description provided."}
              </p>
            </div>

            {/* Core Deliverable Links (PPT + Demo) */}
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Showcase Deliverables
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-300">
                      <Presentation size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Presentation (PPT)</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {isValidHttpUrl(selectedProject.pptUrl) ? "Slide deck ready" : "Not submitted"}
                      </p>
                    </div>
                  </div>
                  {isValidHttpUrl(selectedProject.pptUrl) ? (
                    <a
                      href={selectedProject.pptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-sky-700"
                    >
                      <Presentation size={13} /> Open Presentation <ExternalLink size={12} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="rounded-full bg-[var(--bg-surface-subtle)] px-4 py-2 text-xs font-bold text-[var(--text-muted)] opacity-50"
                    >
                      No Presentation Link
                    </button>
                  )}
                </div>

                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                      <Video size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">Live Demo Link</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {isValidHttpUrl(selectedProject.demoUrl) ? "Demo link ready" : "Not submitted"}
                      </p>
                    </div>
                  </div>
                  {isValidHttpUrl(selectedProject.demoUrl) ? (
                    <a
                      href={selectedProject.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                    >
                      <Video size={13} /> View Live Demo <ExternalLink size={12} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="rounded-full bg-[var(--bg-surface-subtle)] px-4 py-2 text-xs font-bold text-[var(--text-muted)] opacity-50"
                    >
                      No Live Demo Link
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Team Roster (Leader + Members) */}
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Team Squad ({selectedProject.memberCount})
              </h3>
              <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
                {selectedProject.teamLeader && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 p-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-[11px] font-black text-black">
                        {getInitials(selectedProject.teamLeader.name)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--text-primary)]">
                          {selectedProject.teamLeader.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {selectedProject.teamLeader.email}
                          {selectedProject.teamLeader.roll_no ? ` · Roll: ${selectedProject.teamLeader.roll_no}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200">
                      <Crown size={11} /> Team Leader
                    </span>
                  </div>
                )}

                {(selectedProject.members || []).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#141A17] text-[10px] font-bold text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]">
                        {getInitials(m.name)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--text-primary)]">{m.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {m.email} {m.roll_no ? `· Roll: ${m.roll_no}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                      Member
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Voting & Stars Inspection CTA */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  Total Stars: <strong className="text-amber-500">{selectedProject.starCount}</strong>
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {selectedProject.isStarred ? "You starred this project" : "1 vote per user"} · Published{" "}
                  {formatRelativeTime(selectedProject.submittedAt || selectedProject.createdAt)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openStarsBreakdown(selectedProject)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-bold text-[var(--text-primary)] transition hover:border-[#15803D]/50 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  title="View categorized star breakdown by role"
                >
                  <Users size={13} />
                  <span>View Star Breakdown</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleStar(selectedProject.id)}
                  disabled={votingId === selectedProject.id}
                  className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition cursor-pointer ${
                    selectedProject.isStarred
                      ? "border border-amber-400 bg-amber-400/20 text-amber-800 dark:text-amber-200"
                      : portalPrimaryBtnClass
                  }`}
                >
                  <Star
                    size={15}
                    className={selectedProject.isStarred ? "fill-amber-400 text-amber-500" : ""}
                  />
                  <span>{selectedProject.isStarred ? "Starred (Click to Remove)" : "Give Star"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* SUBMIT / MANAGE COMPLETED PROJECTS MODAL */}
      <Modal
        open={showSubmitModal}
        onClose={() => !submittingId && setShowSubmitModal(false)}
        title="Submit Project to College Leaderboard"
        description="Only 100% completed projects with both Presentation (PPT) and Live Demo links can be published by their Project Leader."
        size="max-w-xl"
      >
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            Publishing your project showcases your live demo and presentation across the institute. Both PPT and Live Demo links must remain active to stay on the Leaderboard.
          </p>

          {eligibleProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-strong)] p-6 text-center text-xs text-[var(--text-muted)]">
              You do not have any completed projects yet. Complete all tasks or mark your project status as
              "Completed" to submit!
            </div>
          ) : (
            <div className="space-y-3">
              {eligibleProjects.map((p) => {
                const isDeliverablesReady = Boolean(
                  p.hasValidDeliverables ?? (isValidHttpUrl(p.pptUrl) && isValidHttpUrl(p.demoUrl))
                );
                const isPublished = Boolean(p.isOnLeaderboard);
                const busy = submittingId === p.id;

                return (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">
                          {p.title}
                        </p>
                        {isPublished ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                            On Leaderboard ({p.starCount || 0} ⭐)
                          </span>
                        ) : isDeliverablesReady ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                            Eligible to Submit
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">
                            Missing PPT / Demo Link
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-[var(--text-muted)]">
                        {p.description || "100% Completed Project"}
                      </p>
                      {!isDeliverablesReady && (
                        <p className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                          Requires both valid PPT &amp; Live Demo links to submit.
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {isPublished ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleWithdrawProject(p.id)}
                          className={portalSecondaryBtnClass}
                        >
                          {busy ? "Working..." : "Withdraw"}
                        </button>
                      ) : isDeliverablesReady ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleSubmitProject(p.id)}
                          className={portalPrimaryBtnClass}
                        >
                          <Sparkles size={14} /> {busy ? "Publishing..." : "Publish to Leaderboard"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="rounded-full bg-[var(--bg-surface-subtle)] px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] opacity-60 cursor-not-allowed"
                          title="Upload PPT and Live Demo in Projects to qualify"
                        >
                          Links Required
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-3">
            <button
              type="button"
              onClick={() => setShowSubmitModal(false)}
              className={portalSecondaryBtnClass}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* CATEGORIZED STAR VIEW PANEL (Directors Top, Mentors Middle, Students Below, Tailored Perspective) */}
      <Modal
        open={Boolean(inspectingStarsProject)}
        onClose={closeStarsBreakdown}
        title={
          inspectingStarsProject ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black">Star Endorsements: {inspectingStarsProject.title}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-200">
                <Star size={12} className="fill-amber-400 text-amber-500" />
                {starsBreakdown?.totalStars ?? inspectingStarsProject.starCount} Total
              </span>
            </div>
          ) : (
            "Star Endorsements Breakdown"
          )
        }
        description="Unified list of peer and faculty endorsements, dynamically ordered and highlighted by role"
        size="max-w-2xl"
      >
        {starsLoading && !starsBreakdown ? (
          <LoadingState label="Loading star endorsements..." />
        ) : (
          <div className="space-y-4">
            {starsError && <ErrorAlert message={starsError} onDismiss={() => setStarsError("")} />}

            {(() => {
              const allVoters = [
                ...(starsBreakdown?.categorized?.directors || []).map((v) => ({ ...v, tier: "director" })),
                ...(starsBreakdown?.categorized?.admins || []).map((v) => ({ ...v, tier: "admin" })),
                ...(starsBreakdown?.categorized?.mentors || []).map((v) => ({ ...v, tier: "mentor" })),
                ...(starsBreakdown?.categorized?.students || []).map((v) => ({ ...v, tier: "student" })),
              ];

              return (
                <>
                  {/* Perspective Status Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[var(--text-primary)]">
                        {allVoters.length} {allVoters.length === 1 ? "Star Endorsement" : "Star Endorsements"}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="text-[var(--text-secondary)] font-medium">
                        Viewing as {getRoleDisplayLabel(user)}
                      </span>
                    </div>

                    {starsBreakdown?.currentUserStarred ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                        <Star size={11} className="fill-amber-400 text-amber-500" /> Starred by You
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                        1 vote allowed per user
                      </span>
                    )}
                  </div>

                  {/* Empty State */}
                  {allVoters.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-8 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
                        <Star size={24} />
                      </div>
                      <h4 className="mt-3 text-sm font-extrabold text-[var(--text-primary)]">
                        No Star Endorsements Yet
                      </h4>
                      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[var(--text-muted)]">
                        This project has not received any stars yet. Be the first to give it an endorsement!
                      </p>
                    </div>
                  ) : (
                    /* Unified Vertical List (No Heavy Boxes / Columns) */
                    <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
                      {allVoters.map((v) => {
                        const isDirector = v.tier === "director";
                        const isAdmin = v.tier === "admin";
                        const isMentor = v.tier === "mentor";
                        const isStudent = v.tier === "student";

                        return (
                          <div
                            key={v.starId || v.id}
                            className={`flex items-center justify-between gap-3 p-3.5 transition hover:bg-[var(--bg-surface-elevated)] ${
                              isDirector
                                ? "border-l-4 border-amber-500 bg-amber-500/[0.04] dark:bg-amber-400/[0.03]"
                                : isAdmin
                                ? "border-l-4 border-purple-500 bg-purple-500/[0.04]"
                                : isMentor
                                ? "border-l-4 border-emerald-500 bg-emerald-500/[0.03]"
                                : "pl-4"
                            } ${v.isCurrentUser ? "ring-1 ring-inset ring-amber-400/50" : ""}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Avatar with role-based sizing & colors */}
                              <div
                                className={`flex shrink-0 items-center justify-center rounded-full font-black ${
                                  isDirector
                                    ? "h-11 w-11 bg-gradient-to-tr from-purple-700 via-amber-600 to-amber-400 text-white text-sm shadow-xs ring-2 ring-amber-400/40"
                                    : isAdmin
                                    ? "h-10 w-10 bg-purple-600 text-white text-sm shadow-xs ring-2 ring-purple-400/30"
                                    : isMentor
                                    ? "h-9 w-9 bg-emerald-600 text-white text-xs font-bold shadow-2xs"
                                    : "h-8 w-8 bg-[#141A17] text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B] text-[11px] font-bold"
                                }`}
                              >
                                {getInitials(v.name)}
                              </div>

                              <div className="min-w-0">
                                {/* Name with Dynamic Sizing & Colors */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {isDirector ? (
                                    <p className="truncate text-base sm:text-lg font-black tracking-tight text-amber-600 dark:text-amber-400">
                                      {v.name}
                                    </p>
                                  ) : isAdmin ? (
                                    <p className="truncate text-base sm:text-lg font-black tracking-tight text-purple-700 dark:text-purple-300">
                                      {v.name}
                                    </p>
                                  ) : isMentor ? (
                                    <p className="truncate text-sm sm:text-base font-bold text-emerald-800 dark:text-emerald-300">
                                      {v.name}
                                    </p>
                                  ) : (
                                    <p className="truncate text-xs sm:text-sm font-semibold text-[var(--text-primary)]">
                                      {v.name}
                                    </p>
                                  )}

                                  {v.isCurrentUser && (
                                    <span className="rounded-full bg-emerald-600 px-1.5 py-0.2 text-[9px] font-bold text-white shadow-2xs">
                                      You
                                    </span>
                                  )}
                                </div>

                                <p className="truncate text-[11px] text-[var(--text-muted)]">
                                  {v.email}
                                  {isStudent && v.rollNo ? (
                                    <span className="ml-1.5 font-mono font-semibold text-[var(--text-secondary)]">
                                      · Roll: {v.rollNo}
                                    </span>
                                  ) : null}
                                </p>
                              </div>
                            </div>

                            {/* Role Badge and Time Ago */}
                            <div className="text-right shrink-0">
                              {isDirector ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-black text-amber-800 dark:text-amber-300">
                                  <Crown size={12} className="text-amber-500" />
                                  Director
                                </span>
                              ) : isAdmin ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-purple-400/50 bg-purple-500/15 px-2.5 py-0.5 text-[11px] font-bold text-purple-800 dark:text-purple-300">
                                  <ShieldCheck size={12} />
                                  Admin
                                </span>
                              ) : isMentor ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                                  <GraduationCap size={11} />
                                  Faculty Mentor
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                                  <Users size={10} />
                                  Student
                                </span>
                              )}
                              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                                {formatRelativeTime(v.starredAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Modal Bottom CTA */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  {starsBreakdown?.currentUserStarred
                    ? "⭐ You have endorsed this project"
                    : "You have not starred this project yet (1 vote per user)"}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Your star vote appears instantly in the list above.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {inspectingStarsProject && (
                  <button
                    type="button"
                    onClick={() => handleToggleStar(inspectingStarsProject.id)}
                    disabled={votingId === inspectingStarsProject.id}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition cursor-pointer ${
                      starsBreakdown?.currentUserStarred
                        ? "border border-amber-400 bg-amber-400/20 text-amber-800 dark:text-amber-200"
                        : portalPrimaryBtnClass
                    }`}
                  >
                    <Star
                      size={14}
                      className={starsBreakdown?.currentUserStarred ? "fill-amber-400 text-amber-500" : ""}
                    />
                    <span>
                      {starsBreakdown?.currentUserStarred
                        ? "Remove Star"
                        : "Give 1 Star"}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={closeStarsBreakdown}
                  className={portalSecondaryBtnClass}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
