import type { Source } from "@/types/agents";

// Shared base style for citation chips (inline markers + bottom list).
export const CITATION_CHIP_CLASS =
  "border-border text-charcoal hover:bg-white/40 inline-flex items-center rounded-full border bg-white/20 px-2 py-0.5 text-xs leading-tight transition-colors";

type Props = {
  sources: Source[] | null | undefined;
  /** When set, each chip gets id `cite-${messageId}-${n}` as a scroll target. */
  messageId?: string;
};

/**
 * Renders 1-indexed numbered chips for each source under an assistant
 * message bubble. Sources with a URL render as `<a>` opening in a new tab;
 * those without render as a non-clickable `<span>`. Returns null when there
 * are no sources to render.
 */
export function CitationChips({ sources, messageId }: Props) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s, i) => {
        const number = i + 1;
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
