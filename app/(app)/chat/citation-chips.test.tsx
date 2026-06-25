import type { Source } from "@/types/agents";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CitationChips, parseCitedMarkers, remapCitations } from "./citation-chips";

const fiveSources: Source[] = [
  { id: "1", title: "Source A", url: "https://a.com", chunkId: "c1" },
  { id: "2", title: "Source B", url: "https://b.com", chunkId: "c2" },
  { id: "3", title: "Source C", url: "https://c.com", chunkId: "c3" },
  { id: "4", title: "Source D", url: "https://d.com", chunkId: "c4" },
  { id: "5", title: "Source E", url: "https://e.com", chunkId: "c5" },
];

describe("CitationChips", () => {
  it("renders nothing for an empty array", () => {
    const { container } = render(<CitationChips sources={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for null", () => {
    const { container } = render(<CitationChips sources={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for undefined", () => {
    const { container } = render(<CitationChips sources={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one numbered chip with a link for a single source with a URL", () => {
    const sources: Source[] = [
      { id: "1", title: "Cancer Council", url: "https://example.com/source", chunkId: "c1" },
    ];
    render(<CitationChips sources={sources} />);
    const link = screen.getByRole("link", { name: /\[1\]/ });
    expect(link).toHaveAttribute("href", "https://example.com/source");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("title", "Cancer Council");
  });

  it("renders multiple chips with sequential numbers", () => {
    const sources: Source[] = [
      { id: "a", title: "Source A", url: "https://a.com", chunkId: "c1" },
      { id: "b", title: "Source B", url: "https://b.com", chunkId: "c2" },
      { id: "c", title: "Source C", url: "https://c.com", chunkId: "c3" },
    ];
    render(<CitationChips sources={sources} />);
    expect(screen.getByRole("link", { name: /\[1\]/ })).toHaveAttribute("title", "Source A");
    expect(screen.getByRole("link", { name: /\[2\]/ })).toHaveAttribute("title", "Source B");
    expect(screen.getByRole("link", { name: /\[3\]/ })).toHaveAttribute("title", "Source C");
  });

  it("renders a non-clickable span when the URL is missing", () => {
    const sources: Source[] = [{ id: "1", title: "No URL Source", chunkId: "c1" }];
    render(<CitationChips sources={sources} />);
    // No link
    expect(screen.queryByRole("link")).toBeNull();
    // But the chip still appears with the marker
    expect(screen.getByText(/\[1\]/)).toBeInTheDocument();
  });

  it("sets a stable scroll-target id on each chip when messageId is given", () => {
    const sources: Source[] = [
      { id: "1", title: "Source A", url: "https://a.com", chunkId: "c1" },
      { id: "2", title: "Source B", chunkId: "c2" },
    ];
    const { container } = render(<CitationChips sources={sources} messageId="m1" />);
    expect(container.querySelector("#cite-m1-1")).not.toBeNull();
    expect(container.querySelector("#cite-m1-2")).not.toBeNull();
  });

  it("omits ids when messageId is absent", () => {
    const sources: Source[] = [{ id: "1", title: "Source A", url: "https://a.com", chunkId: "c1" }];
    const { container } = render(<CitationChips sources={sources} />);
    expect(container.querySelector("[id^='cite-']")).toBeNull();
  });

  describe("content filtering", () => {
    it("renders only the sources actually cited in the content", () => {
      render(<CitationChips sources={fiveSources} content="A claim [1][2]. Another [1]." />);
      expect(screen.getByRole("link", { name: "[1]" })).toHaveAttribute("title", "Source A");
      expect(screen.getByRole("link", { name: "[2]" })).toHaveAttribute("title", "Source B");
      expect(screen.queryByRole("link", { name: "[3]" })).toBeNull();
      expect(screen.queryByRole("link", { name: "[4]" })).toBeNull();
      expect(screen.queryByRole("link", { name: "[5]" })).toBeNull();
    });

    it("keeps numbering aligned with the source index (no renumber)", () => {
      // Only [2] is cited → the single chip shown is [2], mapping to Source B.
      render(<CitationChips sources={fiveSources} content="Only this one [2]." />);
      const link = screen.getByRole("link", { name: "[2]" });
      expect(link).toHaveAttribute("href", "https://b.com");
      expect(screen.queryByRole("link", { name: "[1]" })).toBeNull();
    });

    it("falls back to showing all sources when content has no markers", () => {
      render(<CitationChips sources={fiveSources} content="No markers at all here." />);
      expect(screen.getAllByRole("link")).toHaveLength(5);
    });

    it("shows all sources when content prop is absent (back-compat)", () => {
      render(<CitationChips sources={fiveSources} />);
      expect(screen.getAllByRole("link")).toHaveLength(5);
    });
  });

  describe("remapCitations", () => {
    it("renumbers a non-contiguous citation set to a contiguous one", () => {
      const out = remapCitations("X [1] Y [2] Z [5].", fiveSources);
      expect(out.content).toBe("X [1] Y [2] Z [3].");
      expect(out.sources?.map((s) => s.id)).toEqual(["1", "2", "5"]);
    });

    it("numbers by first appearance, not by original value", () => {
      const out = remapCitations("First [5] then [2] then [1].", fiveSources);
      expect(out.content).toBe("First [1] then [2] then [3].");
      expect(out.sources?.map((s) => s.id)).toEqual(["5", "2", "1"]);
    });

    it("keeps repeated markers pointing at the same renumbered source", () => {
      const out = remapCitations("A [5][2]. More [5].", fiveSources);
      expect(out.content).toBe("A [1][2]. More [1].");
      expect(out.sources?.map((s) => s.id)).toEqual(["5", "2"]);
    });

    it("leaves out-of-range markers untouched and excludes them from sources", () => {
      const out = remapCitations("Valid [2] and bogus [9].", fiveSources);
      expect(out.content).toBe("Valid [1] and bogus [9].");
      expect(out.sources?.map((s) => s.id)).toEqual(["2"]);
    });

    it("returns content and sources unchanged when nothing is cited", () => {
      const out = remapCitations("No markers here.", fiveSources);
      expect(out.content).toBe("No markers here.");
      expect(out.sources).toBe(fiveSources);
    });

    it("passes through null/undefined sources untouched", () => {
      expect(remapCitations("text [1]", null)).toEqual({ content: "text [1]", sources: null });
      expect(remapCitations("text [1]", undefined)).toEqual({
        content: "text [1]",
        sources: undefined,
      });
    });

    it("renumbers stably as content streams in (prefix is a stable prefix)", () => {
      // First appearance order is fixed as tokens arrive, so an early marker
      // keeps its number when later markers stream in — no flicker.
      const partial = remapCitations("Heat [1]. Sweats [5].", fiveSources);
      const full = remapCitations("Heat [1]. Sweats [5]. Dryness [2].", fiveSources);
      expect(partial.content).toBe("Heat [1]. Sweats [2].");
      expect(full.content).toBe("Heat [1]. Sweats [2]. Dryness [3].");
    });
  });

  describe("parseCitedMarkers", () => {
    it("extracts the distinct numbers cited in the text", () => {
      expect(parseCitedMarkers("a [1] b [2][1] c [3]")).toEqual(new Set([1, 2, 3]));
    });

    it("returns an empty set when nothing is cited", () => {
      expect(parseCitedMarkers("plain text")).toEqual(new Set());
    });
  });
});
