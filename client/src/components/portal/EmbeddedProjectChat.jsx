import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageSquare, Send, Shield, Trash2 } from "lucide-react";

import api from "../../services/api";
import { getSocket } from "../../services/socket";
import { useAuth } from "../../context/AuthContext";
import { isDirectorUser } from "../../utils/roles";
import { formatDateTime, getErrorMessage, getInitials } from "../../utils/portalHelpers";
import { ErrorAlert } from "./PortalUI";

export default function EmbeddedProjectChat({ projectId, projectTitle }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const messagesListRef = useRef(null);

  const isDirector = isDirectorUser(user);
  const currentUserId = String(user?.id || user?._id || "");

  const loadMessages = useCallback(async () => {
    if (!projectId || isDirector) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/messages/${projectId}`, {
        params: { channel: "official" },
      });
      setMessages(res.data.messages || res.data.data || []);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load official team chat."));
    } finally {
      setLoading(false);
    }
  }, [projectId, isDirector]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!projectId || isDirector) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;

    socket.emit("join_project", { projectId: Number(projectId), channel: "official" });

    const handleNew = (payload) => {
      const msg = payload?.message || payload;
      if (!msg || String(msg.projectId || msg.project_id || msg.project) !== String(projectId)) {
        return;
      }
      if ((msg.channel || "official") !== "official") return;
      const msgId = String(msg.id || msg._id || "");
      if (!msgId) return;
      setMessages((prev) => {
        if (prev.some((m) => String(m.id || m._id) === msgId)) return prev;
        return [...prev, msg];
      });
    };

    const handleDeleted = (payload) => {
      const targetId = String(payload?.messageId || payload?.id || payload?._id || "");
      if (!targetId) return;
      setMessages((prev) => prev.filter((m) => String(m.id || m._id) !== targetId));
    };

    socket.on("chat:message:new", handleNew);
    socket.on("chat:message:deleted", handleDeleted);

    return () => {
      socket.emit("leave_project", { projectId: Number(projectId), channel: "official" });
      socket.off("chat:message:new", handleNew);
      socket.off("chat:message:deleted", handleDeleted);
    };
  }, [projectId, isDirector]);

  // Scroll ONLY the inner chat messages list — never scroll the outer page window
  useEffect(() => {
    const el = messagesListRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  if (isDirector) {
    return (
      <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-sm font-semibold text-rose-700 dark:text-rose-300">
        Director accounts operate in read-only executive mode and do not have access to project chat channels.
      </div>
    );
  }

  const handleSend = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await api.post(`/messages/${projectId}`, {
        content,
        channel: "official",
      });
      const created = res.data.data || res.data.messageData;
      if (created) {
        const cid = String(created.id || created._id);
        setMessages((prev) => (prev.some((m) => String(m.id || m._id) === cid) ? prev : [...prev, created]));
      }
      setText("");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to send message."));
    } finally {
      setSending(false);
    }
  };

  const handleDeleteOwn = async (messageId) => {
    try {
      await api.delete(`/messages/${projectId}/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => String(m.id || m._id) !== String(messageId)));
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete message."));
    }
  };

  return (
    <div className="flex h-[520px] flex-col overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xs">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent-text)]">
            <Shield size={17} />
          </div>
          <div>
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              Official Team Channel{projectTitle ? ` · ${projectTitle}` : ""}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Real-time Mentor &amp; Team communication (Student unofficial squad chat stays strictly private)
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3">
          <ErrorAlert message={error} onDismiss={() => setError("")} />
        </div>
      )}

      <div ref={messagesListRef} className="flex-1 space-y-3 overflow-y-auto p-5 scrollbar-thin">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
            <LoaderCircle size={18} className="animate-spin text-[#15803D] dark:text-[#A3E635]" />
            <span>Loading official messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquare size={28} className="text-[var(--text-muted)]" />
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">No messages yet</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Start an official update or review thread with the team below.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const senderId = String(msg.sender?.id || msg.sender?._id || msg.sender_id || "");
            const isMe = senderId === currentUserId;
            const senderName = msg.sender?.name || msg.sender_name || "Member";
            const senderRole = msg.sender?.role || "";
            return (
              <div
                key={msg.id || msg._id}
                className={`flex items-end gap-2.5 ${isMe ? "justify-end" : "justify-start"}`}
              >
                {!isMe && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface-subtle)] text-[10px] font-bold text-[var(--text-primary)]">
                    {getInitials(senderName)}
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-2xs ${
                    isMe
                      ? "rounded-br-sm bg-[#141A17] text-white dark:bg-[#1E3A2A] dark:text-slate-100"
                      : "rounded-bl-sm border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-bold opacity-80">
                    <span>
                      {isMe ? "You" : senderName}
                      {senderRole ? ` · ${senderRole}` : ""}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span>{formatDateTime(msg.createdAt || msg.created_at)}</span>
                      {isMe && (
                        <button
                          type="button"
                          onClick={() => handleDeleteOwn(msg.id || msg._id)}
                          title="Delete message"
                          className="rounded p-0.5 transition hover:text-rose-400"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {msg.content || msg.message}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Send an official message to this team..."
          className="flex-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[#15803D] dark:focus:border-[#22C55E]"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#141A17] px-5 text-xs font-bold text-[#BEF264] transition hover:bg-[#1E6B4B] hover:text-white dark:bg-[#A3E635] dark:text-[#090D0B] dark:hover:bg-[#22C55E] disabled:opacity-50"
        >
          {sending ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
          <span>Send</span>
        </button>
      </form>
    </div>
  );
}
