import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getEffectiveRole, getHomeRouteForUser } from "../utils/roles";

export default function RoleGuard({ allowedRoles = [] }) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm font-medium text-[var(--text-muted)]">
        Verifying workspace permissions...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const effectiveRole = getEffectiveRole(user);
  if (allowedRoles.length > 0 && !allowedRoles.includes(effectiveRole)) {
    return <Navigate to={getHomeRouteForUser(user)} replace />;
  }

  return <Outlet />;
}
