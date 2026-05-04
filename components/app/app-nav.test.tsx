import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppNav } from "./app-nav";

// next/navigation's usePathname is the only piece AppNav reads from the router.
// Mocking the whole module is overkill; replacing usePathname per-test is enough.
const mockPathname = vi.hoisted(() => vi.fn<() => string>());
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  mockPathname.mockReset();
});

describe("AppNav", () => {
  it("renders the logo, all three nav links, and the sign out button", () => {
    mockPathname.mockReturnValue("/chat");
    render(<AppNav />);
    expect(screen.getByRole("link", { name: /^cervix$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^chat$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^clinics$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^learn$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("marks /chat as active when pathname is /chat", () => {
    mockPathname.mockReturnValue("/chat");
    render(<AppNav />);
    const chatLink = screen.getByRole("link", { name: /^chat$/i });
    expect(chatLink).toHaveAttribute("aria-current", "page");
    expect(chatLink.className).toContain("underline");
  });

  it("marks /chat as active for nested routes like /chat/abc-123", () => {
    mockPathname.mockReturnValue("/chat/abc-123");
    render(<AppNav />);
    expect(screen.getByRole("link", { name: /^chat$/i })).toHaveAttribute("aria-current", "page");
  });

  it("marks only the matching link as active when pathname is /clinics", () => {
    mockPathname.mockReturnValue("/clinics");
    render(<AppNav />);
    expect(screen.getByRole("link", { name: /^clinics$/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: /^chat$/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /^learn$/i })).not.toHaveAttribute("aria-current");
  });

  it("hides the link list and sign out button on mobile via Tailwind classes", () => {
    mockPathname.mockReturnValue("/chat");
    const { container } = render(<AppNav />);
    // The link list is the only <ul> in the nav.
    const list = container.querySelector("ul");
    expect(list?.className).toContain("hidden");
    expect(list?.className).toContain("md:flex");
    // The sign out button is wrapped in a div with the same hidden md:inline-flex pattern.
    const signOutWrapper = screen.getByRole("button", { name: /sign out/i }).parentElement;
    expect(signOutWrapper?.className).toContain("hidden");
    expect(signOutWrapper?.className).toContain("md:inline-flex");
  });
});
