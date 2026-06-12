import type { Source } from "@/types/agents";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CitationMarker } from "./citation-marker";

const withUrl: Source[] = [
  { id: "1", title: "Cancer Council", url: "https://example.com/a", chunkId: "c1" },
];
const noUrl: Source[] = [{ id: "1", title: "Internal note", chunkId: "c1" }];

describe("CitationMarker", () => {
  it("renders a new-tab link for a source with a URL", () => {
    render(<CitationMarker n={1} sources={withUrl} messageId="m1" />);
    const link = screen.getByRole("link", { name: "[1]" });
    expect(link).toHaveAttribute("href", "https://example.com/a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link).toHaveAttribute("title", "Cancer Council");
  });

  it("renders plain text (no link/button) for an out-of-range number", () => {
    render(<CitationMarker n={5} sources={withUrl} messageId="m1" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("[5]")).toBeInTheDocument();
  });

  it("renders plain text when sources is undefined", () => {
    render(<CitationMarker n={1} sources={undefined} messageId="m1" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("[1]")).toBeInTheDocument();
  });

  describe("URL-less source", () => {
    beforeEach(() => {
      // jsdom has no scrollIntoView; provide a spy.
      Element.prototype.scrollIntoView = vi.fn();
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("renders a button that scrolls to + highlights the bottom entry on click", () => {
      // Target element the marker should scroll to.
      const target = document.createElement("div");
      target.id = "cite-m1-1";
      document.body.appendChild(target);

      render(<CitationMarker n={1} sources={noUrl} messageId="m1" />);
      const button = screen.getByRole("button", { name: "[1]" });
      fireEvent.click(button);

      expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
      expect(target.classList.contains("cite-highlight")).toBe(true);

      // Highlight clears after the timeout.
      vi.advanceTimersByTime(1600);
      expect(target.classList.contains("cite-highlight")).toBe(false);

      document.body.removeChild(target);
    });
  });
});
