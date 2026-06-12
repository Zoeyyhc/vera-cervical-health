/**
 * Minimal structural mdast node. We avoid `@types/mdast` / `unist-util-visit`
 * (not resolvable under pnpm strict node_modules) and walk the tree by hand.
 * `Node` from unified is structurally assignable to this, so the plugin still
 * type-checks where react-markdown expects a remark plugin.
 */
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const CITATION_RE = /\[(\d+)\]/g;

// Split a text value into alternating text / citation-link nodes.
function splitCitations(value: string): MdNode[] {
  const out: MdNode[] = [];
  let last = 0;
  CITATION_RE.lastIndex = 0;
  let m: RegExpExecArray | null = CITATION_RE.exec(value);
  while (m !== null) {
    if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
    out.push({
      type: "link",
      url: `#cite-${m[1]}`,
      children: [{ type: "text", value: m[0] }],
    });
    last = m.index + m[0].length;
    m = CITATION_RE.exec(value);
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out.length > 0 ? out : [{ type: "text", value }];
}

// Rebuild a node's children, splitting text nodes and recursing into
// containers. Never descends into `link` nodes (don't rewrite real link
// labels). `inlineCode` / `code` carry their content in `value`, not in a
// `text` child, so code is left untouched automatically.
function transform(node: MdNode): void {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      next.push(...splitCitations(child.value));
    } else {
      if (child.type !== "link") transform(child);
      next.push(child);
    }
  }
  node.children = next;
}

/**
 * Remark plugin: rewrite `[n]` markers in prose into sentinel `#cite-n` link
 * nodes. The fragment href survives rehype-sanitize and is resolved into a
 * CitationMarker by the MarkdownMessage `a`-override.
 */
export function remarkCitations() {
  return (tree: MdNode): void => {
    transform(tree);
  };
}
