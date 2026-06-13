import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { remarkCitations } from "./remark-citations";

// Parse markdown → mdast, run the plugin, return the root node for inspection.
function parse(md: string) {
  const tree = unified().use(remarkParse).parse(md);
  remarkCitations()(tree as never);
  return tree as unknown as {
    type: string;
    children?: unknown[];
  };
}

// Collect every node of a given type, depth-first.
function collect(
  node: { type: string; url?: string; value?: string; children?: unknown[] },
  type: string
) {
  const out: Array<{ type: string; url?: string; value?: string; children?: unknown[] }> = [];
  const walk = (n: { type: string; url?: string; value?: string; children?: unknown[] }) => {
    if (n.type === type) out.push(n);
    if (Array.isArray(n.children)) {
      for (const c of n.children) walk(c as typeof n);
    }
  };
  walk(node as never);
  return out;
}

describe("remarkCitations", () => {
  it("rewrites a single [1] into a #cite-1 link", () => {
    const tree = parse("Screening every 5 years [1].");
    const links = collect(tree as never, "link");
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("#cite-1");
  });

  it("rewrites consecutive [1][2] into two links", () => {
    const tree = parse("A claim [1][2] here.");
    const links = collect(tree as never, "link");
    expect(links.map((l) => l.url)).toEqual(["#cite-1", "#cite-2"]);
  });

  it("preserves the literal [n] text inside the link", () => {
    const tree = parse("x [3] y");
    const links = collect(tree as never, "link") as Array<{
      children: Array<{ value: string }>;
    }>;
    expect(links[0].children[0].value).toBe("[3]");
  });

  it("does not rewrite [1] inside inline code", () => {
    const tree = parse("use `arr[1]` please");
    expect(collect(tree as never, "link")).toHaveLength(0);
  });

  it("does not rewrite [1] inside a fenced code block", () => {
    const tree = parse("```\nconst x = arr[1];\n```");
    expect(collect(tree as never, "link")).toHaveLength(0);
  });

  it("does not rewrite the label of a real markdown link", () => {
    // The label text "see [1]" must stay literal text inside the existing link.
    const tree = parse("[see [1]](https://example.com)");
    const links = collect(tree as never, "link");
    // Exactly one link — the real one — and its url is unchanged.
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://example.com");
  });

  it("ignores non-numeric brackets like [note]", () => {
    const tree = parse("a footnote [note] here");
    expect(collect(tree as never, "link")).toHaveLength(0);
  });
});
