import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Crown,
  FolderKanban,
  GraduationCap,
  Mail,
  Phone,
  RefreshCw,
  UserCog,
} from "lucide-react";

import api from "../../services/api";
import { calculateProjectProgress, formatDate, getErrorMessage, getInitials, resolveProjectStatus, timeAgo } from "../../utils/portalHelpers";
import SearchableSelect from "../../components/portal/SearchableSelect";
import PortalErrorBoundary from "../../components/portal/PortalErrorBoundary";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  ProgressBar,
  SectionCard,
  StatusBadge,
  SuccessAlert,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

function AdminMentorDetailContent() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [otherMentors, setOtherMentors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showDemote, setShowDemote] = useState(false);
  const [demoteMode, setDemoteMode] = useState("reassign");
  const [replacementId, setReplacementId] = useState("");
  const [saving, setSaving] = useState(false);

  const [reloadTick, setReloadTick] = useState(0);
  const triggerReload = useCallback(() => setReloadTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    const fetchMentorDetail = async () => {
      if (!id) {
        if (!cancelled) {
          setData(null);
          setError("Invalid mentor ID.");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError("");
      try {
        const [detailRes, listRes] = await Promise.all([
          api.get(`/admin/mentors/${id}`),
          api.get("/admin/mentors").catch(() => ({ data: { mentors: [] } })),
        ]);
        if (cancelled) return;

        const rawPayload = detailRes?.data?.data ?? detailRes?.data ?? null;
        const normalizedPayload =
          rawPayload && typeof rawPayload === "object" ? rawPayload : null;
        setData(normalizedPayload);

        const mentorListRaw = Array.isArray(listRes?.data?.mentors)
          ? listRes.data.mentors
          : Array.isArray(listRes?.data?.data)
            ? listRes.data.data
            : [];
        const others = mentorListRaw.filter(
          (m) => m && m.id != null && String(m.id) !== String(id) && m.is_active !== false,
        );
        setOtherMentors(others);
        setReplacementId(others.length > 0 ? String(others[0].id) : "");
      } catch (err) {
        if (cancelled) return;
        setData(null);
        setError(getErrorMessage(err, "Unable to load mentor profile."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMentorDetail();
    return () => {
      cancelled = true;
    };
  }, [id, reloadTick]);

  const mentor = data?.mentor && typeof data.mentor === "object" ? data.mentor : null;
  const teams = Array.isArray(data?.teams)
    ? data.teams.filter(Boolean)
    : Array.isArray(data?.projects)
      ? data.projects.filter(Boolean)
      : [];
  const assignedStudents = Array.isArray(data?.assignedStudents)
    ? data.assignedStudents.filter(Boolean)
    : Array.isArray(data?.students)
      ? data.students.filter(Boolean)
      : [];
  const recentActivities = Array.isArray(data?.recentActivities)
    ? data.recentActivities.filter(Boolean)
    : [];
  const rawStats = data?.stats && typeof data.stats === "object" ? data.stats : {};
  const stats = {
    assignedStudentCount: rawStats?.assignedStudentCount ?? assignedStudents.length,
    directStudentCount: rawStats?.directStudentCount ?? 0,
    teamCount: rawStats?.teamCount ?? teams.length,
    activeProjectCount:
      rawStats?.activeProjectCount ?? teams.filter((t) => resolveProjectStatus(t) !== "Completed").length,
    completedProjectCount:
      rawStats?.completedProjectCount ?? teams.filter((t) => resolveProjectStatus(t) === "Completed").length,
    avgProgress: rawStats?.avgProgress ?? 0,
  };

  const requiresReassignment =
    (Number(stats?.directStudentCount) || 0) > 0 || (Number(stats?.teamCount) || 0) > 0;

  const handleDemote = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { role: "student" };
      if (requiresReassignment) {
        if (demoteMode === "unassign") {
          payload.unassignMentorship = true;
        } else {
          if (!replacementId) {
            setError("Please select a replacement mentor or choose Unassign & Notify Team.");
            setSaving(false);
            return;
          }
          payload.reassignedToMentorId = Number(replacementId);
        }
      }
      await api.patch(`/admin/users/${id}/role`, payload);
      setSuccess("Mentor role transitioned to Student cleanly.");
      setShowDemote(false);
      navigate(`/admin/students/${id}`, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to transition mentor role."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading mentor details..." />;

  if (!mentor) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={error || "Mentor profile not found."} />
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/admin/mentors" className={portalSecondaryBtnClass}>
            <ArrowLeft size={15} /> Back to Mentors
          </Link>
          <button type="button" onClick={triggerReload} className={portalPrimaryBtnClass}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const mentorName = mentor?.name || "Faculty Mentor";
  const mentorEmail = mentor?.email || "—";
  const mentorPhone = mentor?.phone || "";
  const mentorActive = Boolean(mentor?.is_active ?? mentor?.isActive ?? true);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/mentors" className={portalSecondaryBtnClass}>
          <ArrowLeft size={15} /> Back to Mentors
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={triggerReload} className={portalSecondaryBtnClass}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button type="button" onClick={() => setShowDemote(true)} className={portalSecondaryBtnClass}>
            <UserCog size={14} /> Transition Role to Student
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#141A17] text-lg font-extrabold text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]">
              {getInitials(mentorName)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold text-[var(--text-primary)]">{mentorName}</h1>
                <StatusBadge status={mentorActive ? "Active" : "Inactive"} />
              </div>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={13} /> {mentorEmail}
                </span>
                {mentorPhone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={13} /> {mentorPhone}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          {[
            ["Assigned Students", stats?.assignedStudentCount ?? 0],
            ["Teams", stats?.teamCount ?? 0],
            ["Active Projects", stats?.activeProjectCount ?? 0],
            ["Completed", stats?.completedProjectCount ?? 0],
            ["Avg Progress", `${stats?.avgProgress ?? 0}%`],
          ].map(([label, val]) => (
            <div key={label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5">
              <p className="text-[11px] font-bold uppercase text-[var(--text-muted)]">{label}</p>
              <p className="mt-1 text-xl font-extrabold text-[var(--text-primary)]">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Teams & Projects */}
      <SectionCard
        title="Assigned Teams & Projects"
        subtitle="Click any team to open full Project Details (members, tasks, resources, mentor reassignment)"
      >
        {teams.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No teams assigned" description="Reassign teams to this mentor from Teams & Projects." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {teams.map((t, idx) => {
              const teamId = t?.id ?? t?._id;
              const teamCard = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">
                        {t?.title || t?.name || "Untitled Project"}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                        <Crown size={12} className="text-amber-500" />
                        Leader: {t?.teamLeader?.name || t?.owner?.name || "Unassigned"} · {t?.memberCount ?? 0} member(s)
                      </p>
                    </div>
                    <StatusBadge status={resolveProjectStatus(t)} />
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={calculateProjectProgress(t)} showLabel height="h-2" />
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                    Tasks: {t?.taskProgress?.completed ?? 0}/{t?.taskProgress?.total ?? 0} · Deadline: {formatDate(t?.deadline)}
                  </p>
                </>
              );

              if (!teamId) {
                return (
                  <div
                    key={`team-${idx}`}
                    className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4"
                  >
                    {teamCard}
                  </div>
                );
              }

              return (
                <Link
                  key={teamId}
                  to={`/admin/teams/${teamId}`}
                  className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 transition hover:border-[#15803D]/55"
                >
                  {teamCard}
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Assigned Students (clickable to student profile) */}
      <SectionCard title="Assigned Students" subtitle="Click any student to open their full profile">
        {assignedStudents.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No assigned students" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assignedStudents.map((s, idx) => {
              const studentId = s?.id ?? s?._id;
              const studentName = s?.name || "Student";
              const studentEmail = s?.email || "—";
              const studentActive = Boolean(s?.is_active ?? s?.isActive ?? true);
              const content = (
                <>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#141A17] text-[11px] font-bold text-[#BEF264] dark:bg-[#A3E635] dark:text-[#090D0B]">
                      {getInitials(studentName)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-xs font-bold text-[var(--text-primary)]">{studentName}</p>
                        {(s?.roll_no || s?.rollNumber) && (
                          <span className="rounded-full bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--text-secondary)]">
                            Roll: {s.roll_no || s.rollNumber}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-[var(--text-muted)]">
                        {studentEmail}
                        {(s?.roll_no || s?.rollNumber) ? ` · ${s.roll_no || s.rollNumber}` : ""}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={studentActive ? "Active" : "Inactive"} />
                </>
              );

              if (!studentId) {
                return (
                  <div
                    key={`student-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5"
                  >
                    {content}
                  </div>
                );
              }

              return (
                <Link
                  key={studentId}
                  to={`/admin/students/${studentId}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 transition hover:border-[#15803D]/50"
                >
                  {content}
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Recent Activities */}
      <SectionCard title="Recent Activities">
        {recentActivities.length === 0 ? (
          <EmptyState icon={Activity} title="No recent activities" />
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {recentActivities.map((act, idx) => (
              <div key={act?.id ?? `act-${idx}`} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    {act?.description || "Activity recorded"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{act?.action || "ACTIVITY"}</p>
                </div>
                <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                  {timeAgo(act?.createdAt || act?.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Safe Demotion Modal */}
      <Modal
        open={showDemote}
        onClose={() => !saving && setShowDemote(false)}
        title="Transition Mentor to Student"
        description="Safe transactional role change with automatic workload protection."
      >
        <form onSubmit={handleDemote} className="space-y-4">
          {requiresReassignment ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300">
              <strong>{mentorName}</strong> currently manages{" "}
              <strong>{stats?.teamCount ?? 0} team(s)</strong> and{" "}
              <strong>{stats?.directStudentCount ?? 0} directly assigned student(s)</strong>. Choose whether to transfer them to another active mentor or unassign and notify affected students.
            </div>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">
              {mentorName} has no active team or student assignments and can be safely converted to a Student account.
            </p>
          )}

          {requiresReassignment && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDemoteMode("reassign")}
                  className={`rounded-2xl border px-3 py-2 text-xs font-bold transition cursor-pointer ${
                    demoteMode === "reassign"
                      ? "border-[#15803D] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                      : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                  }`}
                >
                  Reassign Mentor
                </button>
                <button
                  type="button"
                  onClick={() => setDemoteMode("unassign")}
                  className={`rounded-2xl border px-3 py-2 text-xs font-bold transition cursor-pointer ${
                    demoteMode === "unassign"
                      ? "border-amber-500 bg-amber-500/12 text-amber-700 dark:text-amber-300"
                      : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                  }`}
                >
                  Unassign &amp; Notify Team
                </button>
              </div>
              {demoteMode === "reassign" && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Replacement Active Mentor *
                  </label>
                  <SearchableSelect
                    options={otherMentors.map((m) => ({
                      value: String(m?.id ?? ""),
                      label: m?.name || "Mentor",
                      sublabel: m?.email || "",
                    }))}
                    value={replacementId}
                    onChange={setReplacementId}
                    placeholder="Search & select replacement mentor..."
                    searchPlaceholder="Type mentor name or email..."
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowDemote(false)} disabled={saving} className={portalSecondaryBtnClass}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={portalPrimaryBtnClass}>
              {saving ? "Transitioning..." : "Confirm Role Change"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function AdminMentorDetail() {
  const { id } = useParams();
  return (
    <PortalErrorBoundary
      key={id || "mentor-detail"}
      title="Mentor profile could not be rendered"
      fallbackAction={
        <Link to="/admin/mentors" className={portalSecondaryBtnClass}>
          <ArrowLeft size={14} /> Back to Mentors
        </Link>
      }
    >
      <AdminMentorDetailContent />
    </PortalErrorBoundary>
  );
}
