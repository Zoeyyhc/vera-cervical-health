import { describe, expect, it } from "vitest";
import { decideRedirect, isAdminPath, isAuthPage, isProtected } from "./route-rules";

describe("isProtected", () => {
  it.each([
    ["/chat", true],
    ["/chat/thread-1", true],
    ["/clinics", true],
    ["/clinics/123", true],
    ["/learn", true],
    ["/learn/topic", true],
    ["/profile", true],
    ["/admin", true],
    ["/admin/users", true],
    ["/", false],
    ["/login", false],
    ["/about", false],
    ["/chatter", false],
  ])("%s -> %s", (path, expected) => {
    expect(isProtected(path)).toBe(expected);
  });
});

describe("isAuthPage", () => {
  it.each([
    ["/login", true],
    ["/register", true],
    ["/forgot-password", true],
    ["/reset-password", true],
    ["/reset-password/token", true],
    ["/", false],
    ["/chat", false],
    ["/loginish", false],
  ])("%s -> %s", (path, expected) => {
    expect(isAuthPage(path)).toBe(expected);
  });
});

describe("isAdminPath", () => {
  it("matches /admin and /admin/*, not unrelated paths", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/users")).toBe(true);
    expect(isAdminPath("/administration")).toBe(false);
    expect(isAdminPath("/chat")).toBe(false);
  });
});

describe("decideRedirect", () => {
  it("redirects unauthenticated users from protected routes to /login", () => {
    expect(
      decideRedirect({
        pathname: "/chat",
        isAuthenticated: false,
        isAdmin: false,
      })
    ).toEqual({ type: "redirect", to: "/login" });
  });

  it("redirects unauthenticated users from /admin to /login", () => {
    expect(
      decideRedirect({
        pathname: "/admin",
        isAuthenticated: false,
        isAdmin: false,
      })
    ).toEqual({ type: "redirect", to: "/login" });
  });

  it("redirects authenticated users away from auth pages to /chat", () => {
    expect(
      decideRedirect({
        pathname: "/login",
        isAuthenticated: true,
        isAdmin: false,
      })
    ).toEqual({ type: "redirect", to: "/chat" });
  });

  it("redirects non-admin authenticated users from /admin to /chat", () => {
    expect(
      decideRedirect({
        pathname: "/admin/users",
        isAuthenticated: true,
        isAdmin: false,
      })
    ).toEqual({ type: "redirect", to: "/chat" });
  });

  it("allows admin users on /admin routes", () => {
    expect(
      decideRedirect({
        pathname: "/admin/users",
        isAuthenticated: true,
        isAdmin: true,
      })
    ).toEqual({ type: "allow" });
  });

  it("allows authenticated users on non-admin protected routes", () => {
    expect(
      decideRedirect({
        pathname: "/chat",
        isAuthenticated: true,
        isAdmin: false,
      })
    ).toEqual({ type: "allow" });
  });

  it("allows unauthenticated users on public routes", () => {
    expect(
      decideRedirect({
        pathname: "/",
        isAuthenticated: false,
        isAdmin: false,
      })
    ).toEqual({ type: "allow" });
  });

  it("allows authenticated non-admin users on public routes", () => {
    expect(
      decideRedirect({
        pathname: "/about",
        isAuthenticated: true,
        isAdmin: false,
      })
    ).toEqual({ type: "allow" });
  });
});
