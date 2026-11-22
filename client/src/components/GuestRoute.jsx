import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getHomeRouteForUser } from "../utils/roles";

export default function GuestRoute() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        Checking your session...
      </div>
    );
  }

  return isAuthenticated ? (
    <Navigate to={getHomeRouteForUser(user)} replace />
  ) : (
    <Outlet />
  );
}
