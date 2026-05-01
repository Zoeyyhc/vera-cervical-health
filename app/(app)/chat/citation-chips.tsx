import type { Source } from "@/types/agents";

type Props = {
  sources: Source[] | null | undefined;
};

/**
 * Renders 1-indexed numbered chips for each source under an assistant
 * message bubble. Sources with a URL render as `<a>` opening in a new tab;
 * those without render as a non-clickable `<span>`. Returns null when there
 * are no sources to render.
 */
export function CitationChips({ sources }: Props) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s, i) => {
        const number = i + 1;
        const label = `[${number}]`;
        if (s.url) {
          return (
            <a
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.title}
              className="border-border text-charcoal hover:bg-white/40 inline-flex items-center rounded-full border bg-white/20 px-2 py-0.5 text-xs leading-tight transition-colors"
            >
              {label}
            </a>
          );
        }
        return (
          <span
            key={s.id}
            title={s.title}
            className="border-border text-muted-gray inline-flex cursor-default items-center rounded-full border bg-white/10 px-2 py-0.5 text-xs leading-tight"
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
