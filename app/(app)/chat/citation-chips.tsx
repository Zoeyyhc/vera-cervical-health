import type { Source } from "@/types/agents";

// Shared base style for citation chips (inline markers + bottom list).
export const CITATION_CHIP_CLASS =
  "border-border text-charcoal hover:bg-white/40 inline-flex items-center rounded-full border bg-white/20 px-2 py-0.5 text-xs leading-tight transition-colors";

type Props = {
  sources: Source[] | null | undefined;
  /** When set, each chip gets id `cite-${messageId}-${n}` as a scroll target. */
  messageId?: string;
  /**
   * Assistant message text. When provided and it contains inline `[n]`
   * markers, the list is filtered to only the cited sources (numbering
   * preserved). When it contains no markers — older messages, or a reply the
   * model didn't cite — all sources are shown as a fallback.
   */
  content?: string;
};

const MARKER_RE = /\[(\d+)\]/g;

/** Distinct 1-indexed citation numbers referenced in `content`. */
export function parseCitedMarkers(content: string): Set<number> {
  const out = new Set<number>();
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null = MARKER_RE.exec(content);
  while (m !== null) {
    out.add(Number(m[1]));
    m = MARKER_RE.exec(content);
  }
  return out;
}

/**
 * Renumber the inline `[n]` markers in `content` to a contiguous 1..N sequence
 * by order of first appearance, and return the cited sources reordered to match
 * the new numbering. The model cites markers by retrieval rank, so a reply can
 * reference [1][2][5] (chunks 3–4 retrieved but unused), which reads as gappy.
 *
 * Markers are renumbered in first-appearance order, so the mapping is a stable
 * prefix as content streams in — an early marker never changes number when a
 * later one arrives. Out-of-range markers (> sources.length) are left untouched
 * and excluded from the result. When there are no sources or no valid citations,
 * the inputs are returned unchanged.
 *
 * Apply once upstream and pass the result to BOTH the inline renderer and the
 * footer chips so their numbering stays aligned.
 */
export function remapCitations<T extends Source[] | null | undefined>(
  content: string,
  sources: T
): { content: string; sources: T } {
  if (!sources || sources.length === 0) return { content, sources };

  const remap = new Map<number, number>();
  const order: number[] = [];
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null = MARKER_RE.exec(content);
  while (m !== null) {
    const orig = Number(m[1]);
    if (orig >= 1 && orig <= sources.length && !remap.has(orig)) {
      order.push(orig);
      remap.set(orig, order.length);
    }
    m = MARKER_RE.exec(content);
  }
  if (order.length === 0) return { content, sources };

  const newContent = content.replace(MARKER_RE, (full, d: string) => {
    const mapped = remap.get(Number(d));
    return mapped ? `[${mapped}]` : full;
  });
  const newSources = order.map((orig) => sources[orig - 1]) as unknown as T;
  return { content: newContent, sources: newSources };
}

/**
 * Renders 1-indexed numbered chips for each source under an assistant
 * message bubble. Sources with a URL render as `<a>` opening in a new tab;
 * those without render as a non-clickable `<span>`. When `content` cites a
 * subset of sources inline, only those are shown. Returns null when there
 * are no sources to render.
 */
export function CitationChips({ sources, messageId, content }: Props) {
  if (!sources || sources.length === 0) return null;

  // Filter to cited sources only when the content actually cites some;
  // otherwise show everything (back-compat / uncited replies).
  const cited = content ? parseCitedMarkers(content) : null;
  const visible = cited && cited.size > 0 ? sources.filter((_s, i) => cited.has(i + 1)) : sources;
  if (visible.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visible.map((s) => {
        const number = sources.indexOf(s) + 1;
        const label = `[${number}]`;
        const id = messageId ? `cite-${messageId}-${number}` : undefined;
        if (s.url) {
          return (
            <a
              key={s.id}
              id={id}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.title}
              className={CITATION_CHIP_CLASS}
            >
              {label}
            </a>
          );
        }
        return (
          <span
            key={s.id}
            id={id}
            title={s.title}
            className={`${CITATION_CHIP_CLASS} text-muted-gray cursor-default`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
