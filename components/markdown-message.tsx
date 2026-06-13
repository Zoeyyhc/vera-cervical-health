import { CitationMarker } from "@/app/(app)/chat/citation-marker";
import { remarkCitations } from "@/lib/markdown/remark-citations";
import type { Source } from "@/types/agents";
import { type ComponentPropsWithoutRef, memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
  /** Citations for resolving inline `[n]` markers. Absent for ungrounded turns. */
  sources?: Source[] | null;
  /** Owning message id — threaded to CitationMarker for scroll targets. */
  messageId?: string;
};

const CITE_HREF_RE = /^#cite-(\d+)$/;

// Memoized: during streaming, every token triggers a setMessages that re-renders
// the whole message list. Without memo, each already-complete message re-parses
// its full markdown on every token. memo skips messages whose content is unchanged.
export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  sources,
  messageId,
}: Props) {
  return (
    <div className="markdown-message space-y-2 text-sm leading-relaxed [&_a]:underline [&_blockquote]:border-charcoal/20 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-charcoal/80 [&_code]:bg-charcoal/5 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:whitespace-pre-wrap [&_pre]:bg-charcoal/5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCitations]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ children, href, ...rest }: ComponentPropsWithoutRef<"a">) => {
            const match = typeof href === "string" ? href.match(CITE_HREF_RE) : null;
            if (match && messageId) {
              return (
                <CitationMarker n={Number(match[1])} sources={sources} messageId={messageId} />
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
