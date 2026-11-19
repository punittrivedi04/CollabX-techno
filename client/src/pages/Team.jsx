import { useEffect, useState } from "react";
import {
  UserPlus,
  Search,
  Mail,
  Crown,
  Trash2,
  LoaderCircle,
  AlertCircle,
  X,
  ShieldCheck,
  FolderKanban,
  RefreshCw,
  UserRound,
  Clock,
  Copy,
  MessageCircle,
  LogOut,
  ArrowRightLeft,
  ChevronDown,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getSocket } from "../services/socket";
import SearchableSelect from "../components/portal/SearchableSelect";

const getError = (error) =>
  error.response?.data?.message || error.message || "Something went wrong.";

const getId = (value) => {
  if (!value) return null;
  return typeof value === "object" ? value.id || value._id : value;
};

const toTitleCase = (value) => {
  if (!value) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export default function Team() {
  const { user: currentUser } = useAuth();

  const userRole = String(currentUser?.role || "").toLowerCase();
  const isDirector = userRole === "director";

  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [team, setTeam] = useState(null);
  const [pendingInvitations, setPendingInvitations] = useState([]);

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [mentors, setMentors] = useState([]);
  const [selectedMentorId, setSelectedMentorId] = useState("");
  const [invitingMentor, setInvitingMentor] = useState(false);
  const [loadingMentors, setLoadingMentors] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentUserId = getId(currentUser);

  const selectedProject = projects.find(
    (project) => String(getId(project)) === String(selectedProjectId),
  );

  const owner = team?.owner || selectedProject?.owner;
  const members = team?.members || [];

  const pendingMentorInvitation = pendingInvitations.find(
    (inv) =>
      String(inv.role || "").toLowerCase() === "mentor" &&
      inv.status === "Pending",
  );

  const isOwner =
    !isDirector &&
    Boolean(currentUserId && owner) &&
    String(currentUserId) === String(getId(owner));

  const loadProjects = async () => {
    setLoadingProjects(true);

    try {
      const response = await api.get("/projects");
      const rawList = response.data.projects || [];
      const list = rawList.map((p) => ({
        ...p,
        _id: String(p.id || p._id),
      }));

      setProjects(list);

      if (list.length) {
        const owned = list.find(
          (p) => String(getId(p.owner)) === String(currentUserId),
        );

        setSelectedProjectId((old) =>
          list.some((project) => String(project._id) === String(old))
            ? old
            : owned?._id || list[0]?._id || "",
        );
      } else {
        setSelectedProjectId("");
      }
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadTeam = async () => {
    if (!selectedProjectId) return;

    setLoadingTeam(true);

    try {
      const response = await api.get(`/team/${selectedProjectId}`);

      setTeam(response.data.team);
      setPendingInvitations(response.data.pendingInvitations || []);
    } catch (err) {
      setTeam(null);
      setPendingInvitations([]);
      setError(getError(err));
    } finally {
      setLoadingTeam(false);
    }
  };

  const loadMentors = async () => {
    setLoadingMentors(true);
    try {
      const res = await api.get("/users", { params: { role: "mentor" } });
      const list = res.data?.users || res.data?.data || [];
      if (Array.isArray(list) && list.length > 0) {
        setMentors(list);
      } else {
        const fallbackRes = await api.get("/users/all", { params: { role: "mentor" } });
        setMentors(fallbackRes.data?.users || fallbackRes.data?.data || []);
      }
    } catch (err) {
      console.error("Failed to load mentors:", err);
    } finally {
      setLoadingMentors(false);
    }
  };

  useEffect(() => {
    if (currentUserId) loadProjects();
    loadMentors();
  }, [currentUserId]);

  useEffect(() => {
    setTeam(null);
    setPendingInvitations([]);

    if (selectedProjectId) loadTeam();
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) return;

    const socket = getSocket();
    if (!socket) return;

    const handleTeamNotification = async (notification) => {
      const notificationProjectId = getId(notification?.project);

      if (
        !notificationProjectId ||
        String(notificationProjectId) !== String(selectedProjectId)
      ) {
        return;
      }

      const relevantTypes = [
        "team_added",
        "team_removed",
        "team_invitation",
        "mentor_invitation",
        "mentor_assignment",
        "mentor_unassigned",
        "mentor_removed",
        "mentor_review",
      ];
      if (!relevantTypes.includes(notification.type)) return;

      try {
        const response = await api.get(`/team/${selectedProjectId}`);
        setTeam(response.data.team);
        setPendingInvitations(response.data.pendingInvitations || []);

        if (notification.type === "team_added") {
          setSuccess("Team updated! A new member has joined.");
        } else if (notification.type === "mentor_assignment") {
          setSuccess("Faculty Mentor accepted the invitation and is now assigned!");
        } else if (notification.type === "mentor_review") {
          setSuccess("Faculty Mentor has published the official project review!");
        } else if (
          notification.type === "mentor_unassigned" ||
          notification.type === "mentor_removed"
        ) {
          setSuccess("Faculty Mentor has been removed.");
        }
      } catch (err) {
        console.error("Real-time team refresh failed:", err);
      }
    };

    socket.on("notification:new", handleTeamNotification);

    return () => {
      socket.off("notification:new", handleTeamNotification);
    };
  }, [selectedProjectId]);

  const handleSendMentorInvitation = async (event) => {
    event.preventDefault();
    if (invitingMentor || !selectedMentorId || !selectedProjectId) return;

    setInvitingMentor(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post(`/team/${selectedProjectId}/invitations`, {
        mentorId: Number(selectedMentorId),
        role: "mentor",
      });

      setSuccess(response.data.message);
      setSelectedMentorId("");
      await loadTeam();
      window.dispatchEvent(new CustomEvent("collabx_team_updated"));
    } catch (err) {
      setError(getError(err));
    } finally {
      setInvitingMentor(false);
    }
  };

  const handleRemoveMentor = async () => {
    if (busy || !team?.mentor) return;
    const mentorName = toTitleCase(team.mentor.name) || "Faculty Mentor";
    if (
      !window.confirm(
        `Are you sure you want to remove ${mentorName} as your Faculty Mentor? Your team will be left with "No Mentor Assigned" until you invite another mentor.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.delete(`/team/${selectedProjectId}/mentor`);
      setSuccess(response.data.message);
      await loadTeam();
      await loadProjects();
      window.dispatchEvent(new CustomEvent("collabx_projects_updated"));
      window.dispatchEvent(new CustomEvent("collabx_team_updated"));
      window.dispatchEvent(new CustomEvent("collabx_team_updated"));
      window.dispatchEvent(new CustomEvent("collabx_projects_updated"));
    } catch (err) {
      setError(getError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSendInvitation = async (event) => {
    event.preventDefault();

    if (busy || !email.trim()) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post(
        `/team/${selectedProjectId}/invitations`,
        { email: email.trim().toLowerCase() },
      );

      setSuccess(response.data.message);
      setEmail("");

      await loadTeam();
      window.dispatchEvent(new CustomEvent("collabx_team_updated"));
    } catch (err) {
      setError(getError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCancelInvitation = async (invitation) => {
    if (busy) return;
    if (
      !window.confirm("Cancel this invitation? The old link will stop working.")
    ) {
      return;
    }

    setBusy(true);

    try {
      const invId = getId(invitation);
      const response = await api.delete(
        `/team/${selectedProjectId}/invitations/${invId}`,
      );

      setSuccess(response.data.message);
      await loadTeam();
      window.dispatchEvent(new CustomEvent("collabx_team_updated"));
    } catch (err) {
      setError(getError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (member) => {
    if (busy) return;
    if (!window.confirm(`Remove ${member.name} from this project?`)) {
      return;
    }

    setBusy(true);

    try {
      const memberId = getId(member);
      const response = await api.delete(
        `/team/${selectedProjectId}/members/${memberId}`,
      );

      setSuccess(response.data.message);
      await loadTeam();
      window.dispatchEvent(new CustomEvent("collabx_team_updated"));
    } catch (err) {
      setError(getError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveProject = async () => {
    if (busy) return;
    if (!window.confirm("Are you sure you want to leave this project?")) {
      return;
    }

    setBusy(true);

    try {
      const response = await api.post(`/team/${selectedProjectId}/leave`);
      setSuccess(response.data.message);
      await loadProjects();
      setTeam(null);
      window.dispatchEvent(new CustomEvent("collabx_team_updated"));
      window.dispatchEvent(new CustomEvent("collabx_projects_updated"));
    } catch (err) {
      setError(getError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (busy) return;
    const mentorId = getId(team?.mentor);
    const eligibleMembers = members.filter(
      (member) =>
        String(getId(member)) !== String(currentUserId) &&
        String(member?.role || "").toLowerCase() !== "mentor" &&
        String(member?.role || "").toLowerCase() !== "faculty" &&
        String(getId(member)) !== String(mentorId),
    );

    if (!eligibleMembers.length) {
      setError("You need at least one existing member to transfer ownership.");
      return;
    }

    const options = eligibleMembers
      .map(
        (member, index) =>
          `${index + 1}. ${member.name} (${member.email}${(member.roll_no || member.rollNumber) ? ` · Roll: ${member.roll_no || member.rollNumber}` : ""})`,
      )
      .join("\n");

    const answer = window.prompt(
      `Enter the number of the new owner:\n\n${options}`,
    );

    if (answer === null) return;

    const index = Number(answer) - 1;

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= eligibleMembers.length
    ) {
      setError("Invalid member selection.");
      return;
    }

    const newOwner = eligibleMembers[index];

    if (
      !window.confirm(
        `Transfer ownership to ${newOwner.name}? You will become a regular member.`,
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      const response = await api.patch(
        `/team/${selectedProjectId}/transfer-ownership`,
        { newOwnerId: getId(newOwner) },
      );

      setSuccess(response.data.message);
      await loadTeam();
      await loadProjects();
      window.dispatchEvent(new CustomEvent("collabx_projects_updated"));
      window.dispatchEvent(new CustomEvent("collabx_team_updated"));
    } catch (err) {
      setError(getError(err));
    } finally {
      setBusy(false);
    }
  };

  const copyInvitation = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setSuccess("Invitation link copied!");
    } catch {
      setError("Unable to copy link. Please copy it manually.");
    }
  };

  const shareWhatsApp = (url) => {
    const text = `Join my CollabX project: ${url}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const ownerId = getId(owner);
  const ownerEmail = (owner?.email || "").toLowerCase().trim();
  const mentorId = getId(team?.mentor);
  const mentorEmail = (team?.mentor?.email || "").toLowerCase().trim();

  const seenMemberIds = new Set();
  const filteredMembers = members.filter((member) => {
    const memberId = getId(member);
    const memberEmail = (member?.email || "").toLowerCase().trim();
    const memberRole = String(member?.role || "").toLowerCase().trim();

    if (ownerId && memberId && String(memberId) === String(ownerId)) {
      return false;
    }
    if (ownerEmail && memberEmail && memberEmail === ownerEmail) {
      return false;
    }

    // Exclude faculty mentors from student squad list
    if (memberRole === "mentor" || memberRole === "faculty") {
      return false;
    }
    if (mentorId && memberId && String(memberId) === String(mentorId)) {
      return false;
    }
    if (mentorEmail && memberEmail && memberEmail === mentorEmail) {
      return false;
    }

    if (memberId) {
      if (seenMemberIds.has(String(memberId))) return false;
      seenMemberIds.add(String(memberId));
    }

    const term = search.toLowerCase();

    return (
      member.name?.toLowerCase().includes(term) ||
      member.email?.toLowerCase().includes(term) ||
      (member.roll_no || member.rollNumber)?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 text-[#141A18] dark:text-slate-100">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-5 shadow-2xs sm:flex-row sm:items-center sm:p-6">
        <div>
          <span className="inline-block rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
            Collaboration Squad
          </span>
          <p className="mt-1.5 text-sm font-medium text-[#5C6B66] dark:text-[#94A89D]">
            Manage project members, send invites, and assign squad roles.
          </p>
        </div>

        <button
          onClick={loadTeam}
          disabled={!selectedProjectId || loadingTeam}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-sm font-bold shadow-2xs disabled:opacity-50"
        >
          <RefreshCw size={15} className={loadingTeam ? "animate-spin" : ""} />
          Refresh Team
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-sm font-medium text-red-600 dark:text-red-400">
          <AlertCircle size={18} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#2E8B63]/30 dark:border-[#22C55E]/40 bg-[#E3F3EB] dark:bg-[#13291E] p-4 text-sm font-semibold text-[#1E6B4B] dark:text-[#6EE7B7]">
          <ShieldCheck size={18} className="text-[#1E6B4B] dark:text-[#6EE7B7]" />
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {/* Select Project Bento Card */}
      <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100">
            <FolderKanban size={16} />
          </span>
          <h2 className="font-bold text-[#141A18] dark:text-slate-100">Select Project Workspace</h2>
        </div>

        {loadingProjects ? (
          <p className="text-sm text-[#5C6B66] dark:text-[#94A89D]">Loading projects...</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-[#5C6B66] dark:text-[#94A89D]">
            No projects found. Create a project first.
          </p>
        ) : (
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full appearance-none rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] py-3.5 pl-4 pr-10 text-sm font-bold text-[#141A18] dark:text-slate-100 shadow-2xs outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E] cursor-pointer"
            >
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B66] dark:text-[#94A89D]" />
          </div>
        )}
      </div>

      {selectedProjectId && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs">
              <p className="text-xs font-bold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
                Total Team Members
              </p>
              <p className="mt-3 text-4xl font-extrabold text-[#141A18] dark:text-slate-100">
                {team?.totalMembers ?? 0}
              </p>
            </div>

            <div className="rounded-[28px] border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] p-6 shadow-2xs">
              <p className="text-xs font-bold uppercase tracking-wider text-[#5C6662] dark:text-[#94A89D]">
                Project Owner
              </p>
              <p className="mt-3 text-2xl font-extrabold text-[#141A18] dark:text-slate-100">
                {owner?.name || "Loading..."}
              </p>
            </div>
          </div>

          {/* Invite Card */}
          <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100">
                <UserPlus size={18} />
              </div>

              <div>
                <h2 className="font-bold text-[#141A18] dark:text-slate-100">Invite Team Member</h2>
                <p className="mt-0.5 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                  Invite a registered CollabX user by email.
                </p>
              </div>
            </div>

            {isOwner ? (
              <form
                onSubmit={handleSendInvitation}
                className="flex flex-col gap-3 sm:flex-row"
              >
                <div className="relative flex-1">
                  <Mail
                    size={17}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75] dark:text-[#869B90]"
                  />

                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter registered user's email"
                    className="w-full rounded-full border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] py-3.5 pl-11 pr-4 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
                  />
                </div>

                <button
                  disabled={busy || !email.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-6 py-3.5 text-sm font-bold shadow-xs disabled:cursor-not-allowed disabled:bg-[#DCE5DF] dark:disabled:bg-[#1A2520] disabled:text-[#6B7B75] dark:disabled:text-[#687E73]"
                >
                  {busy ? (
                    <LoaderCircle className="animate-spin" size={17} />
                  ) : (
                    <UserPlus size={17} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
                  )}
                  Send Invitation
                </button>
              </form>
            ) : isDirector ? (
              <p className="rounded-2xl border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] p-4 text-sm font-medium text-[#42504B] dark:text-slate-300">
                Executive View: Team membership is read-only.
              </p>
            ) : (
              <p className="rounded-2xl border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] p-4 text-sm font-medium text-[#42504B] dark:text-slate-300">
                Only the project owner can invite members.
              </p>
            )}
          </div>

          {/* Faculty Mentor Management Card */}
          <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {team?.mentor ? (
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#15803D] dark:text-[#A3E635]">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
                      FACULTY MENTOR
                    </span>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-[#141A18] dark:text-slate-100 tracking-tight">
                      {toTitleCase(team.mentor.name)}
                    </h2>
                    <p className="mt-0.5 text-xs font-medium text-[#5C6B66] dark:text-[#94A89D]">
                      {team.mentor.email}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#15803D] dark:text-[#A3E635]">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
                      FACULTY MENTOR
                    </span>
                    <h2 className="font-bold text-[#141A18] dark:text-slate-100">
                      Faculty Mentor
                    </h2>
                    <p className="mt-0.5 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                      {pendingMentorInvitation
                        ? "A mentor invitation is currently pending acceptance."
                        : "No mentor currently assigned. Mentorship is optional."}
                    </p>
                  </div>
                </div>
              )}

              {/* Status Badge & Actions */}
              {team?.mentor ? (
                isOwner && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleRemoveMentor}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 transition hover:bg-red-100 dark:hover:bg-red-900/60 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    title="Remove assigned Faculty Mentor"
                  >
                    <X size={13} />
                    Remove
                  </button>
                )
              ) : pendingMentorInvitation ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                  <Clock size={13} className="animate-pulse" /> Pending Mentor Acceptance
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#C5D4CA] dark:border-[#2A3B32] bg-[#F2F0E9]/70 dark:bg-[#161D19] px-3.5 py-1.5 text-xs font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                  <ShieldCheck size={14} className="opacity-40" /> No Mentor Assigned
                </span>
              )}
            </div>

            {/* Pending Mentor Request Banner */}
            {pendingMentorInvitation && (
              <div className="mt-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                      <Clock size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                        Formal Mentor Invitation Pending
                      </p>
                      <p className="font-semibold text-[#141A18] dark:text-slate-100">
                        {pendingMentorInvitation.recipient?.name || pendingMentorInvitation.recipientEmail}
                        <span className="ml-1.5 text-xs font-normal text-[#5C6B66] dark:text-[#94A89D]">
                          ({pendingMentorInvitation.recipient?.email || pendingMentorInvitation.recipientEmail})
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                        A formal request notification has been sent. Status remains &ldquo;Pending&rdquo; until the mentor explicitly accepts from their Mentor Portal.
                      </p>
                    </div>
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleCancelInvitation(pendingMentorInvitation)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 dark:border-amber-800 bg-white dark:bg-[#161D19] px-3.5 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 transition hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <X size={13} />
                      Cancel Request
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Invite Form or Guidance */}
            {isOwner && !pendingMentorInvitation && (
              <div className="mt-4 pt-4 border-t border-[#E5EBE7] dark:border-[#1E2B25]">
                {team?.mentor ? (
                  <p className="text-xs text-[#5C6B66] dark:text-[#94A89D]">
                    Mentorship is currently active with {toTitleCase(team.mentor.name)}. If you need to change your Faculty Mentor, click <span className="font-semibold text-red-600 dark:text-red-400">Remove</span> above to unassign them anytime.
                  </p>
                ) : (
                  <div>
                    <p className="mb-3 text-xs font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                      Assigning a mentor is completely optional. You can search active faculty members and send a mentor invitation whenever your team is ready:
                    </p>
                    <form onSubmit={handleSendMentorInvitation} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex-1">
                        <SearchableSelect
                          options={mentors
                            .filter((m) => String(m.id) !== String(team?.mentor?.id || ""))
                            .map((m) => ({
                              value: String(m.id),
                              label: m.name,
                              keywords: m.name,
                            }))}
                          value={selectedMentorId}
                          onChange={setSelectedMentorId}
                          onOpen={() => {
                            if (mentors.length === 0 && !loadingMentors) {
                              loadMentors();
                            }
                          }}
                          placeholder={loadingMentors ? "Loading faculty mentors..." : "Search a Faculty Mentor by name..."}
                          searchPlaceholder="Search a Faculty Mentor by name..."
                          emptyMessage={loadingMentors ? "Loading faculty mentors..." : "No faculty mentors found matching that name"}
                          allowEmpty
                          emptyOptionLabel="Clear selection"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={invitingMentor || !selectedMentorId}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#141A17] px-6 py-3 text-sm font-bold text-[#BEF264] shadow-xs transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-[#A3E635] dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {invitingMentor ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                        Send Mentor Request
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Faculty Mentor Project Review (Visible only to authorized squad/mentor/admin) */}
          {(team?.mentorReview || team?.project?.mentorReview) && (
            <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4ECE6] dark:border-[#1F2C26] pb-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-[#15803D]/10 dark:bg-[#A3E635]/10 px-3 py-1 font-bold text-[#15803D] dark:text-[#A3E635]">
                    <ShieldCheck size={14} /> Official Faculty Mentor Review
                  </span>
                  <span className="font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                    {(team?.reviewedAt || team?.project?.reviewedAt)
                      ? `Reviewed on ${new Date(team.reviewedAt || team.project.reviewedAt).toLocaleDateString()}`
                      : "Verified Assessment"}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                  Private to Squad Members &amp; Leadership
                </span>
              </div>
              <div className="mt-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#141A18] dark:text-slate-100 font-medium">
                  {team?.mentorReview || team?.project?.mentorReview}
                </p>
                {team?.mentor?.name && (
                  <p className="mt-3 text-xs font-bold text-[#5C6B66] dark:text-[#94A89D]">
                    — {toTitleCase(team.mentor.name)} (Faculty Mentor)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Pending Invitations */}
          {isOwner && (
            <div className="space-y-3">
              <h2 className="text-lg font-extrabold text-[#141A18] dark:text-slate-100">
                Pending Invitations
              </h2>

              {pendingInvitations.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#C5D4CA] dark:border-[#2A3B32] bg-[#FAFBF9] dark:bg-[#111815] p-6 text-sm text-[#5C6B66] dark:text-[#94A89D]">
                  No pending invitations.
                </div>
              ) : (
                pendingInvitations.map((invitation) => (
                  <div
                    key={getId(invitation)}
                    className="flex flex-col gap-4 rounded-[24px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-5 shadow-2xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-[#141A18] dark:text-slate-100">
                          {invitation.recipient?.name}
                        </p>
                        {(invitation.recipient?.roll_no || invitation.recipient?.rollNumber) && (
                          <span className="rounded-full bg-[#141A17]/10 dark:bg-white/10 px-2 py-0.5 text-[11px] font-mono font-bold text-[#42504B] dark:text-slate-300">
                            Roll: {invitation.recipient?.roll_no || invitation.recipient?.rollNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#5C6B66] dark:text-[#94A89D]">
                        {invitation.recipient?.email}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-2.5 py-0.5 text-xs font-semibold text-[#42504B] dark:text-slate-300">
                          <Clock size={12} /> Pending
                        </span>
                        {String(invitation.role || "").toLowerCase() === "mentor" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                            <ShieldCheck size={12} /> Mentor Invite
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {String(invitation.role || "").toLowerCase() === "mentor" ? (
                        <div className="flex items-center gap-3">
                          <span className="text-xs italic text-[#5C6B66] dark:text-[#94A89D]">
                            Awaiting Mentor Portal Acceptance
                          </span>
                          <button
                            disabled={busy}
                            onClick={() => handleCancelInvitation(invitation)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2 text-xs font-bold text-red-600 dark:text-red-400 transition hover:bg-red-100 dark:hover:bg-red-950/60 cursor-pointer disabled:opacity-50"
                          >
                            <X size={14} /> Cancel Request
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => copyInvitation(invitation.invitationUrl)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-3.5 py-2 text-xs font-bold"
                          >
                            <Copy size={14} /> Copy Link
                          </button>

                          <button
                            onClick={() => shareWhatsApp(invitation.invitationUrl)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#2E8B63]/35 bg-[#E3F3EB] px-3.5 py-2 text-xs font-bold text-[#1E6B4B] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#22C55E]/40 dark:bg-[#13291E] dark:text-[#6EE7B7] dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B]"
                          >
                            <MessageCircle size={14} /> WhatsApp
                          </button>

                          <button
                            disabled={busy}
                            onClick={() => handleCancelInvitation(invitation)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2 text-xs font-bold text-red-600 dark:text-red-400 transition hover:bg-red-100 dark:hover:bg-red-950/60 cursor-pointer disabled:opacity-50"
                          >
                            <X size={14} /> Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Your Team */}
          <div className="space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-extrabold text-[#141A18] dark:text-slate-100">
                  Your Team
                </h2>
                <p className="mt-0.5 text-sm text-[#5C6B66] dark:text-[#94A89D]">
                  People working on this project.
                </p>
              </div>

              <div className="relative w-full shrink-0 sm:w-64">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75] dark:text-[#869B90]"
                />

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search members..."
                  className="w-full rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] py-2.5 pl-10 pr-4 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
                />
              </div>
            </div>

            {loadingTeam ? (
              <div className="flex items-center justify-center gap-3 rounded-[28px] bg-[#FAFBF9] dark:bg-[#111815] py-16 text-sm font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                <LoaderCircle className="animate-spin text-[#2E8B63] dark:text-[#4ADE80]" size={21} />
                Loading team...
              </div>
            ) : (
              team && (
                <div className="space-y-3">
                  {owner && (
                    <div className="flex flex-col justify-between gap-4 rounded-[28px] border border-[#C9D8CE] dark:border-[#24322B] bg-[#FAFBF9] dark:bg-[#111815] p-5 shadow-2xs sm:flex-row sm:items-center">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1E2422] dark:bg-[#1D2D24] dark:ring-1 dark:ring-[#A3E635]/35 text-lg font-bold text-white">
                          {owner.name?.charAt(0)?.toUpperCase() || "O"}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-[#141A18] dark:text-slate-100">
                              {owner.name}
                            </h3>
                            {(owner.roll_no || owner.rollNumber) && (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-800 dark:text-emerald-300">
                                Roll: {owner.roll_no || owner.rollNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-[#5C6B66] dark:text-[#94A89D]">
                            {owner.email}
                          </p>
                        </div>
                      </div>

                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#2E8B63]/30 dark:border-[#22C55E]/40 bg-[#E3F3EB] dark:bg-[#13291E] px-3.5 py-1.5 text-xs font-bold text-[#1E6B4B] dark:text-[#6EE7B7]">
                        <Crown size={14} /> Project Owner
                      </span>
                    </div>
                  )}

                  {filteredMembers.map((member) => (
                    <div
                      key={getId(member)}
                      className="flex flex-col justify-between gap-4 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-5 shadow-2xs sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-lg font-bold text-[#141A18] dark:text-slate-100">
                          {member.name?.charAt(0)?.toUpperCase() || "U"}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-[#141A18] dark:text-slate-100">
                              {member.name}
                            </h3>
                            {(member.roll_no || member.rollNumber) && (
                              <span className="rounded-full bg-[#141A17]/10 dark:bg-white/10 px-2 py-0.5 text-[11px] font-mono font-bold text-[#42504B] dark:text-slate-300">
                                Roll: {member.roll_no || member.rollNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-[#5C6B66] dark:text-[#94A89D]">
                            {member.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-3.5 py-1.5 text-xs font-semibold text-[#42504B] dark:text-slate-300">
                          Member
                        </span>

                        {isOwner && (
                          <>
                            <button
                              title="Make project owner"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Transfer ownership to ${member.name}?`,
                                  )
                                ) {
                                  api
                                    .patch(
                                      `/team/${selectedProjectId}/transfer-ownership`,
                                      {
                                        newOwnerId: getId(member),
                                      },
                                    )
                                    .then(async (response) => {
                                      setSuccess(response.data.message);
                                      await loadTeam();
                                      await loadProjects();
                                    })
                                    .catch((err) => setError(getError(err)));
                                }
                              }}
                              className="rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-2.5 text-[#42504B] dark:text-slate-300 transition hover:border-[#1E2422] dark:hover:border-[#A3E635]/60 hover:text-[#141A18] dark:hover:text-slate-100"
                            >
                              <ArrowRightLeft size={16} />
                            </button>

                            <button
                              title="Remove member"
                              onClick={() => handleRemoveMember(member)}
                              className="rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-2.5 text-[#42504B] dark:text-slate-300 transition hover:border-red-300 dark:hover:border-red-800/70 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {filteredMembers.length === 0 && (
                    <div className="rounded-[28px] border border-dashed border-[#C5D4CA] dark:border-[#2A3B32] bg-[#FAFBF9] dark:bg-[#111815] py-12 text-center text-[#5C6B66] dark:text-[#94A89D]">
                      <UserRound size={32} className="mx-auto text-[#5C6B66] dark:text-[#94A89D]" />
                      <p className="mt-3 font-bold text-[#141A18] dark:text-slate-100">
                        {members.length
                          ? "No matching members"
                          : "No accepted team members yet"}
                      </p>
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          {!isDirector && (
            <div className="flex flex-wrap gap-3">
              {isOwner ? (
                <button
                  onClick={handleTransferOwnership}
                  disabled={busy || members.length === 0}
                  className="inline-flex items-center gap-2 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-3 text-sm font-bold disabled:opacity-50"
                >
                  <ArrowRightLeft size={16} />
                  Transfer Ownership
                </button>
              ) : (
                <button
                  onClick={handleLeaveProject}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-5 py-3 text-sm font-bold text-red-600 dark:text-red-400 transition hover:bg-red-100 dark:hover:bg-red-950/60"
                >
                  <LogOut size={16} />
                  Leave Project
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
