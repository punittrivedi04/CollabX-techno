import { useCallback, useEffect, useState } from "react";
import { Megaphone, Plus, RefreshCw } from "lucide-react";

import api from "../../services/api";
import { formatDateTime, getErrorMessage } from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  StatusBadge,
  SuccessAlert,
  portalInputClass,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

export default function MentorAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ projectId: "", title: "", content: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [annRes, teamRes] = await Promise.all([
        api.get("/mentor/announcements"),
        api.get("/mentor/teams"),
      ]);
      setAnnouncements(annRes.data?.announcements || []);
      const teamList = teamRes.data?.teams || [];
      setTeams(teamList);
      if (teamList.length > 0) {
        setForm((prev) => (prev.projectId ? prev : { ...prev, projectId: String(teamList[0].id) }));
      }
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load announcements."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/mentor/announcements", {
        projectId: Number(form.projectId),
        title: form.title.trim(),
        content: form.content.trim(),
      });
      setSuccess("Team announcement posted and team members notified.");
      setShowCreate(false);
      setForm({ projectId: form.projectId, title: "", content: "" });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to post team announcement."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
            Mentor · Team Communications
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Team Announcements
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Post targeted announcements to your assigned teams and view institute-wide notices for mentors.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={teams.length === 0}
            onClick={() => setShowCreate(true)}
            className={portalPrimaryBtnClass}
          >
            <Plus size={15} /> Post Team Announcement
          </button>
          <button type="button" onClick={load} disabled={loading} className={portalSecondaryBtnClass}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {loading ? (
        <LoadingState label="Loading announcements..." />
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Post an update to any of your assigned teams."
          action={
            teams.length > 0 && (
              <button type="button" onClick={() => setShowCreate(true)} className={portalPrimaryBtnClass}>
                <Plus size={14} /> Post Announcement
              </button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-extrabold text-[var(--text-primary)]">{a.title}</h2>
                {a.projectTitle ? (
                  <span className="rounded-full bg-[var(--accent-subtle)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent-text)]">
                    Team: {a.projectTitle}
                  </span>
                ) : (
                  <StatusBadge status="Institute Wide" />
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
                {a.content}
              </p>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Posted by {a.createdBy?.name || "Staff"} · {formatDateTime(a.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={() => !saving && setShowCreate(false)}
        title="Post Team-Scoped Announcement"
        description="Delivered only to members of the selected authorized team."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Target Team *
            </label>
            <select
              required
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              className={portalInputClass}
            >
              <option value="">Select team...</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

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
              placeholder="e.g., Sprint Review Meeting Tomorrow"
              className={portalInputClass}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Content *
            </label>
            <textarea
              required
              rows={5}
              minLength={2}
              maxLength={5000}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Share agenda, review checklist, or milestone updates..."
              className={portalInputClass}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className={portalSecondaryBtnClass}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={portalPrimaryBtnClass}>
              {saving ? "Posting..." : "Post Announcement"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
