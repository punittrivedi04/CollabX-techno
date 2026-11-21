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
import {
  calculateProjectProgress,
  formatDate,
  getErrorMessage,
  getInitials,
  resolveProjectStatus,
  timeAgo,
} from "../../utils/portalHelpers";
import SearchableSelect from "../../components/portal/SearchableSelect";
import PortalErrorBoundary from "../../components/portal/PortalErrorBoundary";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  ProgressBar,
  SectionCard,
  SuccessAlert,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

function NeutralPill({ label }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200">
      {label}
    </span>
  );
}

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
          (m) =>
            m &&
            m.id != null &&
            String(m.id) !== String(id) &&
            m.is_active !== false,
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

  const mentor =
    data?.mentor && typeof data.mentor === "object" ? data.mentor : null;
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
  const rawStats =
    data?.stats && typeof data.stats === "object" ? data.stats : {};
  const stats = {
    assignedStudentCount:
      rawStats?.assignedStudentCount ?? assignedStudents.length,
    directStudentCount: rawStats?.directStudentCount ?? 0,
    teamCount: rawStats?.teamCount ?? teams.length,
    activeProjectCount:
      rawStats?.activeProjectCount ??
      teams.filter((t) => resolveProjectStatus(t) !== "Completed").length,
    completedProjectCount:
      rawStats?.completedProjectCount ??
      teams.filter((t) => resolveProjectStatus(t) === "Completed").length,
    avgProgress: rawStats?.avgProgress ?? 0,
  };

  const requiresReassignment =
    (Number(stats?.directStudentCount) || 0) > 0 ||
    (Number(stats?.teamCount) || 0) > 0;

  const handleDemote = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const payload = { role: "student" };
      if (requiresReassignment) {
        if (demoteMode === "unassign") {
          payload.unassignMentorship = true;
        } else {
          if (!replacementId) {
            setError(
              "Please select a replacement mentor or choose Unassign & Notify Team.",
            );
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
          <Link
            to="/admin/mentors"
            className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white`}
          >
            <ArrowLeft size={15} strokeWidth={1.85} />
            <span>Back to Mentors</span>
          </Link>
          <button
            type="button"
            onClick={triggerReload}
            className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black`}
          >
            <RefreshCw size={14} strokeWidth={1.85} />
            <span>Retry</span>
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
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/mentors"
          className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
        >
          <ArrowLeft size={15} strokeWidth={1.85} />
          <span>Back to Mentors</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={triggerReload}
            className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
          >
            <RefreshCw size={14} strokeWidth={1.85} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setShowDemote(true)}
            className={`${portalSecondaryBtnClass} rounded-xl border-black/15 bg-white text-neutral-900 hover:border-black/35 hover:bg-neutral-50 dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white dark:hover:!bg-[#141418]`}
          >
            <UserCog size={14} strokeWidth={1.85} />
            <span>Transition Role to Student</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {/* Mentor Summary Card */}
      <div className="rounded-2xl border border-black/12 bg-white p-6 shadow-2xs dark:border-white/12 dark:bg-[#08080A]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border border-black/12 bg-neutral-100 text-base font-extrabold text-neutral-950 dark:border-white/15 dark:bg-[#101014] dark:text-white">
              {getInitials(mentorName)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-neutral-950 dark:text-white">
                  {mentorName}
                </h1>
                <NeutralPill label={mentorActive ? "Active" : "Inactive"} />
              </div>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-neutral-600 dark:text-neutral-400">
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={13} strokeWidth={1.85} />
                  <span>{mentorEmail}</span>
                </span>
                {mentorPhone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={13} strokeWidth={1.85} />
                    <span>{mentorPhone}</span>
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
            <div
              key={label}
              className="rounded-xl border border-black/10 bg-neutral-50 p-3.5 dark:border-white/10 dark:bg-[#101014]"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {label}
              </p>
              <p className="mt-1 text-xl font-extrabold tabular-nums text-neutral-950 dark:text-white">
                {val}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Teams & Projects */}
      <SectionCard
        title="Assigned Teams & Projects"
        subtitle="Click any team to open full Project Details (members, tasks, resources, mentor reassignment)"
        className="dark:!border-white/12 dark:!bg-[#08080A]"
      >
        {teams.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No teams assigned"
            description="Reassign teams to this mentor from Teams & Projects."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {teams.map((t, idx) => {
              const teamId = t?.id ?? t?._id;
              const teamCard = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-neutral-950 dark:text-white">
                        {t?.title || t?.name || "Untitled Project"}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                        <Crown
                          size={12}
                          strokeWidth={1.9}
                          className="shrink-0 text-neutral-500 dark:text-neutral-400"
                        />
                        <span className="truncate">
                          Leader:{" "}
                          {t?.teamLeader?.name ||
                            t?.owner?.name ||
                            "Unassigned"}{" "}
                          · {t?.memberCount ?? 0} member(s)
                        </span>
                      </p>
                    </div>
                    <NeutralPill label={resolveProjectStatus(t)} />
                  </div>
                  <div className="mt-3">
                    <ProgressBar
                      value={calculateProjectProgress(t)}
                      showLabel
                      height="h-1.5"
                    />
                  </div>
                  <p className="mt-2 text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
                    Tasks: {t?.taskProgress?.completed ?? 0}/
                    {t?.taskProgress?.total ?? 0} · Deadline:{" "}
                    {formatDate(t?.deadline)}
                  </p>
                </>
              );

              if (!teamId) {
                return (
                  <div
                    key={`team-${idx}`}
                    className="block rounded-xl border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-[#101014]"
                  >
                    {teamCard}
                  </div>
                );
              }

              return (
                <Link
                  key={teamId}
                  to={`/admin/teams/${teamId}`}
                  className="block rounded-xl border border-black/10 bg-neutral-50 p-4 transition hover:border-black/35 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35"
                >
                  {teamCard}
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Assigned Students */}
      <SectionCard
        title="Assigned Students"
        subtitle="Click any student to open their full profile"
        className="dark:!border-white/12 dark:!bg-[#08080A]"
      >
        {assignedStudents.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No assigned students" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assignedStudents.map((s, idx) => {
              const studentId = s?.id ?? s?._id;
              const studentName = s?.name || "Student";
              const studentEmail = s?.email || "—";
              const studentRoll = s?.roll_no || s?.rollNumber;
              const studentActive = Boolean(
                s?.is_active ?? s?.isActive ?? true,
              );

              const content = (
                <>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-white text-[11px] font-extrabold text-neutral-900 dark:border-white/12 dark:bg-[#08080A] dark:text-white">
                      {getInitials(studentName)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-xs font-bold text-neutral-950 dark:text-white">
                          {studentName}
                        </p>
                        {studentRoll && (
                          <span className="rounded-md border border-black/10 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-700 dark:border-white/12 dark:bg-[#08080A] dark:text-neutral-300">
                            Roll: {studentRoll}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                        {studentEmail}
                        {studentRoll ? ` · ${studentRoll}` : ""}
                      </p>
                    </div>
                  </div>
                  <NeutralPill label={studentActive ? "Active" : "Inactive"} />
                </>
              );

              if (!studentId) {
                return (
                  <div
                    key={`student-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-3.5 dark:border-white/10 dark:bg-[#101014]"
                  >
                    {content}
                  </div>
                );
              }

              return (
                <Link
                  key={studentId}
                  to={`/admin/students/${studentId}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-neutral-50 p-3.5 transition hover:border-black/35 dark:border-white/10 dark:bg-[#101014] dark:hover:border-white/35"
                >
                  {content}
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Recent Activities */}
      <SectionCard
        title="Recent Activities"
        className="dark:!border-white/12 dark:!bg-[#08080A]"
      >
        {recentActivities.length === 0 ? (
          <EmptyState icon={Activity} title="No recent activities" />
        ) : (
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {recentActivities.map((act, idx) => (
              <div
                key={act?.id ?? `act-${idx}`}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-xs font-semibold text-neutral-950 dark:text-white">
                    {act?.description || "Activity recorded"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {act?.action || "ACTIVITY"}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400">
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
            <div className="rounded-xl border border-black/12 bg-neutral-50 p-3.5 text-xs text-neutral-800 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-200">
              <strong>{mentorName}</strong> currently manages{" "}
              <strong>{stats?.teamCount ?? 0} team(s)</strong> and{" "}
              <strong>
                {stats?.directStudentCount ?? 0} directly assigned student(s)
              </strong>
              . Choose whether to transfer them to another active mentor or
              unassign and notify affected students.
            </div>
          ) : (
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {mentorName} has no active team or student assignments and can be
              safely converted to a Student account.
            </p>
          )}

          {requiresReassignment && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDemoteMode("reassign")}
                  className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    demoteMode === "reassign"
                      ? "border-black/25 bg-neutral-950 text-white dark:border-white/25 dark:bg-white dark:text-black"
                      : "border-black/12 bg-neutral-50 text-neutral-700 hover:border-black/30 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-white/30"
                  }`}
                >
                  Reassign Mentor
                </button>
                <button
                  type="button"
                  onClick={() => setDemoteMode("unassign")}
                  className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    demoteMode === "unassign"
                      ? "border-black/25 bg-neutral-950 text-white dark:border-white/25 dark:bg-white dark:text-black"
                      : "border-black/12 bg-neutral-50 text-neutral-700 hover:border-black/30 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-white/30"
                  }`}
                >
                  Unassign &amp; Notify Team
                </button>
              </div>
              {demoteMode === "reassign" && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
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
            <button
              type="button"
              onClick={() => setShowDemote(false)}
              disabled={saving}
              className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
            >
              <span>{saving ? "Transitioning..." : "Confirm Role Change"}</span>
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
        <Link
          to="/admin/mentors"
          className={`${portalSecondaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-[#08080A] dark:!text-white`}
        >
          <ArrowLeft size={14} strokeWidth={1.85} />
          <span>Back to Mentors</span>
        </Link>
      }
    >
      <AdminMentorDetailContent />
    </PortalErrorBoundary>
  );
}