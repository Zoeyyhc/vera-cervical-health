import { CLAUDE_MODEL } from "@/lib/ai/anthropic";
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import { loggedMessagesStream } from "@/lib/ai/logged-anthropic";
import type { PendingAction } from "@/lib/ai/pending-action";
import { CITATION_INSTRUCTION, RESPONSE_DEFAULT_PROMPT } from "@/lib/ai/prompts";
import type { Source } from "@/types/agents";
import type Anthropic from "@anthropic-ai/sdk";

// Health-education answers rarely need the old 4096-token ceiling; 2048 keeps
// the (5×-priced) output tail bounded without truncating typical responses.
// Bump this if real answers start hitting the cap mid-sentence.
const MAX_TOKENS = 2048;

export type ResponseAgentContext = {
  /** The new user turn. The agent appends this to `history` before calling Claude. */
  userMessage: string;
  /** Prior conversation, oldest first. Does NOT include `userMessage`. */
  history: ChatHistoryMessage[];
  /**
   * Optional grounding block — RAG chunks, news headlines, or upcoming
   * events. The orchestrator builds the body (including any sub-header
   * like "Recent news (last 7 days):"). Carried on the current user turn
   * under "Retrieved context:" when non-empty (kept off the `system` prompt
   * so the cached conversation prefix stays stable — see runResponseAgent).
   */
  groundingContext?: string;
  /**
   * Citations matching `groundingContext`. Yielded as a single `sources`
   * chunk after the text chunks so the chat UI can render citation chips.
   */
  groundingSources?: Source[];
  /** Optional system-prompt override. Defaults to `DEFAULT_SYSTEM_PROMPT`. */
  systemPrompt?: string;
};

export type AgentChunk =
  | { type: "text"; text: string }
  | { type: "sources"; sources: Source[] }
  /**
   * Emitted by the orchestrator, never by this agent: the turn ended waiting on
   * something from the user. The route persists it onto the assistant message so
   * the next turn can resume, and forwards it to the client when it wants a
   * geolocation prompt.
   */
  | { type: "pending_action"; action: PendingAction };

/**
 * Pure response-agent function. Yields each text delta from Claude as it
 * arrives, then optionally a single `sources` chunk at the end if
 * `ctx.groundingSources` is non-empty.
 *
 * Per CLAUDE.md: agents are pure functions with no DB / HTTP awareness, and
 * the model string is hard-coded (never from env).
 */
export async function* runResponseAgent(ctx: ResponseAgentContext): AsyncIterable<AgentChunk> {
  const promptDef = ctx.systemPrompt
    ? { id: "response.override", version: "v1", text: ctx.systemPrompt }
    : RESPONSE_DEFAULT_PROMPT;

  // Keep `system` byte-stable across every turn so the cached conversation
  // prefix below is never invalidated. Per-query grounding (RAG/news/events)
  // and the citation instruction ride on the *current* user turn instead —
  // they sit after the cache breakpoint, so they never pollute the cached
  // prefix, and because history persists the raw user message (without
  // grounding) the prefix stays consistent turn to turn.
  const system = promptDef.text;

  const userContent = ctx.groundingContext
    ? `Retrieved context:\n${ctx.groundingContext}\n\n${CITATION_INSTRUCTION}\n\n${ctx.userMessage}`
    : ctx.userMessage;

  const messages = buildMessages(ctx.history, userContent);

  const stream = loggedMessagesStream(
    {
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages,
    },
    { agent: "response", prompt: promptDef }
  );

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    }
  }

  if (ctx.groundingSources && ctx.groundingSources.length > 0) {
    yield { type: "sources", sources: ctx.groundingSources };
  }
}

/**
 * Build the Messages array, marking the last prior turn with a `cache_control`
 * breakpoint so each new request can reuse the cached `system` + history prefix
 * (the multi-turn prompt-caching pattern). The breakpoint sits on the last
 * *history* message, never on the current user turn, so the per-query grounding
 * carried on that turn stays outside the cached prefix.
 *
 * Sonnet's minimum cacheable prefix is ~2048 tokens — shorter prefixes simply
 * don't get cached (no error), so early/short conversations are a harmless
 * no-op and caching kicks in once the history is large enough.
 */
function buildMessages(
  history: ChatHistoryMessage[],
  userContent: string
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const last = messages[messages.length - 1];
  if (last) {
    last.content = [
      { type: "text", text: last.content as string, cache_control: { type: "ephemeral" } },
    ];
  }

  messages.push({ role: "user", content: userContent });
  return messages;
}
