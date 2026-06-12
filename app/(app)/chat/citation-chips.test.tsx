import type { Source } from "@/types/agents";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CitationChips } from "./citation-chips";

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
});
