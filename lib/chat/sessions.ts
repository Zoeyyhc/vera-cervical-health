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
 * Loads the current user's chat sessions for the sidebar, with each session's
 * earliest user message embedded for the title fallback. RLS scopes the query
 * to the caller — passing a Supabase client signed in as user A cannot return
 * user B's sessions.
 *
 * The embedded chat_messages is filtered (role=user), ordered (created_at asc)
 * and limited to 1 per parent. PostgREST translates this into a LATERAL join
 * so each session row carries at most one message, regardless of conversation
 * length. This avoids the prior payload blow-up where every session pulled its
 * full message history just to derive a title.
 *
 * Returns a sidebar-ready shape: id, derived display title, ISO timestamp.
 */
export async function loadSessionsForUser(
  supabase: SupabaseClient<Database>
): Promise<SessionListItem[]> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, updated_at, chat_messages(content)")
    .eq("chat_messages.role", "user")
    .order("created_at", { referencedTable: "chat_messages", ascending: true })
    .limit(1, { referencedTable: "chat_messages" })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map((row) => {
    const firstUserMessage = (row.chat_messages ?? [])[0]?.content ?? null;

    return {
      id: row.id,
      displayTitle: deriveSessionTitle({
        title: row.title,
        firstUserMessage,
      }),
      updatedAt: row.updated_at ?? "",
    };
  });
}
