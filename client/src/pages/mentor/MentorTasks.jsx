import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ListTodo, Plus, RefreshCw } from "lucide-react";

import api from "../../services/api";
import {
  formatDate,
  getErrorMessage,
  getTodayInputDate,
} from "../../utils/portalHelpers";
import {
  EmptyState,
  ErrorAlert,
  LoadingState,
  Modal,
  SuccessAlert,
  portalInputClass,
  portalPrimaryBtnClass,
  portalSecondaryBtnClass,
} from "../../components/portal/PortalUI";

const EMPTY_TASK = {
  projectId: "",
  title: "",
  description: "",
  assignedTo: "",
  priority: "Medium",
  dueDate: "",
};

function NeutralBadge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-black/12 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-800 dark:border-white/14 dark:bg-[#08080A] dark:text-neutral-200 ${className}`}
    >
      {children}
    </span>
  );
}

export default function MentorTasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [teams, setTeams] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamFilter, setTeamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showAssign, setShowAssign] = useState(false);
  const [form, setForm] = useState(EMPTY_TASK);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const teamsRes = await api.get("/mentor/teams");
      const teamList = Array.isArray(teamsRes.data?.teams)
        ? teamsRes.data.teams
        : [];
      setTeams(teamList);

      const detailResults = await Promise.all(
        teamList.map((t) =>
          api
            .get(`/mentor/teams/${t.id}`)
            .then((r) => ({
              team: t,
              tasks: Array.isArray(r.data?.tasks || r.data?.data?.tasks)
                ? r.data?.tasks || r.data?.data?.tasks
                : [],
            }))
            .catch(() => ({ team: t, tasks: [] })),
        ),
      );

      const mergedTasks = detailResults
        .flatMap(({ team, tasks: list }) =>
          list.map((task) => ({
            ...task,
            projectId: task.projectId || team.id,
            projectTitle: task.project?.title || team.title,
          })),
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime(),
        );

      setTasks(mergedTasks);
      if (teamList.length > 0) {
        setForm((prev) =>
          prev.projectId ? prev : { ...prev, projectId: String(teamList[0].id) },
        );
      }
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load mentor tasks."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("action") === "assign") {
      setShowAssign(true);
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const selectedTeamMembers = useMemo(() => {
    const team = teams.find((t) => String(t.id) === String(form.projectId));
    if (!team) return [];
    return [
      ...(team.teamLeader ? [{ ...team.teamLeader, isLeader: true }] : []),
      ...(Array.isArray(team.members) ? team.members : []).map((m) => ({
        ...m,
        isLeader: false,
      })),
    ];
  }, [teams, form.projectId]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (teamFilter !== "all" && String(t.projectId) !== String(teamFilter))
        return false;
      if (
        statusFilter !== "all" &&
        String(t.status).toLowerCase() !== statusFilter.toLowerCase()
      )
        return false;
      return true;
    });
  }, [tasks, teamFilter, statusFilter]);

  const handleAssign = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/mentor/tasks", {
        projectId: Number(form.projectId),
        title: form.title.trim(),
        description: form.description.trim(),
        assignedTo: form.assignedTo ? Number(form.assignedTo) : null,
        priority: form.priority,
        dueDate: form.dueDate || null,
      });
      setSuccess(`Assigned task "${form.title.trim()}" successfully.`);
      setShowAssign(false);
      setForm({ ...EMPTY_TASK, projectId: form.projectId });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to assign task."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-neutral-950 dark:text-white">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Mentor · Deliverables
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
            Tasks
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-sm">
            View all tasks across your authorized teams.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            disabled={teams.length === 0}
            onClick={() => setShowAssign(true)}
            className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
          >
            <Plus size={15} strokeWidth={2} />
            <span>Assign Task</span>
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

      <div className="grid gap-3 rounded-2xl border border-black/12 bg-white p-4 shadow-2xs dark:border-white/12 dark:bg-[#08080A] sm:grid-cols-2">
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
        >
          <option value="all">All Authorized Teams ({teams.length})</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
        >
          <option value="all">All Task Statuses</option>
          <option value="Todo">Todo</option>
          <option value="In Progress">In Progress</option>
          <option value="In Review">In Review</option>
          <option value="Completed">Completed</option>
        </select>
      </div>

      {loading ? (
        <LoadingState label="Loading tasks across your teams..." />
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-2xl border border-black/12 bg-white p-6 dark:border-white/12 dark:bg-[#08080A]">
          <EmptyState
            icon={ListTodo}
            title="No tasks match these filters"
            description="Assign a new task to any of your mentored teams to get started."
            action={
              teams.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAssign(true)}
                  className={`${portalPrimaryBtnClass} rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200`}
                >
                  <Plus size={14} strokeWidth={2} />
                  <span>Assign Task</span>
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-black/12 bg-white shadow-2xs dark:border-white/12 dark:bg-[#08080A]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] text-left text-xs">
              <thead className="border-b border-black/10 bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:border-white/10 dark:bg-[#101014] dark:text-neutral-400">
                <tr>
                  <th className="px-5 py-3.5">Task</th>
                  <th className="px-4 py-3.5">Team</th>
                  <th className="px-4 py-3.5">Assigned Student</th>
                  <th className="px-4 py-3.5">Priority / Status</th>
                  <th className="px-4 py-3.5">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {filteredTasks.map((t) => (
                  <tr
                    key={t.id}
                    className="transition hover:bg-neutral-50 dark:hover:bg-[#101014]"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-neutral-950 dark:text-white">
                        {t.title}
                      </p>
                      {t.description && (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                          {t.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        to={`/mentor/teams/${t.projectId}`}
                        className="font-semibold text-neutral-900 hover:underline dark:text-neutral-200"
                      >
                        {t.projectTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-neutral-700 dark:text-neutral-300">
                      {t.assignedTo?.name || "Unassigned"}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {t.priority && <NeutralBadge>{t.priority}</NeutralBadge>}
                        {t.status && <NeutralBadge>{t.status}</NeutralBadge>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-neutral-500 dark:text-neutral-400">
                      {formatDate(t.dueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={showAssign}
        onClose={() => !saving && setShowAssign(false)}
        title="Create & Assign Task"
        description="Assign a deliverable to a student within one of your authorized teams."
      >
        <form onSubmit={handleAssign} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Team / Project *
            </label>
            <select
              required
              value={form.projectId}
              onChange={(e) =>
                setForm({
                  ...form,
                  projectId: e.target.value,
                  assignedTo: "",
                })
              }
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
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
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Task Title *
            </label>
            <input
              required
              maxLength={150}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Implement API integration tests"
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white dark:placeholder:!text-neutral-500`}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Description
            </label>
            <textarea
              rows={3}
              maxLength={2000}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Deliverable details and expectations..."
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white dark:placeholder:!text-neutral-500`}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                Assigned Student
              </label>
              <select
                value={form.assignedTo}
                onChange={(e) =>
                  setForm({ ...form, assignedTo: e.target.value })
                }
                className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
              >
                <option value="">Unassigned</option>
                {selectedTeamMembers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isLeader ? "(Leader)" : ""}
                    {s.roll_no || s.rollNumber
                      ? ` · Roll: ${s.roll_no || s.rollNumber}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Due Date
            </label>
            <input
              type="date"
              min={getTodayInputDate()}
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={`${portalInputClass} rounded-xl dark:!border-white/12 dark:!bg-[#101014] dark:!text-white`}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowAssign(false)}
              className={`${portalSecondaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-[#101014] dark:!text-white sm:w-auto`}
            >
              <span>Cancel</span>
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${portalPrimaryBtnClass} w-full justify-center rounded-xl dark:!border-white/15 dark:!bg-white dark:!text-black dark:hover:!bg-neutral-200 sm:w-auto`}
            >
              <span>{saving ? "Assigning..." : "Create & Assign"}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}