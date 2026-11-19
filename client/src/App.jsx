import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import GuestRoute from "./components/GuestRoute";
import RoleGuard from "./components/RoleGuard";
import { getHomeRouteForUser } from "./utils/roles";

import DashboardLayout from "./layouts/DashboardLayout";

// Auth Pages
import Login from "./pages/Login";
import Register from "./pages/Register";

// Existing Student Portal Pages (Untouched)
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import Tasks from "./pages/Tasks";
import Chat from "./pages/Chat";
import Team from "./pages/Team";
import Activity from "./pages/Activity";
import Notifications from "./pages/Notifications";
import DeveloperAssist from "./pages/DeveloperAssist";
import Profile from "./pages/Profile";
import Leaderboard from "./pages/Leaderboard";

// Admin Portal Pages
import AdminOverview from "./pages/admin/AdminOverview";
import AdminStudents from "./pages/admin/AdminStudents";
import AdminStudentDetail from "./pages/admin/AdminStudentDetail";
import AdminMentors from "./pages/admin/AdminMentors";
import AdminMentorDetail from "./pages/admin/AdminMentorDetail";
import AdminTeams from "./pages/admin/AdminTeams";
import AdminTeamDetail from "./pages/admin/AdminTeamDetail";
import AdminRoles from "./pages/admin/AdminRoles";
import AdminAnnouncements from "./pages/admin/AdminAnnouncements";

// Mentor Portal Pages
import MentorOverview from "./pages/mentor/MentorOverview";
import MentorStudents from "./pages/mentor/MentorStudents";
import MentorStudentDetail from "./pages/mentor/MentorStudentDetail";
import MentorTeams from "./pages/mentor/MentorTeams";
import MentorTeamDetail from "./pages/mentor/MentorTeamDetail";
import MentorTasks from "./pages/mentor/MentorTasks";
import MentorAnnouncements from "./pages/mentor/MentorAnnouncements";

// Director Executive Portal Pages
import DirectorOverview from "./pages/director/DirectorOverview";
import DirectorReports from "./pages/director/DirectorReports";

function RoleHomeRedirect() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        Loading workspace...
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={getHomeRouteForUser(user)} replace />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          {/* Guest pages */}
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          {/* Protected workspace */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              {/* Student Portal (100% intact) */}
              <Route element={<RoleGuard allowedRoles={["student"]} />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/team" element={<Team />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/developer-assist" element={<DeveloperAssist />} />
              </Route>

              {/* Admin Portal */}
              <Route element={<RoleGuard allowedRoles={["admin"]} />}>
                <Route path="/admin" element={<AdminOverview />} />
                <Route path="/admin/students" element={<AdminStudents />} />
                <Route path="/admin/students/:id" element={<AdminStudentDetail />} />
                <Route path="/admin/mentors" element={<AdminMentors />} />
                <Route path="/admin/mentors/:id" element={<AdminMentorDetail />} />
                <Route path="/admin/teams" element={<AdminTeams />} />
                <Route path="/admin/teams/:projectId" element={<AdminTeamDetail />} />
                <Route path="/admin/roles" element={<AdminRoles />} />
                <Route path="/admin/announcements" element={<AdminAnnouncements />} />
              </Route>

              {/* Mentor Portal */}
              <Route element={<RoleGuard allowedRoles={["mentor"]} />}>
                <Route path="/mentor" element={<MentorOverview />} />
                <Route path="/mentor/students" element={<MentorStudents />} />
                <Route path="/mentor/students/:id" element={<MentorStudentDetail />} />
                <Route path="/mentor/teams" element={<MentorTeams />} />
                <Route path="/mentor/teams/:projectId" element={<MentorTeamDetail />} />
                <Route path="/mentor/tasks" element={<MentorTasks />} />
                <Route path="/mentor/announcements" element={<MentorAnnouncements />} />
              </Route>

              {/* Director Executive Portal (Read-Only, Zero Chat) */}
              <Route element={<RoleGuard allowedRoles={["director"]} />}>
                <Route path="/director" element={<DirectorOverview />} />
                <Route path="/director/reports" element={<DirectorReports />} />
              </Route>

              {/* Official Chat (Student, Admin, Mentor ONLY — Director Blocked) */}
              <Route element={<RoleGuard allowedRoles={["student", "admin", "mentor"]} />}>
                <Route path="/chat" element={<Chat />} />
              </Route>

              {/* Shared Authenticated Utility Pages */}
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
          </Route>

          <Route path="/" element={<RoleHomeRedirect />} />
          <Route path="*" element={<RoleHomeRedirect />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
