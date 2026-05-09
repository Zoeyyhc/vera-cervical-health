// /learn is intentionally public per CLAUDE.md ("Guest UX ... public learn pages").
export const PROTECTED_PATHS = ["/chat", "/clinics", "/profile", "/admin"] as const;

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

  // /reset-password is exempt: the recovery flow lands here WITH an active
  // session (callback just exchanged the code), and the page needs that
  // session to call updateUser. Bouncing to /chat would break the flow.
  if (isAuthenticated && isAuthPage(pathname) && !matchesAny(pathname, ["/reset-password"])) {
    return { type: "redirect", to: "/chat" };
  }

  if (isAuthenticated && isAdminPath(pathname) && !isAdmin) {
    return { type: "redirect", to: "/chat" };
  }

  return { type: "allow" };
}
