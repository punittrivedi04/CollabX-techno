import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  UserCog,
} from "lucide-react";

import api from "../../services/api";
import { formatDateTime, getErrorMessage, getInitials } from "../../utils/portalHelpers";
import SearchableSelect from "../../components/portal/SearchableSelect";
import {
  ConfirmDialog,
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  SectionCard,
  StatusBadge,
  SuccessAlert,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

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
  const [classifyAction, setClassifyAction] = useState(null); // { user, targetRole }

  // Promote Student -> Mentor
  const [promoteStudentId, setPromoteStudentId] = useState("");
  const [confirmPromote, setConfirmPromote] = useState(false);

  // Demote Mentor -> Student (with automatic workload reassignment or unassignment)
  const [demoteMentorId, setDemoteMentorId] = useState("");
  const [showDemoteModal, setShowDemoteModal] = useState(false);
  const [demoteMode, setDemoteMode] = useState("reassign"); // "reassign" | "unassign"
  const [replacementMentorId, setReplacementMentorId] = useState("");
  const [workloadWarning, setWorkloadWarning] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [unclRes, stuRes, menRes, ovRes] = await Promise.all([
        api.get("/admin/students", { params: { status: "unclassified", limit: 100 } }),
        api.get("/admin/students", { params: { limit: 200 } }),
        api.get("/admin/mentors"),
        api.get("/admin/overview"),
      ]);
      setUnclassified(unclRes.data?.students || []);
      setStudents(stuRes.data?.students || []);
      setMentors(menRes.data?.mentors || []);
      const acts = ovRes.data?.recentActivities || ovRes.data?.data?.recentActivities || [];
      setAuditLogs(
        acts.filter((a) =>
          [
            "USER_APPROVED_AND_CLASSIFIED",
            "USER_ROLE_CHANGED",
            "STUDENT_MENTOR_ASSIGNED",
            "PROJECT_MENTOR_REASSIGNED",
          ].includes(a.action),
        ),
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
    () => students.find((s) => String(s.id) === String(promoteStudentId)) || null,
    [students, promoteStudentId],
  );

  const selectedDemoteMentor = useMemo(
    () => mentors.find((m) => String(m.id) === String(demoteMentorId)) || null,
    [mentors, demoteMentorId],
  );

  const replacementOptions = useMemo(
    () =>
      mentors.filter(
        (m) => m.is_active !== false && String(m.id) !== String(demoteMentorId),
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
          badge: (s.roll_no || s.rollNumber) ? `Roll: ${s.roll_no || s.rollNumber}` : undefined,
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
        badge: `${m.teamCount || 0} teams · ${m.assignedStudentCount || 0} students`,
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
    if (!classifyAction) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch(`/admin/users/${classifyAction.user.id}/role`, {
        role: classifyAction.targetRole,
        approve: true,
      });
      setSuccess(
        `${classifyAction.user.name} approved, activated, and classified as ${classifyAction.targetRole.toUpperCase()}.`,
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

  const executePromote = async () => {
    if (!selectedPromoteStudent) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch(`/admin/users/${selectedPromoteStudent.id}/role`, { role: "mentor" });
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
    setReplacementMentorId(replacementOptions[0] ? String(replacementOptions[0].id) : "");
    setShowDemoteModal(true);
  };

  const executeDemote = async (e) => {
    e.preventDefault();
    if (!selectedDemoteMentor) return;
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
            setError("Please choose a replacement mentor or select Unassign Mentor.");
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
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
            Administration · Governance &amp; Classification
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Role Management &amp; Unclassified Queue
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Classify pending accounts and run transactional Student ↔ Mentor transitions. Admin and Director accounts are strictly protected.
          </p>
        </div>

        <button type="button" onClick={load} disabled={loading} className={portalSecondaryBtnClass}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError("")} />
      <SuccessAlert message={success} onDismiss={() => setSuccess("")} />

      {loading ? (
        <LoadingState label="Loading role classification queue..." />
      ) : (
        <>
          {/* Section 1: Pending Approval & Unclassified Accounts Queue */}
          <SectionCard
            title={`Pending Approval & Unclassified Queue (${unclassified.length})`}
            subtitle="Newly registered accounts (role_classified = false) awaiting Admin approval, activation, and role assignment"
          >
            {unclassified.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No accounts awaiting approval!"
                description="All registered accounts have been approved, activated, and classified."
              />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {unclassified.slice(0, 25).map((u) => (
                  <div
                    key={u.id}
                    className="flex flex-col justify-between gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                        {getInitials(u.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-xs font-extrabold text-[var(--text-primary)]">{u.name}</p>
                          {(u.roll_no || u.rollNumber) && (
                            <span className="rounded-full bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--text-secondary)]">
                              Roll: {u.roll_no || u.rollNumber}
                            </span>
                          )}
                          <StatusBadge status={u.is_active ? "Unclassified" : "Pending"} />
                        </div>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">
                          {u.email} {(u.roll_no || u.rollNumber) ? `· ${u.roll_no || u.rollNumber}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setClassifyAction({ user: u, targetRole: "student" })}
                        className={portalSecondaryBtnClass}
                      >
                        <UserCheck size={14} /> Approve as Student
                      </button>
                      <button
                        type="button"
                        onClick={() => setClassifyAction({ user: u, targetRole: "mentor" })}
                        className={portalPrimaryBtnClass}
                      >
                        <UserCog size={14} /> Approve as Mentor
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Section 2: Bidirectional Student <-> Mentor Transitions */}
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              title="Promote Student → Mentor"
              subtitle="Grants Mentor portal access, marks classified, and revokes old tokens"
            >
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
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
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 text-xs">
                    <p className="font-bold text-[var(--text-primary)]">{selectedPromoteStudent.name}</p>
                    <p className="mt-0.5 text-[var(--text-muted)]">{selectedPromoteStudent.email}</p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!selectedPromoteStudent || saving}
                  onClick={() => setConfirmPromote(true)}
                  className={portalPrimaryBtnClass}
                >
                  <UserCog size={15} />
                  <span>Promote to Mentor</span>
                </button>
              </div>
            </SectionCard>

            <SectionCard
              title="Demote Mentor → Student"
              subtitle="Automatically checks active students, teams, and projects before demotion"
            >
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
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
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-[var(--text-primary)]">{selectedDemoteMentor.name}</p>
                      <StatusBadge status={selectedDemoteMentor.is_active ? "Active" : "Inactive"} />
                    </div>
                    <p className="mt-1 text-[var(--text-muted)]">
                      Teams: <strong>{selectedDemoteMentor.teamCount || 0}</strong> · Active Projects:{" "}
                      <strong>{selectedDemoteMentor.activeProjectCount || 0}</strong> · Direct Students:{" "}
                      <strong>{selectedDemoteMentor.directStudentCount || 0}</strong>
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!selectedDemoteMentor || saving}
                  onClick={openDemoteFlow}
                  className={portalSecondaryBtnClass}
                >
                  <ArrowRightLeft size={15} />
                  <span>Review &amp; Transition to Student</span>
                </button>
              </div>
            </SectionCard>
          </div>

          {/* Section 3: Audit Trail */}
          <SectionCard
            title="Role & Assignment Audit Trail"
            subtitle="Immutable log of (admin, targetUser, previousRole, newRole, timestamp)"
          >
            {auditLogs.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No role transition events yet"
                description="Completed role classifications and transitions will appear here with timestamps."
              />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">{log.description}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        Action: {log.action}
                        {log.metadata?.previousRole && log.metadata?.newRole
                          ? ` · ${log.metadata.previousRole} → ${log.metadata.newRole}`
                          : ""}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">
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
          classifyAction?.targetRole === "mentor" ? "Approve & Activate as Mentor" : "Approve & Activate as Student"
        }
        message={
          classifyAction
            ? `Approve ${classifyAction.user.name} (${classifyAction.user.email}) as ${classifyAction.targetRole.toUpperCase()}? This atomically sets role_classified = TRUE and is_active = TRUE, logs the approval in activities, and notifies the user.`
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
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/12 p-4 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-extrabold">Active Workload Detected</p>
                <p className="mt-1 leading-relaxed">
                  <strong>{selectedDemoteMentor?.name}</strong> still has{" "}
                  <strong>{workloadWarning.assignedStudents} directly assigned student(s)</strong>,{" "}
                  <strong>{workloadWarning.activeTeams} team(s)</strong>, and{" "}
                  <strong>{workloadWarning.activeProjects} active project(s)</strong>. Select a replacement active mentor below to atomically transfer all of them in a single PostgreSQL transaction.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-800 dark:text-emerald-300">
              <ShieldAlert size={18} className="mt-0.5 shrink-0" />
              <p>
                <strong>{selectedDemoteMentor?.name}</strong> has no active students or projects assigned. Proceeding will convert them to a Student account and revoke their current tokens.
              </p>
            </div>
          )}

          {workloadWarning && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDemoteMode("reassign")}
                  className={`rounded-2xl border px-3 py-2.5 text-xs font-bold transition cursor-pointer ${
                    demoteMode === "reassign"
                      ? "border-[#15803D] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                      : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                  }`}
                >
                  Reassign to Replacement Mentor
                </button>
                <button
                  type="button"
                  onClick={() => setDemoteMode("unassign")}
                  className={`rounded-2xl border px-3 py-2.5 text-xs font-bold transition cursor-pointer ${
                    demoteMode === "unassign"
                      ? "border-amber-500 bg-amber-500/12 text-amber-700 dark:text-amber-300"
                      : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                  }`}
                >
                  Unassign &amp; Notify Students
                </button>
              </div>

              {demoteMode === "reassign" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
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
                <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 text-xs text-[var(--text-secondary)]">
                  All assigned teams and students will be unassigned from <strong>{selectedDemoteMentor?.name}</strong> and automatically notified that their project mentor has been removed.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button type="button" onClick={() => setShowDemoteModal(false)} disabled={saving} className={portalSecondaryBtnClass}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={portalPrimaryBtnClass}>
              {saving ? "Executing Transaction..." : "Confirm Demotion"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
