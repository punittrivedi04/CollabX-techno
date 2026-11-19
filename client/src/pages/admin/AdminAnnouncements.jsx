import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Megaphone, Plus, RefreshCw, Search, Trash2 } from "lucide-react";

import api from "../../services/api";
import { formatDateTime, getErrorMessage, timeAgo } from "../../utils/portalHelpers";
import {
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  SectionCard,
  StatusBadge,
  SuccessAlert,
  portalInputClass,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

const EMPTY_ANN = { title: "", content: "", target_role: "all" };

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
      const params = targetFilter !== "all_filter" ? { targetRole: targetFilter } : {};
      const [annRes, ovRes] = await Promise.all([
        api.get("/admin/announcements", { params }),
        api.get("/admin/overview"),
      ]);
      setAnnouncements(annRes.data?.announcements || []);
      setActivities(ovRes.data?.recentActivities || ovRes.data?.data?.recentActivities || []);
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
    if (!deleteTarget) return;
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
        String(a.description || "").toLowerCase().includes(q) ||
        String(a.action || "").toLowerCase().includes(q) ||
        String(a.user?.name || "").toLowerCase().includes(q),
    );
  }, [activities, activitySearch]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
            Administration · Broadcasts &amp; Audit Logs
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Announcements &amp; Activity Logs
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Publish institute-wide notices to students and mentors, and audit platform activity.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={() => setShowCreate(true)} className={portalPrimaryBtnClass}>
            <Plus size={15} /> New Announcement
          </button>
          <button type="button" onClick={load} disabled={loading} className={portalSecondaryBtnClass}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {loading ? (
        <LoadingState label="Loading announcements and activity logs..." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-5">
          <SectionCard
            title={`Announcements (${announcements.length})`}
            subtitle="Institute-wide and team broadcasts"
            className="xl:col-span-3"
            action={
              <select
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value)}
                className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3.5 py-1.5 text-xs font-bold text-[var(--text-primary)] outline-none"
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
                  <button type="button" onClick={() => setShowCreate(true)} className={portalPrimaryBtnClass}>
                    <Plus size={14} /> Publish Notice
                  </button>
                }
              />
            ) : (
              <div className="space-y-3">
                {announcements.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-extrabold text-[var(--text-primary)]">{a.title}</h3>
                          <StatusBadge status={a.targetRole || "all"} />
                          {a.projectTitle && (
                            <span className="rounded-full bg-[var(--accent-subtle)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--accent-text)]">
                              Team: {a.projectTitle}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-secondary)]">
                          {a.content}
                        </p>
                        <p className="mt-2.5 text-[11px] text-[var(--text-muted)]">
                          By {a.createdBy?.name || "Admin"} · {formatDateTime(a.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(a)}
                        title="Delete announcement"
                        className="shrink-0 rounded-xl border border-[var(--border-subtle)] p-2 text-[var(--text-muted)] transition hover:border-rose-500 hover:text-rose-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Institute Activity Logs"
            subtitle="Recent audited actions across CollabX"
            className="xl:col-span-2"
          >
            <div className="relative mb-4">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                placeholder="Filter activity logs..."
                className={`${portalInputClass} pl-9`}
              />
            </div>

            {filteredActivities.length === 0 ? (
              <EmptyState icon={Activity} title="No matching activity logs" />
            ) : (
              <div className="max-h-[540px] divide-y divide-[var(--border-subtle)] overflow-y-auto pr-1 scrollbar-thin">
                {filteredActivities.map((act) => (
                  <div key={act.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{act.description}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
                      <span>
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

      <Modal
        open={showCreate}
        onClose={() => !saving && setShowCreate(false)}
        title="Publish Institute Announcement"
        description="Broadcast an official announcement to everyone, students, or mentors."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Title *
            </label>
            <input
              required
              minLength={2}
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Mid-Term Project Evaluation Schedule"
              className={portalInputClass}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Target Audience
            </label>
            <select
              value={form.target_role}
              onChange={(e) => setForm({ ...form, target_role: e.target.value })}
              className={portalInputClass}
            >
              <option value="all">All Users (Students &amp; Mentors)</option>
              <option value="student">Students Only</option>
              <option value="mentor">Mentors Only</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
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
              className={portalInputClass}
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} disabled={saving} className={portalSecondaryBtnClass}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={portalPrimaryBtnClass}>
              {saving ? "Publishing..." : "Publish Announcement"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        busy={saving}
        tone="danger"
        title="Delete Announcement?"
        confirmLabel="Delete Announcement"
        message={deleteTarget ? `Permanently delete "${deleteTarget.title}"?` : ""}
      />
    </div>
  );
}
