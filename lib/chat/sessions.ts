import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export type SessionListItem = {
  id: string;
  displayTitle: string;
  updatedAt: string;
};

/**
 * Loads the current user's chat sessions for the sidebar, joined with each
 * session's chat_messages (so we can derive the title fallback). RLS scopes
 * the query to the caller — passing a Supabase client signed in as user A
 * cannot return user B's sessions.
 *
 * Returns a sidebar-ready shape: id, derived display title, ISO timestamp.
 */
export async function loadSessionsForUser(
  supabase: SupabaseClient<Database>
): Promise<SessionListItem[]> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, updated_at, chat_messages ( content, role, created_at )")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map((row) => {
    // Find the earliest user message in the nested join.
    const userMessages = (row.chat_messages ?? [])
      .filter((m) => m.role === "user")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const firstUserMessage = userMessages[0]?.content ?? null;

    return {
      id: row.id,
      displayTitle: deriveSessionTitle({
        title: row.title,
        firstUserMessage,
      }),
      updatedAt: row.updated_at,
    };
  });
}
