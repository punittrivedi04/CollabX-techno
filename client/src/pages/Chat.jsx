import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  Send,
  MessageSquare,
  ArrowLeft,
  LoaderCircle,
  Users,
  FolderKanban,
  AlertCircle,
  Shield,
  Lock,
  Trash2,
} from "lucide-react";

import api from "../services/api";
import { getSocket } from "../services/socket";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const getId = (value) => String(value?._id || value?.id || value || "");

const getError = (error) =>
  error.response?.data?.message || error.message || "Something went wrong.";

const formatTime = (ts) => {
  const parsed = ts ? new Date(ts) : new Date();
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return safeDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizeMessage = (payload, fallback = {}) => {
  const raw =
    payload && typeof payload === "object"
      ? payload.message && typeof payload.message === "object"
        ? payload.message
        : payload.data && typeof payload.data === "object"
          ? payload.data
          : payload
      : null;

  if (!raw || typeof raw !== "object") return null;

  const id = String(raw._id || raw.id || fallback.id || "");
  const content = String(
    raw.content ??
      raw.text ??
      (typeof raw.message === "string" ? raw.message : "") ??
      fallback.content ??
      "",
  );

  // Strict guard: never allow empty/malformed ghost messages into state
  if (!id || !content.trim()) return null;

  const rawSender =
    raw.sender && typeof raw.sender === "object" ? raw.sender : null;
  const senderId = String(
    rawSender?._id ||
      rawSender?.id ||
      raw.sender_id ||
      (typeof raw.sender === "string" || typeof raw.sender === "number"
        ? raw.sender
        : "") ||
      fallback.senderId ||
      "",
  );
  const senderName =
    rawSender?.name ||
    raw.sender_name ||
    raw.name ||
    fallback.senderName ||
    "Member";
  const senderEmail =
    rawSender?.email || raw.sender_email || fallback.senderEmail || "";
  const senderRole =
    rawSender?.role || raw.sender_role || fallback.senderRole || "";

  const rawTimestamp = raw.createdAt || raw.created_at || fallback.createdAt;
  const parsedDate = rawTimestamp ? new Date(rawTimestamp) : new Date();
  const createdAt = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  const resolvedProjectId = String(
    raw.projectId || raw.project_id || raw.project || fallback.projectId || "",
  );

  return {
    id,
    _id: id,
    project: resolvedProjectId,
    projectId: resolvedProjectId,
    project_id: resolvedProjectId,
    channel: raw.channel || fallback.channel || "official",
    content,
    sender: {
      id: senderId,
      _id: senderId,
      name: senderName,
      email: senderEmail,
      role: senderRole,
    },
    sender_id: senderId,
    sender_name: senderName,
    createdAt,
    created_at: createdAt,
  };
};

const upsertMessage = (current, incoming) => {
  if (!incoming) return current;
  const incomingId = String(incoming._id || incoming.id || "");
  if (!incomingId) return current;

  const existingIndex = current.findIndex(
    (item) => String(item._id || item.id) === incomingId,
  );
  if (existingIndex === -1) {
    return [...current, incoming];
  }

  const next = [...current];
  next[existingIndex] = { ...next[existingIndex], ...incoming };
  return next;
};

const SENDER_COLORS = [
  "#1E6B4B",
  "#2E8B63",
  "#2C3A35",
  "#0F766E",
  "#3B5224",
  "#0369A1",
  "#4338CA",
  "#9F1239",
];

const DARK_SENDER_COLORS = [
  "#A3E635",
  "#4ADE80",
  "#34D399",
  "#38BDF8",
  "#86EFAC",
  "#2DD4BF",
  "#C084FC",
  "#FBBF24",
];

const getSenderColor = (sender, isDark = false) => {
  const key = String(
    sender?._id || sender?.id || sender?.name || sender || "collabx-member",
  );
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const palette = isDark ? DARK_SENDER_COLORS : SENDER_COLORS;
  return palette[Math.abs(hash) % palette.length];
};

export default function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { isDark } = useTheme();

  const isDirector =
    String(user?.role || "").toLowerCase().trim() === "director";
  const userRole = String(user?.role || "student").toLowerCase();
  const isStudent = !["admin", "mentor", "coordinator", "director"].includes(userRole);

  const projectId = searchParams.get("projectId");

  // Default channel: 'unofficial' for students, 'official' for mentors/admins
  const [channel, setChannel] = useState(isStudent ? "unofficial" : "official");

  const [projects, setProjects] = useState([]);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [error, setError] = useState("");

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const currentUserId = getId(user);

  // Sync default channel on role change
  useEffect(() => {
    if (!isStudent) {
      setChannel("official");
    }
  }, [isStudent]);

  useEffect(() => {
    if (isDirector) {
      setLoadingProjects(false);
      return;
    }

    const loadProjects = async () => {
      try {
        setError("");
        const response = await api.get("/projects");
        setProjects(response.data.projects || []);
      } catch (err) {
        setError(getError(err));
      } finally {
        setLoadingProjects(false);
      }
    };

    loadProjects();
  }, [isDirector]);

  const activeProject = useMemo(
    () =>
      projects.find(
        (project) => String(project._id || project.id) === String(projectId),
      ),
    [projects, projectId],
  );

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) =>
        (project.name || project.title || "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [projects, search],
  );

  useEffect(() => {
    if (!projectId || isDirector) {
      setMessages([]);
      return;
    }

    let active = true;

    const loadMessages = async () => {
      setLoadingMessages(true);
      setError("");
      setMessages([]);
      setConfirmDeleteId(null);

      try {
        const response = await api.get(`/messages/${projectId}`, {
          params: { channel },
        });
        if (active) {
          const rawList = Array.isArray(response.data?.messages)
            ? response.data.messages
            : Array.isArray(response.data?.data)
              ? response.data.data
              : [];
          setMessages(
            rawList
              .map((item) => normalizeMessage(item, { projectId, channel }))
              .filter(Boolean),
          );
        }
      } catch (err) {
        if (active) {
          setError(getError(err));
        }
      } finally {
        if (active) {
          setLoadingMessages(false);
        }
      }
    };

    loadMessages();

    const socket = getSocket();

    if (socket) {
      const joinRoom = () => {
        socket.emit("join_project", { projectId, channel });
      };
      joinRoom();

      const handleNewMessage = (payload) => {
        const normalized = normalizeMessage(payload);
        if (!normalized) return;

        const msgProjectId = String(normalized.projectId || "");
        const msgChannel = normalized.channel || "official";

        if (msgProjectId === String(projectId) && msgChannel === channel) {
          setMessages((current) => upsertMessage(current, normalized));
        }
      };

      const handleMessageDeleted = (payload) => {
        const deletedId = String(payload?.messageId || payload?.id || payload?._id || "");
        const deletedProjectId = String(payload?.projectId || payload?.project || "");
        const deletedChannel = payload?.channel || "official";

        if (!deletedId) return;
        if (deletedProjectId && deletedProjectId !== String(projectId)) return;
        if (payload?.channel && deletedChannel !== channel) return;

        setMessages((current) =>
          current.filter((item) => String(item._id || item.id) !== deletedId),
        );
        setConfirmDeleteId((current) =>
          String(current) === deletedId ? null : current,
        );
      };

      socket.on("connect", joinRoom);
      socket.on("receive_message", handleNewMessage);
      socket.on("chat:message:new", handleNewMessage);
      socket.on("chat_message_received", handleNewMessage);
      socket.on("chat:message:deleted", handleMessageDeleted);
      socket.on("message_deleted", handleMessageDeleted);

      return () => {
        active = false;
        socket.off("connect", joinRoom);
        socket.off("receive_message", handleNewMessage);
        socket.off("chat:message:new", handleNewMessage);
        socket.off("chat_message_received", handleNewMessage);
        socket.off("chat:message:deleted", handleMessageDeleted);
        socket.off("message_deleted", handleMessageDeleted);
        socket.emit("leave_project", { projectId, channel });
      };
    }

    return () => {
      active = false;
    };
  }, [projectId, channel, isDirector]);

  useEffect(() => {
    if (!confirmDeleteId) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setConfirmDeleteId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDeleteId]);

  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages]);

  useEffect(() => {
    if (projectId && !loadingMessages) {
      const timer = setTimeout(() => {
        scrollToBottom("smooth");
        inputRef.current?.focus();
      }, 60);

      return () => clearTimeout(timer);
    }
  }, [projectId, loadingMessages]);

  const selectProject = (id) => {
    setSearchParams({ projectId: id });
    setSearch("");
    setError("");
    if (isStudent) {
      setChannel("unofficial");
    } else {
      setChannel("official");
    }
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const sendMessage = async (event) => {
    event?.preventDefault?.();

    const content = message.trim();
    if (!content || !projectId || sending) return;

    setSending(true);
    setError("");

    try {
      const response = await api.post(`/messages/${projectId}`, {
        content,
        channel,
      });

      const rawSaved =
        response.data?.data ||
        response.data?.messageData ||
        (response.data?.message && typeof response.data.message === "object"
          ? response.data.message
          : null);

      const savedMessage = normalizeMessage(rawSaved, {
        projectId,
        channel,
        content,
        senderId: currentUserId,
        senderName: user?.name || "You",
        senderEmail: user?.email || "",
        senderRole: user?.role || "",
        createdAt: new Date().toISOString(),
      });

      if (savedMessage) {
        setMessages((current) => upsertMessage(current, savedMessage));
      }

      setMessage("");
      scrollToBottom("smooth");
      inputRef.current?.focus();
    } catch (err) {
      setError(getError(err));
    } finally {
      setSending(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleDeleteMessage = async (msgId) => {
    if (!projectId || !msgId || deletingId) return;

    setDeletingId(msgId);
    setError("");

    try {
      await api.delete(`/messages/${projectId}/${msgId}`);
      setMessages((current) =>
        current.filter((item) => String(item._id || item.id) !== String(msgId)),
      );
      setConfirmDeleteId(null);
    } catch (err) {
      setError(getError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const goBack = () => {
    setSearchParams({});
  };

  if (isDirector) {
    return (
      <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-8 text-center shadow-2xs">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E3F3EB] dark:bg-[#13291E] text-[#1E6B4B] dark:text-[#6EE7B7]">
          <Shield size={32} />
        </div>
        <h2 className="mt-4 text-xl font-extrabold text-[#141A18] dark:text-slate-100">
          Director Executive Mode
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#5C6B66] dark:text-[#94A89D]">
          The Director account has high-level read-only oversight across all 47 projects and 139 users. Team group chats are private operational channels.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-[#141A18] dark:text-slate-100">
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-sm font-medium text-red-600 dark:text-red-400">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="font-bold">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid h-[calc(100vh-11rem)] min-h-[560px] grid-cols-1 overflow-hidden rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] shadow-2xs lg:grid-cols-[300px_1fr]">
        {/* PROJECT CHANNELS SIDEBAR */}
        <aside
          className={`${
            projectId ? "hidden lg:flex" : "flex"
          } h-full min-h-0 flex-col border-r border-[#E2DFD5] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A]`}
        >
          <div className="shrink-0 border-b border-[#E2DFD5] dark:border-[#2D362B] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5C6662] dark:text-[#94A89D]">
                Squad Channels
              </h2>

              <span className="rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-2.5 py-0.5 text-xs font-extrabold text-[#141A18] dark:text-slate-100">
                {projects.length}
              </span>
            </div>

            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7B75] dark:text-[#869B90]"
              />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="w-full rounded-full border border-[#DDDAD0] dark:border-[#2D362B] bg-white dark:bg-[#0C120F] py-2.5 pl-10 pr-4 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none placeholder:text-[#8E9E97] dark:placeholder:text-[#687E73] focus:border-[#2E8B63] dark:focus:border-[#22C55E]"
              />
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3.5">
            {loadingProjects ? (
              <div className="flex justify-center py-10 text-[#5C6B66] dark:text-[#94A89D]">
                <LoaderCircle className="animate-spin text-[#2E8B63] dark:text-[#4ADE80]" />
              </div>
            ) : filteredProjects.length ? (
              filteredProjects.map((project) => {
                const pId = String(project._id || project.id);
                const isSelected = String(projectId) === pId;
                const memberCount =
                  project.memberCount ??
                  ((project.members?.length || 0) + (project.owner ? 1 : 0));

                return (
                  <button
                    key={pId}
                    onClick={() => selectProject(pId)}
                    className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${
                      isSelected
                        ? "bg-[#1E2422] dark:bg-[#1D2D24] dark:ring-1 dark:ring-[#A3E635]/35 text-white shadow-xs"
                        : "border border-transparent bg-white/75 dark:bg-[#0C120F]/85 text-[#141A18] dark:text-slate-100 hover:border-[#D4DFD7] dark:hover:border-[#2E3F35] hover:bg-white dark:hover:bg-[#1E2A24]"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isSelected
                          ? "bg-[#2E8B63] text-white"
                          : "border border-[#E4ECE6] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#42504B] dark:text-slate-300"
                      }`}
                    >
                      <FolderKanban size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {project.title || project.name}
                      </p>

                      <p
                        className={`mt-0.5 flex items-center gap-1 text-xs ${
                          isSelected ? "text-white/75" : "text-[#5C6B66] dark:text-[#94A89D]"
                        }`}
                      >
                        <Users size={12} />
                        {memberCount} members
                      </p>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="py-8 text-center text-sm text-[#5C6B66] dark:text-[#94A89D]">
                No projects found.
              </p>
            )}
          </div>
        </aside>

        {/* CHAT CONVERSATION AREA */}
        <section
          className={`${
            projectId ? "flex" : "hidden lg:flex"
          } h-full min-h-0 min-w-0 flex-col bg-[#F7FAF8] dark:bg-[#0C120F]`}
        >
          {projectId && activeProject ? (
            <>
              <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#E4ECE6] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <button
                    onClick={goBack}
                    className="rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-2 text-[#141A18] dark:text-slate-100 lg:hidden"
                  >
                    <ArrowLeft size={18} />
                  </button>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100">
                    <FolderKanban size={19} />
                  </div>

                  <div className="min-w-0">
                    <h2 className="truncate text-base font-extrabold text-[#141A18] dark:text-slate-100">
                      {activeProject.title || activeProject.name}
                    </h2>
                    <p className="text-xs font-medium text-[#5C6B66] dark:text-[#94A89D]">
                      {channel === "unofficial"
                        ? "Unofficial (Team Only Chat)"
                        : "Official (Mentor + Team Chat)"}
                    </p>
                  </div>
                </div>

                {/* DUAL GROUP CHAT CHANNEL TOGGLE (Student vs Mentor/Admin) */}
                {isStudent && (
                  <div className="inline-flex items-center rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] p-1 text-xs font-bold shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setChannel("unofficial")}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                        channel === "unofficial"
                          ? "bg-[#1E2422] dark:bg-[#1D2D24] dark:ring-1 dark:ring-[#A3E635]/35 text-[#bce784] shadow-xs"
                          : "text-[#5C6B66] dark:text-[#94A89D] hover:text-[#141A18] dark:hover:text-slate-100"
                      }`}
                    >
                      <Lock size={12} />
                      <span>Unofficial (Team Only)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel("official")}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                        channel === "official"
                          ? "bg-[#1E2422] dark:bg-[#1D2D24] dark:ring-1 dark:ring-[#A3E635]/35 text-[#bce784] shadow-xs"
                          : "text-[#5C6B66] dark:text-[#94A89D] hover:text-[#141A18] dark:hover:text-slate-100"
                      }`}
                    >
                      <Users size={12} />
                      <span>Official (Mentor + Team)</span>
                    </button>
                  </div>
                )}

                {!isStudent && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2E8B63]/30 dark:border-[#22C55E]/40 bg-[#E3F3EB] dark:bg-[#13291E] px-3.5 py-1.5 text-xs font-bold text-[#1E6B4B] dark:text-[#6EE7B7]">
                    <Users size={13} />
                    <span>Official Channel</span>
                  </span>
                )}
              </header>

              {/* MESSAGES */}
              <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                <div className="py-1 text-center">
                  <span className="rounded-full border border-[#DCE5DF] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-3.5 py-1 text-[11px] font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                    {channel === "unofficial"
                      ? "🔒 Private Student Team Channel"
                      : "👥 Official Mentor & Team Channel"}
                  </span>
                </div>

                {loadingMessages ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-[#5C6B66] dark:text-[#94A89D]">
                    <LoaderCircle
                      size={18}
                      className="animate-spin text-[#2E8B63] dark:text-[#4ADE80]"
                    />
                    Loading messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-16 text-center">
                    <MessageSquare
                      size={34}
                      className="mx-auto text-[#5C6B66] dark:text-[#94A89D]"
                    />
                    <p className="mt-3 text-sm font-bold text-[#141A18] dark:text-slate-100">
                      No messages in {channel} channel yet.
                    </p>
                    <p className="mt-1 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                      Start the conversation with your team!
                    </p>
                  </div>
                ) : (
                  messages.map((item) => {
                    const msgId = String(item._id || item.id);
                    const senderId = getId(item.sender || item.sender_id);
                    const isMine =
                      Boolean(currentUserId) && senderId === currentUserId;
                    const senderName =
                      item.sender?.name ||
                      item.sender_name ||
                      item.name ||
                      (isMine ? "You" : "Team Member");

                    return (
                      <div
                        key={msgId}
                        className={`flex ${
                          isMine ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`flex max-w-[90%] flex-col sm:max-w-[76%] ${
                            isMine ? "items-end" : "items-start"
                          }`}
                        >
                          {!isMine && (
                            <span
                              className="mb-1 ml-1 text-[11px] font-bold"
                              style={{ color: getSenderColor(senderName, isDark) }}
                            >
                              {senderName}
                            </span>
                          )}

                          <div className="group relative flex items-center gap-1.5">
                            {isMine &&
                              (confirmDeleteId === msgId ? (
                                <div className="flex items-center gap-1 rounded-full border border-red-200 dark:border-red-900/60 bg-white dark:bg-[#0C120F] px-2 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 shadow-2xs">
                                  <span className="px-1">Delete?</span>
                                  <button
                                    type="button"
                                    disabled={deletingId === msgId}
                                    onClick={() => handleDeleteMessage(msgId)}
                                    className="rounded-full bg-red-600 px-2 py-0.5 text-white transition hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {deletingId === msgId ? (
                                      <LoaderCircle
                                        size={12}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      "Yes"
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={deletingId === msgId}
                                    onClick={() => setConfirmDeleteId(null)}
                                    aria-label="Cancel delete message"
                                    className="rounded-full px-1.5 py-0.5 text-[#5C6B66] dark:text-[#94A89D] transition hover:bg-[#EFF4F0] dark:hover:bg-[#1F2C25] hover:text-[#141A18] dark:hover:text-slate-100 cursor-pointer"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(msgId)}
                                  aria-label="Delete message for everyone"
                                  title="Delete for everyone"
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-transparent text-[#8E9E97] dark:text-[#6E8579] opacity-0 transition hover:border-red-200 dark:hover:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                                >
                                  <Trash2 size={14} />
                                </button>
                              ))}

                            <div
                              className={`min-w-[90px] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-2xs ${
                                isMine
                                  ? "rounded-br-sm bg-[#2E8B63] text-white"
                                  : "rounded-bl-sm border border-[#DCE5DF] dark:border-[#1F2C26] bg-white dark:bg-[#161F1B] text-[#141A18] dark:text-slate-100"
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">
                                {item.content}
                              </p>
                            </div>
                          </div>

                          <span className="mt-1 px-1 text-[10px] font-medium text-[#6B7B75] dark:text-[#869B90]">
                            {formatTime(item.created_at || item.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* INPUT BAR */}
              <form
                onSubmit={sendMessage}
                className="shrink-0 border-t border-[#E4ECE6] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-3.5 sm:p-4"
              >
                <div className="flex items-center gap-2 rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-1.5 pl-4 shadow-2xs transition focus-within:border-[#2E8B63] dark:focus-within:border-[#22C55E]">
                  <input
                    ref={inputRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !sending) {
                        inputRef.current?.focus();
                      }
                    }}
                    placeholder={`Message #${channel}...`}
                    maxLength={2000}
                    disabled={loadingMessages}
                    className="min-w-0 flex-1 bg-transparent py-2 text-sm font-medium text-[#141A18] dark:text-slate-100 outline-none placeholder:text-[#8E9E97] dark:placeholder:text-[#687E73]"
                  />

                  <button
                    type="submit"
                    disabled={!message.trim() || sending || loadingMessages}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] disabled:cursor-not-allowed disabled:bg-[#DCE5DF] dark:disabled:bg-[#1A2520] disabled:text-[#6B7B75] dark:disabled:text-[#687E73]"
                  >
                    {sending ? (
                      <LoaderCircle size={17} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100">
                <MessageSquare size={24} />
              </div>
              <h3 className="mt-4 text-base font-extrabold text-[#141A18] dark:text-slate-100">
                Select a project channel
              </h3>
              <p className="mt-1.5 max-w-sm text-sm text-[#5C6B66] dark:text-[#94A89D]">
                Choose a project from the left to view its conversation and chat
                with your team.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
