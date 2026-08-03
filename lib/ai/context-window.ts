import { type PendingAction, readPendingAction } from "@/lib/ai/pending-action";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  /**
   * Set on an assistant turn that asked for something and is waiting for it.
   * Not sent to Claude — `trimToBudget` costs only `content` — but read by the
   * orchestrator to route the reply back into the request it belongs to.
   */
  pendingAction?: PendingAction | null;
};

/**
 * Default character budget for the messages array sent to Claude. Treated as an
 * approximate proxy for tokens (~4 chars/token) — close enough for v1 to bound
 * cost without pulling in a real tokenizer. Per-call override is supported via
 * the `budget` argument on both helpers.
 */
export const BUDGET_CHARS = 32_000;

/**
 * Drop oldest messages until the total content character count fits the budget.
 *
 * Properties:
 * - Pure: no I/O, no side effects.
 * - Stable: input array order is preserved among kept messages.
 * - Anchored on the newest: oldest messages are dropped first.
 * - Leading-assistant guard: if trimming leaves the first message as
 *   role: "assistant", that message is also dropped — Claude's API requires
 *   the first message to be role: "user".
 *
 * The system prompt is never in this list (it lives on the `system` field of
 * the Messages API), so it is structurally exempt from trimming.
 */
export function trimToBudget(messages: ChatHistoryMessage[], budget: number): ChatHistoryMessage[] {
  if (messages.length === 0) return [];

  // Walk from newest backward, accumulating until adding the next would exceed budget.
  const kept: ChatHistoryMessage[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const cost = msg.content.length;
    if (used + cost > budget) break;
    used += cost;
    kept.unshift(msg);
  }

  // Drop a leading assistant turn if trimming created one — Claude requires
  // the first message in `messages` to be a user turn.
  while (kept.length > 0 && kept[0].role !== "user") {
    kept.shift();
  }

  return kept;
}

/**
 * Load the user/assistant messages for a session in chronological order
 * (oldest first), then trim to the budget. Returned shape is exactly what the
 * Anthropic SDK expects in `messages.create({ messages })`.
 *
 * RLS scopes the read to the caller — passing this function a Supabase client
 * authenticated as user A cannot return user B's messages.
 */
export async function loadRecentMessages(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  budget: number = BUDGET_CHARS
): Promise<ChatHistoryMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, metadata")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`loadRecentMessages: ${error.message}`);
  }

  // The DB role check constraint is ('user', 'assistant') so this cast is
  // safe — the schema (#17) prevents any other value.
  const messages = (data ?? []).map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content,
    pendingAction: readPendingAction(row.metadata),
  }));

  return trimToBudget(messages, budget);
}
