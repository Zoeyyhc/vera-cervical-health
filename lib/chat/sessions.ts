import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const TITLE_MAX_LENGTH = 60;
const PLACEHOLDER_TITLE = "(new conversation)";

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
  starredAt: string | null;
};

export type GroupedSessions = {
  starred: SessionListItem[];
  recent: SessionListItem[];
};

/**
 * Loads the current user's active (non-deleted) chat sessions for the sidebar,
 * grouped into starred-first and recent. Single round-trip — grouping happens
 * in memory after PostgREST returns the rows in updated_at desc order.
 */
export async function loadSessionsForUser(
  supabase: SupabaseClient<Database>
): Promise<GroupedSessions> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, updated_at, starred_at, chat_messages(content)")
    .eq("chat_messages.role", "user")
    .is("deleted_at", null)
    .order("created_at", { referencedTable: "chat_messages", ascending: true })
    .limit(1, { referencedTable: "chat_messages" })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!data) return { starred: [], recent: [] };

  const items: SessionListItem[] = data.map((row) => {
    const firstUserMessage = (row.chat_messages ?? [])[0]?.content ?? null;
    return {
      id: row.id,
      displayTitle: deriveSessionTitle({
        title: row.title,
        firstUserMessage,
      }),
      updatedAt: row.updated_at ?? "",
      starredAt: row.starred_at ?? null,
    };
  });

  const starred = items
    .filter((s) => s.starredAt !== null)
    .sort((a, b) => (b.starredAt ?? "").localeCompare(a.starredAt ?? ""));
  const recent = items.filter((s) => s.starredAt === null);

  return { starred, recent };
}
