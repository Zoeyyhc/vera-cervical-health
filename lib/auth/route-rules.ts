export const PROTECTED_PATHS = ["/chat", "/clinics", "/learn", "/profile", "/admin"] as const;

export const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"] as const;

export const ADMIN_PATHS = ["/admin"] as const;

function matchesAny(pathname: string, paths: readonly string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isProtected(pathname: string): boolean {
  return matchesAny(pathname, PROTECTED_PATHS);
}

export function isAuthPage(pathname: string): boolean {
  return matchesAny(pathname, AUTH_PATHS);
}

export function isAdminPath(pathname: string): boolean {
  return matchesAny(pathname, ADMIN_PATHS);
}

export type RedirectDecision = { type: "redirect"; to: string } | { type: "allow" };

export function decideRedirect(params: {
  pathname: string;
  isAuthenticated: boolean;
  isAdmin: boolean;
}): RedirectDecision {
  const { pathname, isAuthenticated, isAdmin } = params;

  if (!isAuthenticated && isProtected(pathname)) {
    return { type: "redirect", to: "/login" };
  }

  if (isAuthenticated && isAuthPage(pathname)) {
    return { type: "redirect", to: "/chat" };
  }

  if (isAuthenticated && isAdminPath(pathname) && !isAdmin) {
    return { type: "redirect", to: "/chat" };
  }

  return { type: "allow" };
}
