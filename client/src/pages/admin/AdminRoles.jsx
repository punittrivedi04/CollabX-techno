import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserCog,
} from "lucide-react";

import api from "../../services/api";
import {
  formatDateTime,
  getErrorMessage,
  getInitials,
} from "../../utils/portalHelpers";
import SearchableSelect from "../../components/portal/SearchableSelect";
import {
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
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

export default function AdminRoles() {
  const [unclassified, setUnclassified] = useState([]);
  const [students, setStudents] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Unclassified quick confirmation
  const [classifyAction, setClassifyAction] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Promote Student -> Mentor
  const [promoteStudentId, setPromoteStudentId] = useState("");
  const [confirmPromote, setConfirmPromote] = useState(false);

  // Demote Mentor -> Student (with automatic workload reassignment or unassignment)
  const [demoteMentorId, setDemoteMentorId] = useState("");
  const [showDemoteModal, setShowDemoteModal] = useState(false);
  const [demoteMode, setDemoteMode] = useState("reassign");
  const [replacementMentorId, setReplacementMentorId] = useState("");
  const [workloadWarning, setWorkloadWarning] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [unclRes, stuRes, menRes, ovRes] = await Promise.all([
        api.get("/admin/students", {
          params: { status: "unclassified", limit: 100 },
        }),
        api.get("/admin/students", { params: { limit: 100 } }),
        api.get("/admin/mentors"),
        api.get("/admin/overview"),
      ]);
      setUnclassified(
        Array.isArray(unclRes.data?.students) ? unclRes.data.students : [],
      );
      setStudents(
        Array.isArray(stuRes.data?.students) ? stuRes.data.students : [],
      );
      setMentors(
        Array.isArray(menRes.data?.mentors) ? menRes.data.mentors : [],
      );
      const acts =
        ovRes.data?.recentActivities ||
        ovRes.data?.data?.recentActivities ||
        [];
      setAuditLogs(
        Array.isArray(acts)
          ? acts.filter((a) =>
              [
                "USER_APPROVED_AND_CLASSIFIED",
                "USER_ROLE_CHANGED",
                "STUDENT_MENTOR_ASSIGNED",
                "PROJECT_MENTOR_REASSIGNED",
              ].includes(a.action),
            )
          : [],
      );
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load role management data."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedPromoteStudent = useMemo(
    () =>
      students.find((s) => String(s.id) === String(promoteStudentId)) || null,
    [students, promoteStudentId],
  );

  const selectedDemoteMentor = useMemo(
    () => mentors.find((m) => String(m.id) === String(demoteMentorId)) || null,
    [mentors, demoteMentorId],
  );

  const replacementOptions = useMemo(
    () =>
      mentors.filter(
        (m) =>
          m.is_active !== false && String(m.id) !== String(demoteMentorId),
      ),
    [mentors, demoteMentorId],
  );

  const studentSelectOptions = useMemo(
    () =>
      students
        .filter((s) => s.is_active !== false)
        .map((s) => ({
          value: String(s.id),
          label: s.name,
          sublabel: s.email,
          badge:
            s.roll_no || s.rollNumber
              ? `Roll: ${s.roll_no || s.rollNumber}`
              : undefined,
          keywords: `${s.name} ${s.email} ${s.roll_no || s.rollNumber || ""}`,
        })),
    [students],
  );

  const mentorSelectOptions = useMemo(
    () =>
      mentors.map((m) => ({
        value: String(m.id),
        label: m.name,
        sublabel: m.email,
        badge: `${m.teamCount || 0} teams · ${
          m.assignedStudentCount || 0
        } students`,
        keywords: `${m.name} ${m.email}`,
      })),
    [mentors],
  );

  const replacementSelectOptions = useMemo(
    () =>
      replacementOptions.map((m) => ({
        value: String(m.id),
        label: m.name,
        sublabel: m.email,
        badge: `${m.teamCount || 0} teams`,
        keywords: `${m.name} ${m.email}`,
      })),
    [replacementOptions],
  );

  const executeClassify = async () => {
    if (saving || !classifyAction) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch(`/admin/users/${classifyAction.user.id}/role`, {
        role: classifyAction.targetRole,
        approve: true,
      });
      setSuccess(
        `${
          classifyAction.user.name
        } approved, activated, and classified as ${classifyAction.targetRole.toUpperCase()}.`,
      );
      setClassifyAction(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to approve and classify account."));
      setClassifyAction(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (deletingUser || !userToDelete) return;
    setDeletingUser(true);
    setError("");
    setSuccess("");
    try {
      await api.delete(`/admin/users/${userToDelete.id}`);
      setSuccess(`Account for "${userToDelete.name}" deleted cleanly.`);
      setUserToDelete(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete user account."));
    } finally {
      setDeletingUser(false);
    }
  };

  const executePromote = async () => {
    if (saving || !selectedPromoteStudent) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch(`/admin/users/${selectedPromoteStudent.id}/role`, {
        role: "mentor",
      });
      setSuccess(
        `${selectedPromoteStudent.name} promoted from Student to Mentor. Tokens revoked for immediate permission refresh.`,
      );
      setConfirmPromote(false);
      setPromoteStudentId("");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to promote student."));
      setConfirmPromote(false);
    } finally {
      setSaving(false);
    }
  };

  const openDemoteFlow = () => {
    if (!selectedDemoteMentor) return;
    setError("");
    setWorkloadWarning(null);
    setDemoteMode("reassign");
    const hasWorkload =
      (selectedDemoteMentor.directStudentCount || 0) > 0 ||
      (selectedDemoteMentor.teamCount || 0) > 0 ||
      (selectedDemoteMentor.activeProjectCount || 0) > 0;
    if (hasWorkload) {
      setWorkloadWarning({
        assignedStudents: selectedDemoteMentor.directStudentCount || 0,
        activeTeams: selectedDemoteMentor.teamCount || 0,
        activeProjects: selectedDemoteMentor.activeProjectCount || 0,
      });
    }
    setReplacementMentorId(
      replacementOptions[0] ? String(replacementOptions[0].id) : "",
    );
    setShowDemoteModal(true);
  };

  const executeDemote = async (e) => {
    e.preventDefault();
    if (saving || !selectedDemoteMentor) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = { role: "student" };
      if (workloadWarning) {
        if (demoteMode === "unassign") {
          payload.unassignMentorship = true;
        } else {
          if (!replacementMentorId) {
            setError(
              "Please choose a replacement mentor or select Unassign Mentor.",
            );
            setSaving(false);
            return;
          }
          payload.reassignedToMentorId = Number(replacementMentorId);
        }
      }

      await api.patch(`/admin/users/${selectedDemoteMentor.id}/role`, payload);
      setSuccess(
        `${selectedDemoteMentor.name} transitioned from Mentor to Student${
          workloadWarning
            ? demoteMode === "unassign"
              ? " — mentor unassigned and all affected project members notified."
              : " — workload reassigned and all affected project members notified."
            : "."
        }`,
      );
      setShowDemoteModal(false);
      setDemoteMentorId("");
      setWorkloadWarning(null);
      await load();
    } catch (err) {
      if (err?.response?.status === 400 && err?.response?.data?.counts) {
        setWorkloadWarning(err.response.data.counts);
      }
      setError(getErrorMessage(err, "Unable to demote mentor."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Administration · Governance &amp; Classification
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            Role Management &amp; Unclassified Queue
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-sm">
            Classify pending accounts and run transactional Student ↔ Mentor
            transitions. Admin and Director accounts are strictly protected.
          </p>
        </div>

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

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {loading ? (
        <LoadingState label="Loading role classification queue..." />
      ) : (
        <>
          {/* Section 1: Pending Approval & Unclassified Queue */}
          <SectionCard
            title={`Pending Approval & Unclassified Queue (${unclassified.length})`}
            subtitle="Newly registered accounts (role_classified = false) awaiting Admin approval, activation, and role assignment"
            className="dark:!border-white/12 dark:!bg-[#08080A]"
          >
            {unclassified.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No accounts awaiting approval!"
                description="All registered accounts have been approved, activated, and classified."
              />
            ) : (
              <div className="divide-y divide-black/10 dark:divide-white/10">
                {unclassified.slice(0, 25).map((u) => {
                  const roll = u.roll_no || u.rollNumber;
                  return (
                    <div
                      key={u.id}
                      className="flex flex-col justify-between gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/12 bg-neutral-100 text-xs font-extrabold text-neutral-900 dark:border-white/14 dark:bg-[#101014] dark:text-white">
                          {getInitials(u.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-xs font-extrabold text-neutral-950 dark:text-white">
                              {u.name}
                            </p>
                            {roll && (
                              <span className="rounded-md border border-black/10 bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-700 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300">
                                Roll: {roll}
                              </span>
                            )}
                            <NeutralPill
                              label={u.is_active ? "Unclassified" : "Pending"}
                            />
                          </div>
                          <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                            {u.email} {roll ? `· ${roll}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                        <button
                          type="button"
                          onClick={() =>
                            setClassifyAction({ user: u, targetRole: "student" })
                          }
                          className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl border-black/15 bg-neutral-50 text-neutral-900 hover:border-black/35 hover:bg-neutral-100 dark:!border-white/15 dark:!bg-[#101014] dark:!text-white dark:hover:!bg-[#18181E] sm:w-auto`}
                        >
                          <UserCheck size={14} strokeWidth={1.85} />
                          <span>Approve as Student</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setClassifyAction({ user: u, targetRole: "mentor" })
                          }
                          className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
                        >
                          <UserCog size={14} strokeWidth={1.85} />
                          <span>Approve as Mentor</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setUserToDelete(u)}
                          title="Reject & Delete Account"
                          aria-label={`Reject and delete ${u.name}`}
                          className="cursor-pointer rounded-xl border border-black/15 bg-neutral-50 p-2 text-neutral-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-white/15 dark:bg-[#101014] dark:text-neutral-400 dark:hover:border-rose-900/50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                        >
                          <Trash2 size={14} strokeWidth={1.85} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Section 2: Bidirectional Student <-> Mentor Transitions */}
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              title="Promote Student → Mentor"
              subtitle="Grants Mentor portal access, marks classified, and revokes old tokens"
              className="dark:!border-white/12 dark:!bg-[#08080A]"
            >
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                    Select Student Account
                  </label>
                  <SearchableSelect
                    options={studentSelectOptions}
                    value={promoteStudentId}
                    onChange={setPromoteStudentId}
                    placeholder="Search & select a student..."
                    searchPlaceholder="Type student name, email, or roll no..."
                    allowEmpty
                    emptyOptionLabel="Clear selection"
                  />
                </div>

                {selectedPromoteStudent && (
                  <div className="rounded-xl border border-black/10 bg-neutral-50 p-3.5 text-xs dark:border-white/10 dark:bg-[#101014]">
                    <p className="font-bold text-neutral-950 dark:text-white">
                      {selectedPromoteStudent.name}
                    </p>
                    <p className="mt-0.5 break-all text-[11px] text-neutral-500 dark:text-neutral-400">
                      {selectedPromoteStudent.email}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!selectedPromoteStudent || saving}
                  onClick={() => setConfirmPromote(true)}
                  className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
                >
                  <UserCog size={15} strokeWidth={1.85} />
                  <span>Promote to Mentor</span>
                </button>
              </div>
            </SectionCard>

            <SectionCard
              title="Demote Mentor → Student"
              subtitle="Automatically checks active students, teams, and projects before demotion"
              className="dark:!border-white/12 dark:!bg-[#08080A]"
            >
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                    Select Faculty Mentor
                  </label>
                  <SearchableSelect
                    options={mentorSelectOptions}
                    value={demoteMentorId}
                    onChange={setDemoteMentorId}
                    placeholder="Search & select a mentor..."
                    searchPlaceholder="Type mentor name or email..."
                    allowEmpty
                    emptyOptionLabel="Clear selection"
                  />
                </div>

                {selectedDemoteMentor && (
                  <div className="rounded-xl border border-black/10 bg-neutral-50 p-3.5 text-xs dark:border-white/10 dark:bg-[#101014]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-neutral-950 dark:text-white">
                        {selectedDemoteMentor.name}
                      </p>
                      <NeutralPill
                        label={
                          selectedDemoteMentor.is_active
                            ? "Active"
                            : "Inactive"
                        }
                      />
                    </div>
                    <p className="mt-1.5 tabular-nums text-[11px] text-neutral-600 dark:text-neutral-400">
                      Teams:{" "}
                      <strong>{selectedDemoteMentor.teamCount || 0}</strong> ·
                      Active Projects:{" "}
                      <strong>
                        {selectedDemoteMentor.activeProjectCount || 0}
                      </strong>{" "}
                      · Direct Students:{" "}
                      <strong>
                        {selectedDemoteMentor.directStudentCount || 0}
                      </strong>
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!selectedDemoteMentor || saving}
                  onClick={openDemoteFlow}
                  className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl border-black/15 bg-neutral-50 text-neutral-900 hover:border-black/35 hover:bg-neutral-100 dark:!border-white/15 dark:!bg-[#101014] dark:!text-white dark:hover:!bg-[#18181E] sm:w-auto`}
                >
                  <ArrowRightLeft size={15} strokeWidth={1.85} />
                  <span>Review &amp; Transition to Student</span>
                </button>
              </div>
            </SectionCard>
          </div>

          {/* Section 3: Audit Trail */}
          <SectionCard
            title="Role & Assignment Audit Trail"
            subtitle="Immutable log of (admin, targetUser, previousRole, newRole, timestamp)"
            className="dark:!border-white/12 dark:!bg-[#08080A]"
          >
            {auditLogs.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No role transition events yet"
                description="Completed role classifications and transitions will appear here with timestamps."
              />
            ) : (
              <div className="divide-y divide-black/10 dark:divide-white/10">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col justify-between gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-neutral-950 dark:text-white">
                        {log.description}
                      </p>
                      <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                        Action: {log.action}
                        {log.metadata?.previousRole && log.metadata?.newRole
                          ? ` · ${log.metadata.previousRole} → ${log.metadata.newRole}`
                          : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {/* Confirm Approve & Classify Pending Account */}
      <ConfirmDialog
        open={Boolean(classifyAction)}
        onClose={() => setClassifyAction(null)}
        onConfirm={executeClassify}
        busy={saving}
        title={
          classifyAction?.targetRole === "mentor"
            ? "Approve & Classify as Mentor?"
            : "Approve & Classify as Student?"
        }
        confirmLabel={
          classifyAction?.targetRole === "mentor"
            ? "Approve & Activate as Mentor"
            : "Approve & Activate as Student"
        }
        message={
          classifyAction
            ? `Approve ${classifyAction.user.name} (${
                classifyAction.user.email
              }) as ${classifyAction.targetRole.toUpperCase()}? This atomically sets role_classified = TRUE and is_active = TRUE, logs the approval in activities, and notifies the user.`
            : ""
        }
      />

      {/* Confirm Promote Student -> Mentor */}
      <ConfirmDialog
        open={confirmPromote}
        onClose={() => setConfirmPromote(false)}
        onConfirm={executePromote}
        busy={saving}
        title="Confirm Student → Mentor Promotion"
        confirmLabel="Promote to Mentor"
        message={
          selectedPromoteStudent
            ? `Promote ${selectedPromoteStudent.name} (${selectedPromoteStudent.email}) to Faculty Mentor? Active tokens will be revoked so Mentor access applies immediately on login.`
            : ""
        }
      />

      {/* Demote Mentor -> Student Modal with Workload Reassignment */}
      <Modal
        open={showDemoteModal}
        onClose={() => !saving && setShowDemoteModal(false)}
        title="Transition Mentor → Student"
        description="Transactional role downgrade with zero orphaned students or teams."
      >
        <form onSubmit={executeDemote} className="space-y-4">
          {workloadWarning ? (
            <div className="flex items-start gap-3 rounded-xl border border-black/12 bg-neutral-50 p-4 text-xs text-neutral-800 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-200">
              <AlertTriangle
                size={18}
                strokeWidth={1.9}
                className="mt-0.5 shrink-0"
              />
              <div>
                <p className="font-extrabold text-neutral-950 dark:text-white">
                  Active Workload Detected
                </p>
                <p className="mt-1 leading-relaxed text-neutral-600 dark:text-neutral-400">
                  <strong className="text-neutral-950 dark:text-white">
                    {selectedDemoteMentor?.name}
                  </strong>{" "}
                  still has{" "}
                  <strong className="text-neutral-950 dark:text-white">
                    {workloadWarning.assignedStudents} directly assigned
                    student(s)
                  </strong>
                  ,{" "}
                  <strong className="text-neutral-950 dark:text-white">
                    {workloadWarning.activeTeams} team(s)
                  </strong>
                  , and{" "}
                  <strong className="text-neutral-950 dark:text-white">
                    {workloadWarning.activeProjects} active project(s)
                  </strong>
                  . Select a replacement active mentor below to atomically
                  transfer all of them in a single PostgreSQL transaction.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-black/12 bg-neutral-50 p-4 text-xs text-neutral-700 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300">
              <ShieldAlert
                size={18}
                strokeWidth={1.9}
                className="mt-0.5 shrink-0"
              />
              <p>
                <strong className="text-neutral-950 dark:text-white">
                  {selectedDemoteMentor?.name}
                </strong>{" "}
                has no active students or projects assigned. Proceeding will
                convert them to a Student account and revoke their current
                tokens.
              </p>
            </div>
          )}

          {workloadWarning && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDemoteMode("reassign")}
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    demoteMode === "reassign"
                      ? "border-black/25 bg-neutral-950 text-white dark:border-white/25 dark:bg-white dark:text-black"
                      : "border-black/12 bg-neutral-50 text-neutral-700 hover:border-black/30 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-white/30"
                  }`}
                >
                  Reassign to Replacement Mentor
                </button>
                <button
                  type="button"
                  onClick={() => setDemoteMode("unassign")}
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    demoteMode === "unassign"
                      ? "border-black/25 bg-neutral-950 text-white dark:border-white/25 dark:bg-white dark:text-black"
                      : "border-black/12 bg-neutral-50 text-neutral-700 hover:border-black/30 dark:border-white/12 dark:bg-[#101014] dark:text-neutral-300 dark:hover:border-white/30"
                  }`}
                >
                  Unassign &amp; Notify Students
                </button>
              </div>

              {demoteMode === "reassign" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                    Reassign Students &amp; Teams To *
                  </label>
                  <SearchableSelect
                    options={replacementSelectOptions}
                    value={replacementMentorId}
                    onChange={setReplacementMentorId}
                    placeholder="Search & select replacement mentor..."
                    searchPlaceholder="Type mentor name or email..."
                  />
                </div>
              ) : (
                <p className="rounded-xl border border-black/10 bg-neutral-50 p-3 text-xs text-neutral-600 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-400">
                  All assigned teams and students will be unassigned from{" "}
                  <strong className="text-neutral-950 dark:text-white">
                    {selectedDemoteMentor?.name}
                  </strong>{" "}
                  and automatically notified that their project mentor has been
                  removed.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowDemoteModal(false)}
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
              <span>
                {saving ? "Executing Transaction..." : "Confirm Demotion"}
              </span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete User Confirmation */}
      <ConfirmDialog
        open={Boolean(userToDelete)}
        onClose={() => !deletingUser && setUserToDelete(null)}
        onConfirm={handleDeleteUser}
        busy={deletingUser}
        tone="danger"
        title="Delete User Account Permanently"
        confirmLabel="Delete Account"
        message={
          userToDelete
            ? `Are you sure you want to permanently delete the account for "${userToDelete.name}" (${userToDelete.email})? This action cannot be undone.`
            : ""
        }
      />
    </div>
  );
}