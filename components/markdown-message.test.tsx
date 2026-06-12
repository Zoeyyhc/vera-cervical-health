import type { Source } from "@/types/agents";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownMessage } from "./markdown-message";

describe("MarkdownMessage", () => {
  it("renders bold text as <strong>", () => {
    const { container } = render(<MarkdownMessage content="hello **world**" />);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("world");
  });

  it("renders italic text as <em>", () => {
    const { container } = render(<MarkdownMessage content="hello *world*" />);
    const em = container.querySelector("em");
    expect(em?.textContent).toBe("world");
  });

  it("renders headings", () => {
    const { container } = render(<MarkdownMessage content="# Title" />);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toBe("Title");
  });

  it("renders unordered lists", () => {
    const { container } = render(<MarkdownMessage content={"- one\n- two\n- three"} />);
    const items = container.querySelectorAll("ul li");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toBe("one");
    expect(items[2].textContent).toBe("three");
  });

  it("renders ordered lists", () => {
    const { container } = render(<MarkdownMessage content={"1. first\n2. second"} />);
    const items = container.querySelectorAll("ol li");
    expect(items).toHaveLength(2);
  });

  it("renders inline code", () => {
    const { container } = render(<MarkdownMessage content="use `pnpm dev`" />);
    const code = container.querySelector("code");
    expect(code?.textContent).toBe("pnpm dev");
  });

  it("renders fenced code blocks", () => {
    const { container } = render(<MarkdownMessage content={"```\nconst x = 1;\n```"} />);
    const pre = container.querySelector("pre code");
    expect(pre?.textContent).toContain("const x = 1;");
  });

  it("renders blockquotes", () => {
    const { container } = render(<MarkdownMessage content="> quoted" />);
    expect(container.querySelector("blockquote")).not.toBeNull();
  });

  it("renders links with target=_blank and rel=noopener noreferrer", () => {
    render(<MarkdownMessage content="see [docs](https://example.com)" />);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("renders GFM autolinks", () => {
    render(<MarkdownMessage content="visit https://example.com today" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("does not render raw <script> tags", () => {
    // react-markdown + rehype-sanitize must never produce an executable script element.
    // Text inside the tag may remain as plain text — that's harmless.
    const { container } = render(
      <MarkdownMessage content={'safe <script>alert("xss")</script> text'} />
    );
    expect(container.querySelector("script")).toBeNull();
  });

  it("sanitizes raw <iframe> tags", () => {
    const { container } = render(
      <MarkdownMessage content={'<iframe src="https://evil.com"></iframe>'} />
    );
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("renders plain text without crashing", () => {
    render(<MarkdownMessage content="just a normal sentence" />);
    expect(screen.getByText("just a normal sentence")).toBeInTheDocument();
  });

  it("tolerates empty content", () => {
    const { container } = render(<MarkdownMessage content="" />);
    expect(container).toBeInTheDocument();
  });

  it("tolerates partial/streaming markdown (unclosed bold)", () => {
    // Should not throw while a token is mid-stream
    expect(() => render(<MarkdownMessage content="hello **wor" />)).not.toThrow();
  });
});

describe("MarkdownMessage inline citations", () => {
  const sources: Source[] = [
    { id: "1", title: "Cancer Council", url: "https://example.com/a", chunkId: "c1" },
  ];

  it("renders a [1] marker as a clickable chip linking to the source", () => {
    render(
      <MarkdownMessage content="Screening every 5 years [1]." sources={sources} messageId="m1" />
    );
    const link = screen.getByRole("link", { name: "[1]" });
    expect(link).toHaveAttribute("href", "https://example.com/a");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders an unmatched [2] as plain text", () => {
    render(<MarkdownMessage content="A claim [2]." sources={sources} messageId="m1" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/\[2\]/)).toBeInTheDocument();
  });

  it("still renders normal markdown links untouched", () => {
    render(
      <MarkdownMessage content="see [docs](https://example.com)" sources={sources} messageId="m1" />
    );
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });
});
