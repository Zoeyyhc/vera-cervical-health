import type { Source } from "@/types/agents";
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

export type LoadedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete";
  sources?: Source[];
};

/**
 * Loads a single session's messages for the chat page. The session-existence
 * check and the message fetch have no data dependency, so they run in parallel
 * (one network latency instead of two serial round-trips — matters most when
 * the app server and Supabase are a real network apart).
 *
 * Returns `null` when the session is missing, soft-deleted, or not owned by the
 * caller (RLS scopes the lookup) — the caller turns that into `notFound()`.
 * Throws only when the message query itself errors for a valid session.
 */
export async function loadSessionWithMessages(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<LoadedMessage[] | null> {
  const [sessionRes, messagesRes] = await Promise.all([
    supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("chat_messages")
      .select("id, role, content, sources")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  ]);

  if (sessionRes.error || !sessionRes.data) return null;
  if (messagesRes.error) throw new Error(messagesRes.error.message);

  return (messagesRes.data ?? []).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    status: "complete" as const,
    sources: (m.sources as Source[] | null) ?? undefined,
  }));
}
