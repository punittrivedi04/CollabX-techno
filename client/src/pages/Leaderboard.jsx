import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  CheckCircle2,
  Clock,
  Crown,
  ExternalLink,
  GraduationCap,
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
import { getRoleDisplayLabel } from "../utils/roles";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
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

function NeutralBadge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200 ${className}`}
    >
      {children}
    </span>
  );
}

export default function Leaderboard() {
  const { user } = useAuth();
  const role = String(user?.role || "").toLowerCase();
  const isAdmin = role === "admin" || role === "coordinator";

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
  const inspectingProjectIdRef = useRef(null);
  const breakdownSeqRef = useRef(0);

  // Submit / Manage Modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submittingId, setSubmittingId] = useState(null);
  const [votingId, setVotingId] = useState(null);

  const fetchStarsBreakdown = useCallback(async (project) => {
    const projectId = project?.id;
    if (!projectId) return;
    const reqId = ++breakdownSeqRef.current;
    setStarsLoading(true);
    setStarsError("");
    try {
      const res = await api.get(`/leaderboard/projects/${projectId}/stars`);
      if (
        reqId !== breakdownSeqRef.current ||
        String(inspectingProjectIdRef.current) !== String(projectId)
      ) {
        return;
      }
      setStarsBreakdown(res.data);
    } catch (err) {
      if (
        reqId !== breakdownSeqRef.current ||
        String(inspectingProjectIdRef.current) !== String(projectId)
      ) {
        return;
      }
      setStarsError(getErrorMessage(err, "Failed to load star endorsements."));
    } finally {
      if (reqId === breakdownSeqRef.current) {
        setStarsLoading(false);
      }
    }
  }, []);

  const openStarsBreakdown = (project) => {
    inspectingProjectIdRef.current = project?.id ?? null;
    setInspectingStarsProject(project);
    fetchStarsBreakdown(project);
  };

  const closeStarsBreakdown = () => {
    inspectingProjectIdRef.current = null;
    breakdownSeqRef.current += 1;
    setInspectingStarsProject(null);
    setStarsBreakdown(null);
    setStarsError("");
    setStarsLoading(false);
  };

  const loadLeaderboard = useCallback(async (bg = false) => {
    if (!bg) setLoading(true);
    setError("");
    try {
      const [boardRes, eligibleRes] = await Promise.all([
        api.get("/leaderboard"),
        api
          .get("/leaderboard/my-eligible")
          .catch(() => ({ data: { projects: [] } })),
      ]);

      const list = boardRes.data?.projects || boardRes.data?.data || [];
      const rawProjects = Array.isArray(list) ? list : [];
      setProjects(rankProjects(rawProjects));
      setEligibleProjects(
        Array.isArray(eligibleRes.data?.projects)
          ? eligibleRes.data.projects
          : [],
      );
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load College Leaderboard."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    if (!selectedProject?.id) return;
    const current = projects.find(
      (p) => String(p.id) === String(selectedProject.id),
    );
    if (
      current &&
      (current.rank !== selectedProject.rank ||
        current.starCount !== selectedProject.starCount ||
        current.isStarred !== selectedProject.isStarred)
    ) {
      setSelectedProject((prev) => (prev ? { ...prev, ...current } : null));
    }
  }, [projects, selectedProject?.id]);

  useEffect(() => {
    inspectingProjectIdRef.current = inspectingStarsProject?.id ?? null;
  }, [inspectingStarsProject?.id]);

  const activeInspectingProject = useMemo(() => {
    if (!inspectingStarsProject) return null;
    const live = projects.find(
      (p) => String(p.id) === String(inspectingStarsProject.id),
    );
    return live ? { ...inspectingStarsProject, ...live } : inspectingStarsProject;
  }, [inspectingStarsProject, projects]);

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

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleStarUpdate = ({ projectId, starCount, userId: eventUserId, starred }) => {
      const nextCount = Number(starCount) || 0;
      const isSelfEvent =
        eventUserId !== undefined &&
        eventUserId !== null &&
        user?.id !== undefined &&
        user?.id !== null &&
        String(eventUserId) === String(user.id);

      const resolveNextStarred = (prevStarred) => {
        if (nextCount === 0) return false;
        if (isSelfEvent && typeof starred === "boolean") return starred;
        return prevStarred;
      };

      setProjects((prev) => {
        const next = prev.map((p) =>
          String(p.id) === String(projectId)
            ? {
                ...p,
                starCount: nextCount,
                isStarred: resolveNextStarred(p.isStarred),
              }
            : p,
        );
        return rankProjects(next);
      });
      setSelectedProject((prev) => {
        if (prev && String(prev.id) === String(projectId)) {
          return {
            ...prev,
            starCount: nextCount,
            isStarred: resolveNextStarred(prev.isStarred),
          };
        }
        return prev;
      });
      if (String(inspectingProjectIdRef.current) === String(projectId)) {
        fetchStarsBreakdown({ id: projectId });
      }
      setInspectingStarsProject((prev) => {
        if (prev && String(prev.id) === String(projectId)) {
          return {
            ...prev,
            starCount: nextCount,
            isStarred: resolveNextStarred(prev.isStarred),
          };
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
      setSelectedProject((prev) =>
        prev && String(prev.id) === String(projectId) ? null : prev,
      );
      setInspectingStarsProject((prev) => {
        if (prev && String(prev.id) === String(projectId)) {
          inspectingProjectIdRef.current = null;
          breakdownSeqRef.current += 1;
          return null;
        }
        return prev;
      });
    };

    socket.on("leaderboard:star_update", handleStarUpdate);
    socket.on("leaderboard:new_project", handleNewProject);
    socket.on("leaderboard:project_withdrawn", handleProjectWithdrawn);

    return () => {
      socket.off("leaderboard:star_update", handleStarUpdate);
      socket.off("leaderboard:new_project", handleNewProject);
      socket.off("leaderboard:project_withdrawn", handleProjectWithdrawn);
    };
  }, [fetchStarsBreakdown, loadLeaderboard, user?.id]);

  const handleToggleStar = async (projectId) => {
    if (votingId) return;
    setVotingId(projectId);
    setError("");

    setProjects((prev) => {
      const next = prev.map((p) => {
        if (String(p.id) === String(projectId)) {
          const nextStarred = !p.isStarred;
          const nextCount = nextStarred
            ? (Number(p.starCount) || 0) + 1
            : Math.max(0, (Number(p.starCount) || 0) - 1);
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
        starCount: !prev.isStarred
          ? (Number(prev.starCount) || 0) + 1
          : Math.max(0, (Number(prev.starCount) || 0) - 1),
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
        setSelectedProject((prev) => ({
          ...prev,
          isStarred,
          starCount: Number(starCount),
        }));
      }
      if (
        !getSocket()?.connected &&
        inspectingStarsProject &&
        String(inspectingStarsProject.id) === String(projectId)
      ) {
        fetchStarsBreakdown(inspectingStarsProject);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update star vote."));
      loadLeaderboard(true);
    } finally {
      setVotingId(null);
    }
  };

  const handleSubmitProject = async (projectId) => {
    if (submittingId) return;
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

  const handleWithdrawProject = async (projectId) => {
    if (submittingId) return;
    if (!window.confirm("Remove / withdraw this project from the College Leaderboard? All star endorsements will be reset."))
      return;
    setSubmittingId(projectId);
    setError("");
    setSuccess("");
    try {
      const res = await api.delete(`/leaderboard/projects/${projectId}/submit`);
      setSuccess(res.data?.message || "Project removed from Leaderboard.");
      await loadLeaderboard(true);
      setShowSubmitModal(false);
      setSelectedProject((prev) => (prev?.id === projectId ? null : prev));
      setInspectingStarsProject((prev) => (prev?.id === projectId ? null : prev));
    } catch (err) {
      setError(getErrorMessage(err, "Failed to withdraw project."));
    } finally {
      setSubmittingId(null);
    }
  };

  // #1 Gold, #2 Silver, #3 Bronze
  const getRankBadge = (rank) => {
    const num = Number(rank);
    if (num === 1) {
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/15 px-2.5 py-1 text-xs font-black tabular-nums text-amber-800 dark:border-amber-400/45 dark:bg-amber-400/15 dark:text-amber-300">
          <Trophy
            size={13}
            strokeWidth={2}
            className="text-amber-500 fill-amber-400/30"
          />
          <span>#1</span>
        </span>
      );
    }
    if (num === 2) {
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-400/50 bg-slate-200/80 px-2.5 py-1 text-xs font-black tabular-nums text-slate-800 dark:border-slate-400/35 dark:bg-slate-400/15 dark:text-slate-200">
          <Award
            size={13}
            strokeWidth={1.9}
            className="text-slate-500 dark:text-slate-300"
          />
          <span>#2</span>
        </span>
      );
    }
    if (num === 3) {
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-orange-700/35 bg-orange-500/12 px-2.5 py-1 text-xs font-black tabular-nums text-orange-900 dark:border-orange-400/35 dark:bg-orange-400/15 dark:text-orange-300">
          <Award
            size={13}
            strokeWidth={1.85}
            className="text-orange-700 dark:text-orange-400"
          />
          <span>#3</span>
        </span>
      );
    }
    return (
      <span className="inline-flex shrink-0 items-center rounded-md border border-black/10 bg-neutral-50 px-2.5 py-1 text-xs font-extrabold tabular-nums text-neutral-700 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-300">
        #{num || "-"}
      </span>
    );
  };

  const myEligibleCount = eligibleProjects.filter(
    (p) => !p.isOnLeaderboard,
  ).length;

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Hero Header */}
      <div className="rounded-2xl border border-black/12 bg-white p-6 shadow-2xs dark:border-white/12 dark:bg-[#08080A] sm:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-black tracking-tight text-neutral-950 dark:text-white sm:text-4xl">
              College Project Leaderboard
            </h1>

            <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-sm">
              Explore standout student projects completed across all squads.
              Dual-ranked by total peer &amp; faculty stars, with newest
              competing projects naturally rewarded.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowSubmitModal(true)}
                className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
              >
                <Sparkles size={14} strokeWidth={1.85} />
                <span>Manage Leaderboard</span>
                {eligibleProjects.length > 0 && (
                  <span className="ml-1 rounded-md border border-white/20 bg-white/15 px-2 py-0.5 text-[10px] font-bold tabular-nums dark:border-black/15 dark:bg-black/10">
                    {eligibleProjects.length} Completed
                  </span>
                )}
              </button>
            ) : (
              eligibleProjects.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(true)}
                  className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
                >
                  <Sparkles size={14} strokeWidth={1.85} />
                  <span>Submit My Project</span>
                  {myEligibleCount > 0 && (
                    <span className="ml-1 rounded-md border border-white/20 bg-white/15 px-2 py-0.5 text-[10px] font-bold tabular-nums dark:border-black/15 dark:bg-black/10">
                      {myEligibleCount} Ready
                    </span>
                  )}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => loadLeaderboard(true)}
              disabled={loading}
              className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#101014] dark:!text-white dark:hover:!bg-[#18181E] sm:w-auto`}
            >
              <RefreshCw
                size={14}
                strokeWidth={1.85}
                className={loading ? "animate-spin" : ""}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {/* Search & Statistics Bar */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-black/12 bg-white p-4 shadow-2xs dark:border-white/12 dark:bg-[#08080A] sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={15}
            strokeWidth={1.85}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by title, keywords, team leader, or roll number..."
            className="w-full rounded-xl border border-black/12 bg-neutral-50 py-2.5 pl-10 pr-9 text-xs font-medium text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-black/35 dark:border-white/12 dark:bg-[#101014] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/35"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs font-bold tabular-nums text-neutral-700 dark:text-neutral-300">
          <span className="rounded-xl border border-black/10 bg-neutral-50 px-3 py-1.5 dark:border-white/10 dark:bg-[#101014]">
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
        <div className="rounded-2xl border border-black/12 bg-white p-6 dark:border-white/12 dark:bg-[#08080A]">
          <EmptyState
            icon={Trophy}
            title={
              search
                ? "No matching projects found"
                : "No projects published yet"
            }
            description={
              search
                ? "Try adjusting your search query or clear the filter."
                : "Completed projects submitted by their Project Leaders will be ranked here. Only 100% finished projects are eligible!"
            }
            action={
              isAdmin ? (
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(true)}
                  className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
                >
                  <Sparkles size={14} strokeWidth={1.85} />
                  <span>Manage / Feature Projects</span>
                </button>
              ) : eligibleProjects.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(true)}
                  className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
                >
                  <Sparkles size={14} strokeWidth={1.85} />
                  <span>Submit a Completed Project</span>
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((proj) => {
            const hasPpt = isValidHttpUrl(proj.pptUrl);
            const hasDemo = isValidHttpUrl(proj.demoUrl);
            const memberCount =
              Number(proj.memberCount) ||
              (Array.isArray(proj.members) ? proj.members.length : 0);

            return (
              <div
                key={proj.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-black/12 bg-white p-5 shadow-2xs transition hover:border-black/35 dark:border-white/12 dark:bg-[#08080A] dark:hover:border-white/35"
              >
                <div>
                  {/* Top Row: Rank, Time Ago & Gold Star Voting */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {getRankBadge(proj.rank)}
                      <span
                        className="inline-flex items-center gap-1 rounded-md border border-black/10 bg-neutral-50 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-400"
                        title={`Published ${formatDate(
                          proj.submittedAt || proj.createdAt,
                        )}`}
                      >
                        <Clock size={10} strokeWidth={1.85} />
                        <span>
                          {formatRelativeTime(
                            proj.submittedAt || proj.createdAt,
                          )}
                        </span>
                      </span>
                    </div>

                    {/* Gold Star Actions */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        disabled={votingId === proj.id}
                        onClick={() => handleToggleStar(proj.id)}
                        title={
                          proj.isStarred
                            ? "Click to remove your star"
                            : "Click to give 1 star"
                        }
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold tabular-nums transition ${
                          proj.isStarred
                            ? "border-amber-500/60 bg-amber-500/15 text-amber-800 dark:border-amber-400/50 dark:bg-amber-400/15 dark:text-amber-300"
                            : "border-black/12 bg-neutral-50 text-neutral-800 hover:border-amber-500/50 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-200 dark:hover:border-amber-400/50"
                        }`}
                      >
                        <Star
                          size={13}
                          strokeWidth={1.9}
                          className={
                            proj.isStarred
                              ? "fill-amber-400 text-amber-500"
                              : "text-amber-500 dark:text-amber-400"
                          }
                        />
                        <span>{proj.starCount ?? 0}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openStarsBreakdown(proj)}
                        title="Inspect who gave a star (Categorized by Directors, Mentors, and Students)"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-black/12 bg-neutral-50 px-2 py-1 text-[11px] font-semibold text-neutral-700 transition hover:border-black/30 hover:text-neutral-950 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-white/30 dark:hover:text-white"
                      >
                        <Users size={11} strokeWidth={1.85} />
                        <span>Stars</span>
                      </button>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h2 className="mt-3.5 line-clamp-1 text-base font-extrabold text-neutral-950 dark:text-white">
                    {proj.title || proj.name || "Untitled Project"}
                  </h2>

                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {proj.description || "No project description provided."}
                  </p>

                  {/* Team Leader & Squad details */}
                  <div className="mt-4 space-y-2 rounded-xl border border-black/10 bg-neutral-50 p-3.5 text-xs dark:border-white/10 dark:bg-[#101014]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                        <Crown
                          size={13}
                          strokeWidth={1.85}
                          className="text-amber-500 dark:text-amber-400"
                        />
                        <span>Leader</span>
                      </span>
                      <div className="min-w-0 text-right">
                        <p className="truncate font-bold text-neutral-950 dark:text-white">
                          {proj.teamLeader?.name || "Unassigned"}
                        </p>
                        {proj.teamLeader?.roll_no && (
                          <p className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                            {proj.teamLeader.roll_no}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-black/10 pt-1.5 dark:border-white/10">
                      <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                        <Users size={13} strokeWidth={1.85} />
                        <span>Squad</span>
                      </span>
                      <span className="font-bold tabular-nums text-neutral-950 dark:text-white">
                        {memberCount} student(s)
                      </span>
                    </div>

                    {proj.mentor && (
                      <div className="flex items-center justify-between gap-2 border-t border-black/10 pt-1.5 dark:border-white/10">
                        <span className="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                          <GraduationCap size={13} strokeWidth={1.85} />
                          <span>Mentor</span>
                        </span>
                        <span className="truncate font-bold text-neutral-950 dark:text-white">
                          {proj.mentor.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Deliverable Links + Public Inspect Button */}
                <div className="mt-4 border-t border-black/10 pt-3.5 dark:border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {hasPpt ? (
                        <a
                          href={proj.pptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open Presentation PPT"
                          className="inline-flex items-center gap-1 rounded-xl border border-black/15 bg-neutral-50 px-2.5 py-1 text-[11px] font-bold text-neutral-900 transition hover:border-black/35 dark:border-white/15 dark:bg-[#101014] dark:text-white dark:hover:border-white/35"
                        >
                          <Presentation size={13} strokeWidth={1.85} />
                          <span>PPT</span>
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-xl border border-black/8 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-400 dark:border-white/8 dark:bg-[#101014] dark:text-neutral-500">
                          <Presentation size={13} strokeWidth={1.85} />
                          <span>PPT —</span>
                        </span>
                      )}

                      {hasDemo ? (
                        <a
                          href={proj.demoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open Live Demo"
                          className="inline-flex items-center gap-1 rounded-xl border border-black/15 bg-neutral-50 px-2.5 py-1 text-[11px] font-bold text-neutral-900 transition hover:border-black/35 dark:border-white/15 dark:bg-[#101014] dark:text-white dark:hover:border-white/35"
                        >
                          <Video size={13} strokeWidth={1.85} />
                          <span>Live Demo</span>
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-xl border border-black/8 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-400 dark:border-white/8 dark:bg-[#101014] dark:text-neutral-500">
                          <Video size={13} strokeWidth={1.85} />
                          <span>Demo —</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedProject(proj)}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-neutral-900 transition hover:underline dark:text-white"
                      >
                        <span>Inspect Project</span>
                        <ExternalLink size={13} strokeWidth={1.85} />
                      </button>

                      {(isAdmin || (user && (Number(proj.teamLeader?.id ?? proj.owner_id) === Number(user.id)))) && (
                        <button
                          type="button"
                          disabled={submittingId === proj.id}
                          onClick={() => handleWithdrawProject(proj.id)}
                          className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-rose-600 transition hover:underline dark:text-rose-400"
                          title="Remove this project from the Leaderboard"
                        >
                          <span>{submittingId === proj.id ? "Removing..." : "Remove"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* REFINED INSPECT PROJECT PANEL / MODAL */}
      <Modal
        open={Boolean(selectedProject)}
        onClose={() => setSelectedProject(null)}
        title={
          selectedProject ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black">{selectedProject.title}</span>
              {getRankBadge(selectedProject.rank)}
              <NeutralBadge>
                <Clock size={10} strokeWidth={1.85} />
                <span>
                  Published{" "}
                  {formatRelativeTime(
                    selectedProject.submittedAt || selectedProject.createdAt,
                  )}
                </span>
              </NeutralBadge>
            </div>
          ) : (
            "Project Showcase"
          )
        }
        description="Public view on College Leaderboard · PPT & Live Demo links"
        size="max-w-2xl"
      >
        {selectedProject && (
          <div className="space-y-5 text-neutral-950 dark:text-white">
            {/* Project Summary */}
            <div className="rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014]">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                About the Project
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 sm:text-sm">
                {selectedProject.description ||
                  "No project description provided."}
              </p>
            </div>

            {/* Core Deliverable Links (PPT + Demo) */}
            <div>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Showcase Deliverables
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-white text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                      <Presentation size={19} strokeWidth={1.85} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                        Presentation (PPT)
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {isValidHttpUrl(selectedProject.pptUrl)
                          ? "Slide deck ready"
                          : "Not submitted"}
                      </p>
                    </div>
                  </div>
                  {isValidHttpUrl(selectedProject.pptUrl) ? (
                    <a
                      href={selectedProject.pptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
                    >
                      <Presentation size={13} strokeWidth={1.85} />
                      <span>Open Presentation</span>
                      <ExternalLink size={12} strokeWidth={1.85} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="cursor-not-allowed rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-bold text-neutral-400 dark:border-white/10 dark:bg-[#08080A] dark:text-neutral-500"
                    >
                      No Presentation Link
                    </button>
                  )}
                </div>

                <div className="flex flex-col justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-white text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                      <Video size={19} strokeWidth={1.85} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                        Live Demo Link
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {isValidHttpUrl(selectedProject.demoUrl)
                          ? "Demo link ready"
                          : "Not submitted"}
                      </p>
                    </div>
                  </div>
                  {isValidHttpUrl(selectedProject.demoUrl) ? (
                    <a
                      href={selectedProject.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
                    >
                      <Video size={13} strokeWidth={1.85} />
                      <span>View Live Demo</span>
                      <ExternalLink size={12} strokeWidth={1.85} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="cursor-not-allowed rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-bold text-neutral-400 dark:border-white/10 dark:bg-[#08080A] dark:text-neutral-500"
                    >
                      No Live Demo Link
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Team Roster */}
            <div>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Team Squad (
                {Number(selectedProject.memberCount) ||
                  (Array.isArray(selectedProject.members)
                    ? selectedProject.members.length
                    : 0)}
                )
              </h3>
              <div className="space-y-2 rounded-xl border border-black/10 bg-neutral-50 p-3 dark:border-white/10 dark:bg-[#101014]">
                {selectedProject.teamLeader && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-black/15 bg-white p-2.5 dark:border-white/15 dark:bg-[#08080A]">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-xs font-black text-white dark:bg-white dark:text-black">
                        {getInitials(selectedProject.teamLeader.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                          {selectedProject.teamLeader.name}
                        </p>
                        <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                          {selectedProject.teamLeader.email}
                          {selectedProject.teamLeader.roll_no
                            ? ` · Roll: ${selectedProject.teamLeader.roll_no}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <NeutralBadge>
                      <Crown
                        size={11}
                        strokeWidth={1.9}
                        className="text-amber-500 dark:text-amber-400"
                      />
                      <span>Team Leader</span>
                    </NeutralBadge>
                  </div>
                )}

                {(selectedProject.members || []).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-white p-2.5 dark:border-white/10 dark:bg-[#08080A]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/12 bg-neutral-100 text-[11px] font-bold text-neutral-900 dark:border-white/12 dark:bg-[#101014] dark:text-white">
                        {getInitials(m.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                          {m.name}
                        </p>
                        <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                          {m.email}{" "}
                          {m.roll_no ? `· Roll: ${m.roll_no}` : ""}
                        </p>
                      </div>
                    </div>
                    <NeutralBadge>Member</NeutralBadge>
                  </div>
                ))}
              </div>
            </div>

            {/* Voting & Stars Inspection Footer */}
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014] sm:flex-row sm:items-center">
              <div>
                <p className="inline-flex items-center gap-1.5 text-xs font-bold tabular-nums text-neutral-950 dark:text-white">
                  <Star
                    size={13}
                    strokeWidth={1.9}
                    className="fill-amber-400 text-amber-500"
                  />
                  <span>
                    Total Stars:{" "}
                    <strong className="text-amber-700 dark:text-amber-300">
                      {selectedProject.starCount ?? 0}
                    </strong>
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  {selectedProject.isStarred
                    ? "You starred this project"
                    : "1 vote per user"}{" "}
                  · Published{" "}
                  {formatRelativeTime(
                    selectedProject.submittedAt || selectedProject.createdAt,
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openStarsBreakdown(selectedProject)}
                  className={`${portalSecondaryBtnClass} cursor-pointer rounded-xl dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white`}
                  title="View categorized star breakdown by role"
                >
                  <Users size={13} strokeWidth={1.85} />
                  <span>View Star Breakdown</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleStar(selectedProject.id)}
                  disabled={votingId === selectedProject.id}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition ${
                    selectedProject.isStarred
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-800 dark:border-amber-400/50 dark:bg-amber-400/15 dark:text-amber-300"
                      : `${portalPrimaryBtnClass} dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`
                  }`}
                >
                  <Star
                    size={14}
                    strokeWidth={1.9}
                    className={
                      selectedProject.isStarred
                        ? "fill-amber-400 text-amber-500"
                        : "text-amber-400 dark:text-amber-500"
                    }
                  />
                  <span>
                    {selectedProject.isStarred
                      ? "Starred (Click to Remove)"
                      : "Give Star"}
                  </span>
                </button>

                {(isAdmin || (user && (Number(selectedProject.teamLeader?.id ?? selectedProject.owner_id) === Number(user.id)))) && (
                  <button
                    type="button"
                    disabled={submittingId === selectedProject.id}
                    onClick={() => handleWithdrawProject(selectedProject.id)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
                    title="Remove this project from the Leaderboard"
                  >
                    <span>{submittingId === selectedProject.id ? "Removing..." : "Remove from Leaderboard"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* SUBMIT / MANAGE COMPLETED PROJECTS MODAL */}
      <Modal
        open={showSubmitModal}
        onClose={() => !submittingId && setShowSubmitModal(false)}
        title={isAdmin ? "Manage College Leaderboard" : "Submit Project to College Leaderboard"}
        description={
          isAdmin
            ? "Directly feature eligible 100% completed projects with Presentation & Demo links, or remove projects from the College Leaderboard."
            : "Only 100% completed projects with both Presentation (PPT) and Live Demo links can be published by their Project Leader."
        }
        size="max-w-xl"
      >
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            {isAdmin
              ? "All eligible 100% completed student projects across squads appear below. Standout projects with active PPT and Live Demo links can be featured or removed as needed."
              : "Publishing your project showcases your live demo and presentation across the institute. Both PPT and Live Demo links must remain active to stay on the Leaderboard."}
          </p>

          {eligibleProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 bg-neutral-50 p-6 text-center text-xs text-neutral-500 dark:border-white/15 dark:bg-[#101014] dark:text-neutral-400">
              {isAdmin
                ? "No completed projects currently found across squads. Projects must have all tasks completed and status set to 'Completed' before they can be featured on the Leaderboard."
                : "You do not have any completed projects yet. Complete all tasks and set your project status to “Completed” to submit!"}
            </div>
          ) : (
            <div className="space-y-3">
              {eligibleProjects.map((p) => {
                const isDeliverablesReady = Boolean(
                  p.hasValidDeliverables ??
                    (isValidHttpUrl(p.pptUrl) && isValidHttpUrl(p.demoUrl)),
                );
                const isPublished = Boolean(p.isOnLeaderboard);
                const isVisible = Boolean(
                  p.isPubliclyVisible ??
                    (isPublished && isDeliverablesReady && String(p.status || "").toLowerCase() === "completed" && Number(p.pendingTasks || 0) === 0),
                );
                const busy = submittingId === p.id;

                return (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014] sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-extrabold text-neutral-950 dark:text-white">
                          {p.title}
                        </p>
                        {isPublished ? (
                          <NeutralBadge>
                            <Star
                              size={10}
                              strokeWidth={1.9}
                              className="fill-amber-400 text-amber-500"
                            />
                            <span>
                              On Leaderboard ({p.starCount || 0}){!isVisible ? " · Hidden" : ""}
                            </span>
                          </NeutralBadge>
                        ) : isDeliverablesReady ? (
                          <NeutralBadge>{isAdmin ? "Eligible to Feature" : "Eligible to Submit"}</NeutralBadge>
                        ) : (
                          <NeutralBadge>Missing PPT / Demo Link</NeutralBadge>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {p.ownerName ? `Lead: ${p.ownerName}` : p.description || "100% Completed Project"}
                      </p>
                      {isPublished && !isVisible && (
                        <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          Temporarily hidden from public leaderboard until status is 'Completed' and all tasks are finished. Stars are preserved!
                        </p>
                      )}
                      {!isPublished && !isDeliverablesReady && (
                        <p className="mt-1 text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                          Requires both valid PPT &amp; Live Demo links to {isAdmin ? "feature." : "submit."}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {isPublished ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleWithdrawProject(p.id)}
                          className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white`}
                        >
                          <span>{busy ? "Working..." : isAdmin ? "Remove from Leaderboard" : "Withdraw"}</span>
                        </button>
                      ) : isDeliverablesReady ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleSubmitProject(p.id)}
                          className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
                        >
                          <Sparkles size={14} strokeWidth={1.85} />
                          <span>
                            {busy ? "Working..." : isAdmin ? "Feature on Leaderboard" : "Publish to Leaderboard"}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="cursor-not-allowed rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-bold text-neutral-400 dark:border-white/10 dark:bg-[#08080A] dark:text-neutral-500"
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
              className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* CATEGORIZED STAR VIEW PANEL */}
      <Modal
        open={Boolean(activeInspectingProject)}
        onClose={closeStarsBreakdown}
        title={
          activeInspectingProject ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black">
                Star Endorsements: {activeInspectingProject.title}
              </span>
              <NeutralBadge className="border-amber-500/40 bg-amber-500/12 text-amber-800 dark:border-amber-400/35 dark:bg-amber-400/12 dark:text-amber-300">
                <Star
                  size={11}
                  strokeWidth={1.9}
                  className="fill-amber-400 text-amber-500"
                />
                <span>
                  {starsBreakdown?.totalStars ??
                    activeInspectingProject.starCount ??
                    0}{" "}
                  Total
                </span>
              </NeutralBadge>
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
          <div className="space-y-4 text-neutral-950 dark:text-white">
            {starsError && (
              <ErrorAlert
                message={starsError}
                onDismiss={() => setStarsError("")}
              />
            )}

            {(() => {
              const allVoters = [
                ...(starsBreakdown?.categorized?.directors || []).map((v) => ({
                  ...v,
                  tier: "director",
                })),
                ...(starsBreakdown?.categorized?.admins || []).map((v) => ({
                  ...v,
                  tier: "admin",
                })),
                ...(starsBreakdown?.categorized?.mentors || []).map((v) => ({
                  ...v,
                  tier: "mentor",
                })),
                ...(starsBreakdown?.categorized?.students || []).map((v) => ({
                  ...v,
                  tier: "student",
                })),
              ];

              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 bg-neutral-50 px-4 py-2.5 text-xs dark:border-white/10 dark:bg-[#101014]">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold tabular-nums text-neutral-950 dark:text-white">
                        {allVoters.length}{" "}
                        {allVoters.length === 1
                          ? "Star Endorsement"
                          : "Star Endorsements"}
                      </span>
                      <span className="text-neutral-400">·</span>
                      <span className="font-medium text-neutral-600 dark:text-neutral-400">
                        Viewing as {getRoleDisplayLabel(user)}
                      </span>
                    </div>

                    {starsBreakdown?.currentUserStarred ? (
                      <NeutralBadge className="border-amber-500/40 bg-amber-500/12 text-amber-800 dark:border-amber-400/35 dark:bg-amber-400/12 dark:text-amber-300">
                        <Star
                          size={11}
                          strokeWidth={1.9}
                          className="fill-amber-400 text-amber-500"
                        />
                        <span>Starred by You</span>
                      </NeutralBadge>
                    ) : (
                      <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                        1 vote allowed per user
                      </span>
                    )}
                  </div>

                  {allVoters.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-black/15 bg-neutral-50 p-8 text-center dark:border-white/15 dark:bg-[#101014]">
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-black/12 bg-white text-amber-500 dark:border-white/12 dark:bg-[#08080A] dark:text-amber-400">
                        <Star size={20} strokeWidth={1.85} />
                      </div>
                      <h4 className="mt-3 text-sm font-extrabold text-neutral-950 dark:text-white">
                        No Star Endorsements Yet
                      </h4>
                      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                        This project has not received any stars yet. Be the first
                        to give it an endorsement!
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-black/10 overflow-hidden rounded-xl border border-black/12 bg-white dark:divide-white/10 dark:border-white/12 dark:bg-[#08080A]">
                      {allVoters.map((v) => {
                        const isDirector = v.tier === "director";
                        const isAdmin = v.tier === "admin";
                        const isMentor = v.tier === "mentor";
                        const isStudent = v.tier === "student";

                        return (
                          <div
                            key={v.starId || v.id}
                            className={`flex items-center justify-between gap-3 p-3.5 transition hover:bg-neutral-50 dark:hover:bg-[#101014] ${
                              isDirector || isAdmin
                                ? "border-l-2 border-neutral-950 dark:border-white"
                                : ""
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={`flex shrink-0 items-center justify-center rounded-xl border font-extrabold ${
                                  isDirector || isAdmin
                                    ? "h-10 w-10 border-black/20 bg-neutral-950 text-xs text-white dark:border-white/20 dark:bg-white dark:text-black"
                                    : "h-9 w-9 border-black/12 bg-neutral-100 text-xs text-neutral-900 dark:border-white/12 dark:bg-[#101014] dark:text-white"
                                }`}
                              >
                                {getInitials(v.name)}
                              </div>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className="truncate text-xs font-bold text-neutral-950 dark:text-white sm:text-sm">
                                    {v.name}
                                  </p>
                                  {v.isCurrentUser && (
                                    <NeutralBadge>
                                      <CheckCircle2 size={10} strokeWidth={2} />
                                      <span>You</span>
                                    </NeutralBadge>
                                  )}
                                </div>

                                <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                                  {v.email}
                                  {isStudent && v.rollNo ? (
                                    <span className="ml-1.5 font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                                      · Roll: {v.rollNo}
                                    </span>
                                  ) : null}
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              {isDirector ? (
                                <NeutralBadge>
                                  <Crown
                                    size={11}
                                    strokeWidth={1.9}
                                    className="text-amber-500 dark:text-amber-400"
                                  />
                                  <span>Director</span>
                                </NeutralBadge>
                              ) : isAdmin ? (
                                <NeutralBadge>
                                  <ShieldCheck size={11} strokeWidth={1.85} />
                                  <span>Admin</span>
                                </NeutralBadge>
                              ) : isMentor ? (
                                <NeutralBadge>
                                  <GraduationCap size={11} strokeWidth={1.85} />
                                  <span>Faculty Mentor</span>
                                </NeutralBadge>
                              ) : (
                                <NeutralBadge>
                                  <Users size={10} strokeWidth={1.85} />
                                  <span>Student</span>
                                </NeutralBadge>
                              )}
                              <p className="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
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

            <div className="flex flex-col justify-between gap-3 border-t border-black/10 pt-4 dark:border-white/10 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-bold text-neutral-950 dark:text-white">
                  {starsBreakdown?.currentUserStarred
                    ? "You have endorsed this project"
                    : "You have not starred this project yet (1 vote per user)"}
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Your star vote appears instantly in the list above.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeInspectingProject && (
                  <button
                    type="button"
                    onClick={() => handleToggleStar(activeInspectingProject.id)}
                    disabled={votingId === activeInspectingProject.id}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition ${
                      starsBreakdown?.currentUserStarred
                        ? "border-amber-500/60 bg-amber-500/15 text-amber-800 dark:border-amber-400/50 dark:bg-amber-400/15 dark:text-amber-300"
                        : `${portalPrimaryBtnClass} dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`
                    }`}
                  >
                    <Star
                      size={14}
                      strokeWidth={1.9}
                      className={
                        starsBreakdown?.currentUserStarred
                          ? "fill-amber-400 text-amber-500"
                          : "text-amber-400 dark:text-amber-500"
                      }
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
                  className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
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