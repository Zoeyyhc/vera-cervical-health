const TITLE_MAX_LENGTH = 60;
const PLACEHOLDER_TITLE = "(new conversation)";

/**
 * Returns the display title for a session row in the sidebar.
 *
 * Priority:
 * 1. Explicit `title` if non-empty after trim
 * 2. First user message truncated to 60 chars (+ "…" if longer)
 * 3. Placeholder for empty sessions
 *
 * Pure — no I/O. Used by the server-side sidebar query.
 */
export function deriveSessionTitle(args: {
  title: string | null;
  firstUserMessage: string | null;
}): string {
  const trimmedTitle = args.title?.trim();
  if (trimmedTitle) return trimmedTitle;

  const trimmedMessage = args.firstUserMessage?.trim();
  if (!trimmedMessage) return PLACEHOLDER_TITLE;

  if (trimmedMessage.length <= TITLE_MAX_LENGTH) return trimmedMessage;
  return `${trimmedMessage.slice(0, TITLE_MAX_LENGTH)}…`;
}
