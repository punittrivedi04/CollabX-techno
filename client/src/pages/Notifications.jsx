import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  X,
  Trash2,
  CheckCheck,
  LoaderCircle,
  Mail,
  Users,
  Clock,
  RefreshCw,
} from "lucide-react";

import api from "../services/api";
import { reconnectSocket } from "../services/socket";

const getError = (error) =>
  error.response?.data?.message || error.message || "Something went wrong.";

const getId = (item) => (item ? item.id || item._id : null);

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const seenNotificationIds = useRef(new Set());

  // Helper to reliably restore DOM scroll position without freezing or jumping
  const restoreScrollPosition = (scrollY) => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: "instant" });
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "instant" });
      });
    });
  };

  // Auto-dismiss success message after 4s
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const loadData = async (preserveScroll = false) => {
    setError("");
    const currentScrollY = preserveScroll
      ? window.scrollY || document.documentElement.scrollTop || 0
      : 0;

    try {
      const [notificationRes, invitationRes] = await Promise.all([
        api.get("/notifications"),
        api.get("/team/invitations/received"),
      ]);

      const fetchedNotifications = (notificationRes.data.notifications || []).map(
        (n) => ({
          ...n,
          _id: getId(n),
        }),
      );

      fetchedNotifications.forEach((notification) => {
        if (notification._id) {
          seenNotificationIds.current.add(String(notification._id));
        }
      });

      setNotifications(fetchedNotifications);

      const count = notificationRes.data.unreadCount || 0;
      setUnreadCount(count);

      window.dispatchEvent(
        new CustomEvent("collabx_unread_count_updated", {
          detail: { count },
        }),
      );

      const rawInvitations = invitationRes.data.invitations || [];
      setInvitations(
        rawInvitations.map((inv) => ({
          ...inv,
          _id: getId(inv),
        })),
      );
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoading(false);
      if (preserveScroll && currentScrollY > 0) {
        restoreScrollPosition(currentScrollY);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleNewNotification = (event) => {
      const notification = event.detail?.notification;
      const notifId = getId(notification);

      if (!notifId) return;
      if (seenNotificationIds.current.has(String(notifId))) return;

      seenNotificationIds.current.add(String(notifId));

      setNotifications((previous) => [
        { ...notification, _id: notifId },
        ...previous,
      ].slice(0, 50));

      if (!notification.isRead && !notification.is_read) {
        setUnreadCount((previous) => previous + 1);
      }

      setSuccess("You received a new notification!");

      api
        .get("/team/invitations/received")
        .then((response) => {
          const raw = response.data.invitations || [];
          setInvitations(
            raw.map((inv) => ({
              ...inv,
              _id: getId(inv),
            })),
          );
        })
        .catch((err) => {
          console.error("Invitation refresh failed:", err.message);
        });
    };

    window.addEventListener(
      "collabx_notification_received",
      handleNewNotification,
    );

    return () => {
      window.removeEventListener(
        "collabx_notification_received",
        handleNewNotification,
      );
    };
  }, []);

  const handleInvitation = async (invitationId, action) => {
    const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    setBusyId(invitationId);
    setError("");
    setSuccess("");

    try {
      const response = await api.patch(
        `/team/invitations/${invitationId}/${action}`,
      );

      setSuccess(response.data.message);
      await loadData(true);
    } catch (err) {
      setError(getError(err));
      await loadData(true);
    } finally {
      setBusyId("");
      restoreScrollPosition(currentScrollY);
    }
  };

  const markRead = async (notificationId) => {
    if (!notificationId) return;
    const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;

    // Optimistic local update
    setNotifications((prev) =>
      prev.map((n) =>
        String(n._id) === String(notificationId)
          ? { ...n, isRead: true, is_read: true }
          : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    window.dispatchEvent(
      new CustomEvent("collabx_unread_count_updated", {
        detail: { count: Math.max(0, unreadCount - 1) },
      })
    );

    try {
      await api.patch(`/notifications/${notificationId}/read`);
      window.dispatchEvent(new CustomEvent("collabx_notifications_updated"));
    } catch (err) {
      setError(getError(err));
      await loadData(true);
    } finally {
      restoreScrollPosition(currentScrollY);
    }
  };

  // Mark all read with complete scroll stability (zero lock, freeze, or jump)
  const markAllRead = async (e) => {
    if (e) {
      e.preventDefault();
      e.currentTarget?.blur?.();
    }
    if (markingAllRead || unreadCount === 0) return;
    setMarkingAllRead(true);
    setError("");
    setSuccess("");

    // 1. Capture exact DOM scroll coordinates before mutation
    const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;

    // 2. Optimistically update local notification states
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        isRead: true,
        is_read: true,
      }))
    );
    setUnreadCount(0);
    window.dispatchEvent(
      new CustomEvent("collabx_unread_count_updated", {
        detail: { count: 0 },
      })
    );

    try {
      await api.patch("/notifications/read-all");
      setSuccess("All notifications marked as read.");
      window.dispatchEvent(new CustomEvent("collabx_notifications_updated"));
    } catch (err) {
      setError(getError(err));
      // Revert if error
      await loadData(true);
    } finally {
      setMarkingAllRead(false);
      // 3. Keep DOM scroll strictly intact across frame repaints
      restoreScrollPosition(currentScrollY);
    }
  };

  const deleteNotification = async (notificationId) => {
    if (!notificationId) return;
    const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;

    const target = notifications.find((n) => String(n._id) === String(notificationId));
    const wasUnread = target && !(target.isRead ?? target.is_read);

    setNotifications((prev) =>
      prev.filter((n) => String(n._id) !== String(notificationId))
    );
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
      window.dispatchEvent(
        new CustomEvent("collabx_unread_count_updated", {
          detail: { count: Math.max(0, unreadCount - 1) },
        })
      );
    }

    try {
      await api.delete(`/notifications/${notificationId}`);
      window.dispatchEvent(new CustomEvent("collabx_notifications_updated"));
    } catch (err) {
      setError(getError(err));
      await loadData(true);
    } finally {
      restoreScrollPosition(currentScrollY);
    }
  };

  // Explicitly drop existing socket, clean up state, and force fresh WebSocket reconnection + API sync
  const handleRefresh = async (e) => {
    if (e) {
      e.preventDefault();
      e.currentTarget?.blur?.();
    }
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    setSuccess("");

    const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;

    try {
      // 1. Explicitly drop socket connection, clean up state, and force fresh WebSocket reconnection
      reconnectSocket();

      // 2. Clean internal seen IDs set
      seenNotificationIds.current.clear();

      // 3. Sync latest data from API
      await loadData(false);

      setSuccess("Live WebSocket reconnected & notifications synced.");
    } catch (err) {
      setError(getError(err));
    } finally {
      setRefreshing(false);
      restoreScrollPosition(currentScrollY);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] text-sm font-semibold text-[#5C6B66] dark:text-[#94A89D]">
        <LoaderCircle className="animate-spin text-[#2E8B63] dark:text-[#4ADE80]" size={22} />
        Loading notifications...
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#141A18] dark:text-slate-100">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-5 shadow-xs sm:flex-row sm:items-center sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-block rounded-full bg-[#bce784]/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#141A18] dark:border dark:border-[#A3E635]/30 dark:bg-[#1D2B14] dark:text-[#A3E635]">
              Workspace Updates
            </span>
            {success && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2E8B63]/30 bg-[#DEF7EC] px-3 py-1 text-xs font-bold text-[#1E6B4B] dark:border-[#22C55E]/40 dark:bg-[#0F2D20] dark:text-[#6EE7B7]">
                <Check size={12} />
                {success}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm font-medium text-[#5C6B66] dark:text-[#94A89D]">
            Manage incoming squad invitations and project alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-4 py-2.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin text-[#2E8B63] dark:text-[#BEF264]" : ""} />
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>

          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0 || markingAllRead}
            className="inline-flex items-center gap-2 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-xs font-bold shadow-xs disabled:opacity-40 cursor-pointer"
          >
            {markingAllRead ? (
              <LoaderCircle size={15} className="animate-spin text-[#bce784]" />
            ) : (
              <CheckCheck size={15} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
            )}
            <span>{markingAllRead ? "Marking..." : "Mark all read"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-sm font-medium text-red-600 dark:text-red-400">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="p-1 hover:opacity-70 cursor-pointer">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Bento Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
            Unread notifications
          </p>
          <p className="mt-3 text-4xl font-extrabold text-[#141A18] dark:text-slate-100">
            {unreadCount}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] p-6 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[#5C6662] dark:text-[#94A89D]">
            Pending invitations
          </p>
          <p className="mt-3 text-4xl font-extrabold text-[#141A18] dark:text-slate-100">
            {invitations.length}
          </p>
        </div>
      </div>

      {/* Team Invitations */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#bce784] text-[#141A18]">
            <Users size={16} />
          </span>
          <h2 className="text-lg font-extrabold text-[#141A18] dark:text-slate-100">
            Team Invitations
          </h2>
        </div>

        {invitations.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-[#C5D4CA] dark:border-[#2A3B32] bg-[#FAFBF9] dark:bg-[#111815] p-8 text-center">
            <Mail size={30} className="mx-auto text-[#5C6B66] dark:text-[#94A89D]" />
            <p className="mt-3 font-bold text-[#141A18] dark:text-slate-100">
              No pending invitations
            </p>
            <p className="mt-1 text-sm text-[#5C6B66] dark:text-[#94A89D]">
              New project invitations will appear here.
            </p>
          </div>
        ) : (
          invitations.map((invitation) => (
            <div
              key={invitation._id}
              className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-5 shadow-xs"
            >
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-bold text-[#141A18] dark:text-slate-100">
                    {invitation.sender?.name || "A CollabX user"} invited you
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#42504B] dark:text-slate-300">
                    Project: {invitation.project?.name || "Project"}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                    <Clock size={13} />
                    {new Date(invitation.createdAt || invitation.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === invitation._id}
                    onClick={() => handleInvitation(invitation._id, "accept")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#1E6B4B] px-5 py-2.5 text-xs font-extrabold text-white shadow-2xs transition-all duration-200 hover:bg-[#155E3F] dark:bg-[#22C55E] dark:text-[#090D0B] dark:hover:bg-[#A3E635] disabled:opacity-50 cursor-pointer"
                  >
                    {busyId === invitation._id ? (
                      <LoaderCircle size={15} className="animate-spin" />
                    ) : (
                      <Check size={15} />
                    )}
                    Accept
                  </button>

                  <button
                    type="button"
                    disabled={busyId === invitation._id}
                    onClick={() => handleInvitation(invitation._id, "reject")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-950/60 px-5 py-2.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 cursor-pointer"
                  >
                    <X size={15} /> Reject
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {/* All Notifications */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2E8B63] text-white">
            <Bell size={16} />
          </span>
          <h2 className="text-lg font-extrabold text-[#141A18] dark:text-slate-100">
            All Notifications
          </h2>
        </div>

        {notifications.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-[#C5D4CA] dark:border-[#2A3B32] bg-[#FAFBF9] dark:bg-[#111815] p-8 text-center text-sm font-medium text-[#5C6B66] dark:text-[#94A89D]">
            You are all caught up. No notifications yet.
          </div>
        ) : (
          notifications.map((notification) => {
            const isRead = notification.isRead ?? notification.is_read;
            return (
              <div
                key={notification._id}
                className={`flex flex-col justify-between gap-4 rounded-[24px] border p-4 shadow-2xs transition sm:flex-row sm:items-center ${
                  isRead
                    ? "border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815]"
                    : "border-[#bce784] bg-[#bce784]/25 dark:border-[#A3E635]/40 dark:bg-[#1B2B15]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white dark:bg-[#0C120F] text-[#141A18] dark:text-slate-100 shadow-2xs">
                    <Bell size={16} />
                  </div>

                  <div>
                    <p className="text-sm font-bold text-[#141A18] dark:text-slate-100">
                      {notification.message}
                    </p>
                    <p className="mt-1 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                      {new Date(notification.createdAt || notification.created_at).toLocaleString()}
                    </p>

                    {!isRead && (
                      <span className="mt-2 inline-block rounded-full bg-[#1E2422] dark:bg-[#1D2D24] dark:ring-1 dark:ring-[#A3E635]/35 px-2.5 py-0.5 text-[10px] font-bold text-[#bce784]">
                        Unread
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {!isRead && (
                    <button
                      type="button"
                      title="Mark as read"
                      onClick={() => markRead(notification._id)}
                      className="rounded-full bg-white dark:bg-[#0C120F] p-2 text-[#141A18] dark:text-slate-100 shadow-2xs hover:bg-[#bce784] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] cursor-pointer"
                    >
                      <Check size={16} />
                    </button>
                  )}

                  <button
                    type="button"
                    title="Delete notification"
                    onClick={() => deleteNotification(notification._id)}
                    className="rounded-full bg-white dark:bg-[#0C120F] p-2 text-[#5C6B66] dark:text-[#94A89D] shadow-2xs hover:bg-red-100 dark:hover:bg-red-950/60 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
