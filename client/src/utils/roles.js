export function isDirectorUser(user) {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase().trim();
  return role === "director";
}

export function getEffectiveRole(user) {
  if (!user) return "";
  const normalized = String(user.role || "student").toLowerCase().trim();
  if (normalized === "director") return "director";
  if (normalized === "coordinator") return "admin";
  if (normalized === "faculty") return "mentor";
  return normalized || "student";
}

export function getHomeRouteForUser(user) {
  const role = getEffectiveRole(user);
  if (role === "admin") return "/admin";
  if (role === "mentor") return "/mentor";
  if (role === "director") return "/director";
  return "/dashboard";
}

export function getRoleDisplayLabel(user) {
  const role = getEffectiveRole(user);
  if (role === "director") return "Executive Director";
  if (role === "admin") return "Administrator";
  if (role === "mentor") return "Faculty Mentor";
  return "Student";
}
