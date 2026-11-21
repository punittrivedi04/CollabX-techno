import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import api from "../../services/api";
import {
  formatDateTime,
  getErrorMessage,
  timeAgo,
} from "../../utils/portalHelpers";
import {
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  SectionCard,
  SuccessAlert,
  portalInputClass,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

const EMPTY_ANN = { title: "", content: "", target_role: "all" };

function NeutralPill({ label }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200">
      {label}
    </span>
  );
}

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [activities, setActivities] = useState([]);
  const [targetFilter, setTargetFilter] = useState("all_filter");
  const [activitySearch, setActivitySearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_ANN);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params =
        targetFilter !== "all_filter" ? { targetRole: targetFilter } : {};
      const [annRes, ovRes] = await Promise.all([
        api.get("/admin/announcements", { params }),
        api.get("/admin/overview"),
      ]);
      setAnnouncements(
        Array.isArray(annRes.data?.announcements)
          ? annRes.data.announcements
          : [],
      );
      const acts =
        ovRes.data?.recentActivities ||
        ovRes.data?.data?.recentActivities ||
        [];
      setActivities(Array.isArray(acts) ? acts : []);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load announcements and logs."));
    } finally {
      setLoading(false);
    }
  }, [targetFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/admin/announcements", {
        title: form.title.trim(),
        content: form.content.trim(),
        target_role: form.target_role,
      });
      setSuccess("Institute announcement published.");
      setShowCreate(false);
      setForm(EMPTY_ANN);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to publish announcement."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (saving || !deleteTarget) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.delete(`/admin/announcements/${deleteTarget.id}`);
      setSuccess("Announcement deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete announcement."));
    } finally {
      setSaving(false);
    }
  };

  const filteredActivities = useMemo(() => {
    const q = activitySearch.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter(
      (a) =>
        String(a.description || "")
          .toLowerCase()
          .includes(q) ||
        String(a.action || "")
          .toLowerCase()
          .includes(q) ||
        String(a.user?.name || "")
          .toLowerCase()
          .includes(q),
    );
  }, [activities, activitySearch]);

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Administration · Broadcasts &amp; Audit Logs
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            Announcements &amp; Activity Logs
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-sm">
            Publish institute-wide notices to students and mentors, and audit
            platform activity.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
          >
            <Plus size={15} strokeWidth={1.85} />
            <span>New Announcement</span>
          </button>
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
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {loading ? (
        <LoadingState label="Loading announcements and activity logs..." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-5">
          {/* Announcements Column */}
          <SectionCard
            title={`Announcements (${announcements.length})`}
            subtitle="Institute-wide and team broadcasts"
            className="xl:col-span-3 dark:!border-white/12 dark:!bg-[#08080A]"
            action={
              <select
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value)}
                className="rounded-xl border border-black/12 bg-neutral-50 px-3 py-1.5 text-xs font-bold text-neutral-900 outline-none transition hover:border-black/30 dark:border-white/12 dark:bg-[#101014] dark:text-white dark:hover:border-white/30"
              >
                <option value="all_filter">All Audiences</option>
                <option value="all">Everyone (all)</option>
                <option value="student">Students</option>
                <option value="mentor">Mentors</option>
              </select>
            }
          >
            {announcements.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="No announcements published yet"
                description="Create an institute-wide notice for students, mentors, or everyone."
                action={
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
                  >
                    <Plus size={14} strokeWidth={1.85} />
                    <span>Publish Notice</span>
                  </button>
                }
              />
            ) : (
              <div className="space-y-3">
                {announcements.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-black/10 bg-neutral-50 p-4 transition hover:border-black/25 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/25"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-extrabold text-neutral-950 dark:text-white">
                            {a.title}
                          </h3>
                          <NeutralPill label={a.targetRole || "all"} />
                          {a.projectTitle && (
                            <NeutralPill label={`Team: ${a.projectTitle}`} />
                          )}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                          {a.content}
                        </p>
                        <p className="mt-2.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                          By {a.createdBy?.name || "Admin"} ·{" "}
                          {formatDateTime(a.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(a)}
                        title="Delete announcement"
                        aria-label={`Delete ${a.title}`}
                        className="shrink-0 cursor-pointer rounded-xl border border-black/12 bg-white p-2 text-neutral-600 transition hover:border-black/35 hover:text-neutral-950 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-400 dark:hover:border-white/35 dark:hover:text-white"
                      >
                        <Trash2 size={14} strokeWidth={1.85} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Activity Logs Column */}
          <SectionCard
            title="Institute Activity Logs"
            subtitle="Recent audited actions across CollabX"
            className="xl:col-span-2 dark:!border-white/12 dark:!bg-[#08080A]"
          >
            <div className="relative mb-4">
              <Search
                size={15}
                strokeWidth={1.85}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
              />
              <input
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                placeholder="Filter activity logs..."
                className={`${portalInputClass} rounded-xl pl-9 pr-9 dark:!border-white/12 dark:!bg-[#101014] dark:!text-white dark:placeholder:!text-neutral-500`}
              />
              {activitySearch && (
                <button
                  type="button"
                  onClick={() => setActivitySearch("")}
                  aria-label="Clear filter"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              )}
            </div>

            {filteredActivities.length === 0 ? (
              <EmptyState icon={Activity} title="No matching activity logs" />
            ) : (
              <div className="max-h-[540px] divide-y divide-black/10 overflow-y-auto pr-1 scrollbar-thin dark:divide-white/10">
                {filteredActivities.map((act) => (
                  <div key={act.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-xs font-semibold text-neutral-950 dark:text-white">
                      {act.description}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                      <span className="truncate">
                        {act.user?.name || "System"} · {act.action}
                      </span>
                      <span className="shrink-0">{timeAgo(act.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* Create Announcement Modal */}
      <Modal
        open={showCreate}
        onClose={() => !saving && setShowCreate(false)}
        title="Publish Institute Announcement"
        description="Broadcast an official announcement to everyone, students, or mentors."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Title *
            </label>
            <input
              required
              minLength={2}
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Mid-Term Project Evaluation Schedule"
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Target Audience
            </label>
            <select
              value={form.target_role}
              onChange={(e) =>
                setForm({ ...form, target_role: e.target.value })
              }
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            >
              <option value="all">All Users (Students &amp; Mentors)</option>
              <option value="student">Students Only</option>
              <option value="mentor">Mentors Only</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Message Content *
            </label>
            <textarea
              required
              rows={5}
              minLength={2}
              maxLength={5000}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Write the announcement details, dates, and guidelines..."
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>

          <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              disabled={saving}
              className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white sm:w-auto`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
            >
              <span>{saving ? "Publishing..." : "Publish Announcement"}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        busy={saving}
        tone="danger"
        title="Delete Announcement?"
        confirmLabel="Delete Announcement"
        message={
          deleteTarget ? `Permanently delete "${deleteTarget.title}"?` : ""
        }
      />
    </div>
  );
}