import { useEffect, useMemo, useState } from "react";
import {
  User,
  Mail,
  Building2,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Save,
  RotateCcw,
  Sparkles,
  FolderKanban,
  CheckSquare,
  Clock3,
  Shield,
  Calendar,
  GraduationCap,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getEffectiveRole } from "../utils/roles";

function getInitials(name = "User") {
  return (name || "User")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function formatDate(dateString) {
  if (!dateString) return "Active Member";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "Active Member";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Active Member";
  }
}

export default function Profile() {
  const { user, updateUser } = useAuth();

  const isStudent = getEffectiveRole(user) === "student";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [institution, setInstitution] = useState(
    "Techno NJR Institute of Technology",
  );

  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [initialData, setInitialData] = useState(null);

  useEffect(() => {
    let active = true;

    const loadProfileData = async () => {
      setLoading(true);
      setError("");

      try {
        const [profileRes, projectRes, taskRes] = await Promise.allSettled([
          api.get("/users/profile"),
          api.get("/projects", { params: { limit: 50 } }),
          api.get("/tasks"),
        ]);

        if (!active) return;

        let profileUser = user || {};
        if (profileRes.status === "fulfilled" && profileRes.value.data) {
          profileUser =
            profileRes.value.data.user ||
            profileRes.value.data.profile ||
            profileUser;
        }

        const loaded = {
          name: profileUser.name || "",
          email: profileUser.email || "",
          rollNo: String(profileUser.roll_no || profileUser.rollNumber || "")
            .replace(/[^a-zA-Z0-9]/g, "")
            .toUpperCase(),
          institution:
            profileUser.institution || "Techno NJR Institute of Technology",
        };

        setName(loaded.name);
        setEmail(loaded.email);
        setRollNo(loaded.rollNo);
        setInstitution(loaded.institution);
        setInitialData(loaded);

        if (projectRes.status === "fulfilled" && projectRes.value.data) {
          setProjects(projectRes.value.data.projects || []);
        }

        if (taskRes.status === "fulfilled" && taskRes.value.data) {
          setTasks(taskRes.value.data.tasks || []);
        }
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              err.message ||
              "Failed to load profile.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProfileData();

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const totalProjects = projects.length;
    const completedProjects = projects.filter((p) => {
      const statusCompleted = ["completed", "done"].includes(String(p?.status || "").toLowerCase());
      const hasTaskData = p.taskProgress?.total !== undefined || p.total_tasks !== undefined || p.totalTasks !== undefined;
      const total = Number(p.taskProgress?.total ?? p.total_tasks ?? p.totalTasks ?? 0);
      const completed = Number(p.taskProgress?.completed ?? p.completed_tasks ?? p.completedTasks ?? 0);
      if (hasTaskData) {
        return statusCompleted && total > 0 && completed === total;
      }
      return statusCompleted && Number(p?.progress || 0) === 100;
    }).length;
    const activeProjects = totalProjects - completedProjects;

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) =>
      ["completed", "done"].includes(String(t?.status || "").toLowerCase()),
    ).length;
    const activeTasks = totalTasks - completedTasks;
    const taskCompletionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      totalProjects,
      completedProjects,
      activeProjects,
      totalTasks,
      completedTasks,
      activeTasks,
      taskCompletionRate,
    };
  }, [projects, tasks]);

  const handleSave = async (e) => {
    e.preventDefault();

    const cleanName = name.trim();
    if (!cleanName) {
      setError("Full Name cannot be empty.");
      return;
    }

    if (cleanName.length < 2 || cleanName.length > 50) {
      setError("Full Name must be between 2 and 50 characters.");
      return;
    }

    const cleanRollNo = rollNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (isStudent && cleanRollNo) {
      if (!/^[A-Z0-9]+$/.test(cleanRollNo)) {
        setError("Roll number must be alphanumeric (uppercase letters and numbers only).");
        return;
      }
      if (cleanRollNo.length > 50) {
        setError("Roll Number cannot exceed 50 characters.");
        return;
      }
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        name: cleanName,
      };

      if (isStudent) {
        payload.roll_no = cleanRollNo || null;
      }

      const response = await api.put("/users/profile", payload);
      const updated = response.data?.user || response.data?.profile;

      if (updated) {
        updateUser(updated);
        const fresh = {
          name: updated.name || cleanName,
          email: updated.email || email,
          rollNo: updated.roll_no || updated.rollNumber || cleanRollNo || "",
          institution: updated.institution || institution,
        };
        setName(fresh.name);
        setEmail(fresh.email);
        setRollNo(fresh.rollNo);
        setInstitution(fresh.institution);
        setInitialData(fresh);
      }

      setSuccess("Your profile details have been saved successfully.");
      setTimeout(() => setSuccess(""), 4500);
      window.dispatchEvent(new CustomEvent("collabx_profile_updated"));
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to update profile. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (initialData) {
      setName(initialData.name);
      setRollNo(initialData.rollNo || "");
      setError("");
      setSuccess("");
    }
  };

  const hasChanges =
    Boolean(initialData) &&
    (name.trim() !== (initialData.name || "").trim() ||
      (isStudent && rollNo.trim() !== (initialData.rollNo || "").trim()));

  const userInitials = getInitials(name || user?.name || "User");

  return (
    <div className="space-y-6 text-[#141A18] dark:text-slate-100">
      {success && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#2E8B63]/30 dark:border-[#22C55E]/40 bg-[#E3F3EB] dark:bg-[#13291E] p-4 text-sm font-semibold text-[#1E6B4B] dark:text-[#6EE7B7]">
          <CheckCircle2 size={18} className="shrink-0 text-[#1E6B4B] dark:text-[#6EE7B7]" />
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess("")} className="text-xs font-bold">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-sm font-medium text-red-600 dark:text-red-400">
          <AlertCircle size={18} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="text-xs font-bold">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[350px] items-center justify-center rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815]">
          <div className="flex items-center gap-3 text-sm font-semibold text-[#5C6B66] dark:text-[#94A89D]">
            <LoaderCircle size={20} className="animate-spin text-[#2E8B63] dark:text-[#4ADE80]" />
            Loading profile information...
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* LEFT 2 COLUMNS */}
          <div className="space-y-6 lg:col-span-2">
            {/* Hero Profile Card */}
            <div className="flex flex-col items-center gap-6 rounded-[28px] border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] p-6 shadow-2xs sm:flex-row sm:p-7">
              <div className="relative shrink-0">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1E2422] dark:bg-[#1D2D24] dark:ring-1 dark:ring-[#A3E635]/35 text-2xl font-extrabold text-white shadow-sm sm:h-24 sm:w-24 sm:text-3xl">
                  {userInitials}
                </div>

                <div
                  title="Verified workspace badge"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#F2F0E9] dark:border-[#111815] bg-[#2E8B63] text-white"
                >
                  <Sparkles size={12} />
                </div>
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <h2 className="truncate text-2xl font-extrabold text-[#141A18] dark:text-slate-100">
                    {name || "Your Name"}
                  </h2>
                  <span className="rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-3 py-0.5 text-xs font-bold text-[#141A18] dark:text-slate-200">
                    {(() => {
                      const raw =
                        String(user?.role || "").toLowerCase().trim() === "director"
                          ? "Director"
                          : String(user?.role || "Member").trim();
                      const roleText =
                        raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
                      return user?.department
                        ? `${user.department} · ${roleText}`
                        : roleText;
                    })()}
                  </span>
                  <span className="rounded-full border border-[#2E8B63]/25 bg-[#E3F3EB] dark:bg-[#13291E] px-3 py-0.5 text-xs font-semibold text-[#1E6B4B] dark:text-[#6EE7B7]">
                    Verified Account
                  </span>
                  {(rollNo || user?.roll_no || user?.rollNumber) && (
                    <span className="rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-3 py-0.5 text-xs font-mono font-bold text-[#141A18] dark:text-slate-200">
                      Roll: {rollNo || user?.roll_no || user?.rollNumber}
                    </span>
                  )}
                </div>

                <p className="mt-1 truncate text-sm font-medium text-[#42504B] dark:text-slate-300">
                  {email}
                </p>

                <p className="mt-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#5C6662] dark:text-[#94A89D] sm:justify-start">
                  <Building2 size={14} className="shrink-0 text-[#2E8B63] dark:text-[#4ADE80]" />
                  <span className="truncate">{institution}</span>
                </p>
              </div>
            </div>

            {/* Edit Form */}
            <form
              onSubmit={handleSave}
              className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs sm:p-8"
            >
              <h3 className="text-base font-extrabold text-[#141A18] dark:text-slate-100">
                Personal Information
              </h3>
              <p className="mt-1 text-xs text-[#5C6B66] dark:text-[#94A89D]">
                {isStudent
                  ? "Update your personal details and academic roll number."
                  : "Update your personal display name."}
              </p>

              <div className="mt-6 space-y-5">
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                    <User size={14} className="text-[#2E8B63] dark:text-[#4ADE80]" />
                    Full Name *
                  </label>

                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={50}
                    required
                    placeholder="Enter your full name"
                    className="w-full rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-medium text-[#141A18] dark:text-slate-100 shadow-2xs outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E] focus:ring-2 focus:ring-[#2E8B63]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                    <Mail size={14} className="text-[#5C6B66] dark:text-[#94A89D]" />
                    Email Address
                  </label>

                  <input
                    type="email"
                    value={email}
                    disabled
                    readOnly
                    className="w-full cursor-not-allowed rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-[#EFF4F0]/80 dark:bg-[#0C120F]/85 px-4 py-3 text-sm font-medium text-[#5C6B66] dark:text-[#94A89D] outline-none"
                  />
                </div>

                {isStudent && (
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                      <GraduationCap size={14} className="text-[#2E8B63] dark:text-[#4ADE80]" />
                      Roll Number
                    </label>

                    <input
                      type="text"
                      value={rollNo}
                      onChange={(e) =>
                        setRollNo(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
                      }
                      maxLength={30}
                      autoCapitalize="characters"
                      placeholder="e.g. 25ETCCS149"
                      className="w-full rounded-2xl border border-[#D5E0D8] dark:border-[#24322B] bg-white dark:bg-[#0C120F] px-4 py-3 text-sm font-mono font-medium text-[#141A18] dark:text-slate-100 shadow-2xs outline-none transition focus:border-[#2E8B63] dark:focus:border-[#22C55E] focus:ring-2 focus:ring-[#2E8B63]/15"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                    <Building2 size={14} className="text-[#5C6B66] dark:text-[#94A89D]" />
                    Institution
                  </label>

                  <input
                    type="text"
                    value={institution}
                    disabled
                    readOnly
                    className="w-full cursor-not-allowed rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-[#EFF4F0]/80 dark:bg-[#0C120F]/85 px-4 py-3 text-sm font-medium text-[#5C6B66] dark:text-[#94A89D] outline-none"
                  />
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-[#E4ECE6] dark:border-[#1F2C26] pt-5">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={!hasChanges || saving}
                  className="inline-flex items-center gap-2 rounded-full border border-[#1E2422]/25 bg-white text-[#141A18] transition-all duration-200 hover:border-[#1E6B4B] hover:bg-[#1E6B4B] hover:text-white dark:border-[#2A3B32] dark:bg-[#121A16] dark:text-slate-200 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-5 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:border-[#D4DFD7] dark:disabled:border-[#1F2C26] disabled:text-[#8E9E97] dark:disabled:text-[#687E73]"
                >
                  <RotateCcw size={15} />
                  Reset
                </button>

                <button
                  type="submit"
                  disabled={saving || !hasChanges}
                  className="inline-flex items-center gap-2 rounded-full group bg-[#141A17] text-white transition-all duration-200 hover:bg-[#1E6B4B] hover:text-white dark:border dark:border-[#2E4237] dark:bg-[#1B2822] dark:text-slate-100 dark:hover:border-[#A3E635] dark:hover:bg-[#A3E635] dark:hover:text-[#090D0B] px-6 py-2.5 text-sm font-bold shadow-xs disabled:cursor-not-allowed disabled:bg-[#DCE5DF] dark:disabled:bg-[#1A2520] disabled:text-[#6B7B75] dark:disabled:text-[#687E73]"
                >
                  {saving ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} className="text-[#bce784] transition-colors duration-200 group-hover:text-white dark:group-hover:text-[#090D0B]" />
                  )}
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            <div className="rounded-[28px] border border-[#D4DFD7] dark:border-[#1F2C26] bg-[#FAFBF9] dark:bg-[#111815] p-6 shadow-2xs">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#141A18] dark:text-slate-100">
                  <FolderKanban size={16} className="text-[#2E8B63] dark:text-[#4ADE80]" />
                  Workspace Overview
                </h3>
                <span className="rounded-full border border-[#D4DFD7] dark:border-[#24322B] bg-[#EFF4F0] dark:bg-[#0C120F] px-2.5 py-0.5 text-[10px] font-bold text-[#42504B] dark:text-slate-300">
                  Live Metrics
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-3.5">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-[#42504B] dark:text-slate-300">
                    <FolderKanban size={15} className="text-[#42504B] dark:text-slate-300" />
                    <span>Total Projects</span>
                  </div>
                  <span className="text-sm font-extrabold text-[#141A18] dark:text-slate-100">
                    {stats.totalProjects}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-3.5">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-[#42504B] dark:text-slate-300">
                    <Clock3 size={15} className="text-[#42504B] dark:text-slate-300" />
                    <span>Active Projects</span>
                  </div>
                  <span className="text-sm font-extrabold text-[#141A18] dark:text-slate-100">
                    {stats.activeProjects}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-3.5">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-[#42504B] dark:text-slate-300">
                    <CheckCircle2 size={15} className="text-[#2E8B63] dark:text-[#4ADE80]" />
                    <span>Completed Projects</span>
                  </div>
                  <span className="text-sm font-extrabold text-[#1E6B4B] dark:text-[#6EE7B7]">
                    {stats.completedProjects}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-[#E4ECE6] dark:border-[#24322B] bg-white dark:bg-[#0C120F] p-3.5">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-[#42504B] dark:text-slate-300">
                    <CheckSquare size={15} className="text-[#42504B] dark:text-slate-300" />
                    <span>Total Tasks</span>
                  </div>
                  <span className="text-sm font-extrabold text-[#141A18] dark:text-slate-100">
                    {stats.totalTasks}
                  </span>
                </div>

                <div className="pt-2">
                  <div className="mb-1.5 flex justify-between text-xs font-bold">
                    <span className="text-[#5C6B66] dark:text-[#94A89D]">Task Completion</span>
                    <span className="text-[#1E6B4B] dark:text-[#6EE7B7]">
                      {stats.taskCompletionRate}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#EFF4F0] dark:bg-[#1A2520]">
                    <div
                      className="h-full rounded-full bg-[#2E8B63] transition-all duration-500"
                      style={{ width: `${stats.taskCompletionRate}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#DDDAD0] dark:border-[#2D362B] bg-[#F2F0E9] dark:bg-[#1B201A] p-6 shadow-2xs">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#141A18] dark:text-slate-100">
                  <Shield size={16} className="text-[#2E8B63] dark:text-[#4ADE80]" />
                  Academic Identification
                </h3>
              </div>

              <div className="space-y-3.5 text-xs">
                <div className="flex items-center justify-between border-b border-[#E2DFD5] dark:border-[#2D362B] pb-2.5">
                  <span className="font-medium text-[#5C6662] dark:text-[#94A89D]">Affiliation</span>
                  <span className="font-bold text-[#141A18] dark:text-slate-100">Techno NJR</span>
                </div>

                <div className="flex items-center justify-between border-b border-[#E2DFD5] dark:border-[#2D362B] pb-2.5">
                  <span className="font-medium text-[#5C6662] dark:text-[#94A89D]">
                    Account Status
                  </span>
                  <span className="rounded-full border border-[#2E8B63]/25 bg-[#E3F3EB] dark:bg-[#13291E] px-2.5 py-0.5 font-semibold text-[#1E6B4B] dark:text-[#6EE7B7]">
                    Active
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-[#E2DFD5] dark:border-[#2D362B] pb-2.5">
                  <span className="font-medium text-[#5C6662] dark:text-[#94A89D]">
                    Member Since
                  </span>
                  <span className="flex items-center gap-1 font-bold text-[#141A18] dark:text-slate-100">
                    <Calendar size={12} />
                    {formatDate(user?.createdAt || user?.created_at)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#5C6662] dark:text-[#94A89D]">
                    Identity Mode
                  </span>
                  <span className="font-bold text-[#141A18] dark:text-slate-100">
                    Automated Monogram
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
