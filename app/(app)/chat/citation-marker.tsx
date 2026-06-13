import type { Source } from "@/types/agents";
import { CITATION_CHIP_CLASS } from "./citation-chips";

type Props = {
  /** 1-indexed marker the model emitted. Resolves against `sources[n-1]`. */
  n: number;
  sources: Source[] | null | undefined;
  /** Owning message id — used to build the bottom-list scroll target id. */
  messageId: string;
};

// Inline marker styling: shared chip base, nudged to sit nicely in prose.
const INLINE_CHIP_CLASS = `${CITATION_CHIP_CLASS} mx-0.5 align-baseline no-underline`;

/** Scroll to and briefly highlight a source's entry in the bottom list. */
export function scrollToCitation(messageId: string, n: number): void {
  const el = document.getElementById(`cite-${messageId}-${n}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("cite-highlight");
  setTimeout(() => el.classList.remove("cite-highlight"), 1500);
}

/**
 * Inline citation chip. Resolves `n` against `sources`:
 * - matched + url   → new-tab link to the source
 * - matched, no url → button that scrolls to the bottom-list entry
 * - unmatched       → plain, non-clickable text
 */
export function CitationMarker({ n, sources, messageId }: Props) {
  const label = `[${n}]`;
  const source = sources?.[n - 1];

  if (!source) {
    return <span className={`${INLINE_CHIP_CLASS} text-muted-gray cursor-default`}>{label}</span>;
  }

  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        title={source.title}
        className={INLINE_CHIP_CLASS}
      >
        {label}
      </a>
    );
  }

  return (
    <button
      type="button"
      title={source.title}
      className={INLINE_CHIP_CLASS}
      onClick={() => scrollToCitation(messageId, n)}
    >
      {label}
    </button>
  );
}
