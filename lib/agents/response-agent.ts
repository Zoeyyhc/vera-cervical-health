import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import type { Source } from "@/types/agents";

const MAX_TOKENS = 4096;

export type ResponseAgentContext = {
  /** The new user turn. The agent appends this to `history` before calling Claude. */
  userMessage: string;
  /** Prior conversation, oldest first. Does NOT include `userMessage`. */
  history: ChatHistoryMessage[];
  /**
   * Optional grounding block — RAG chunks, news headlines, or upcoming
   * events. The orchestrator builds the body (including any sub-header
   * like "Recent news (last 7 days):"). Appended to the system prompt
   * under "Retrieved context:" when non-empty.
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

export type AgentChunk = { type: "text"; text: string } | { type: "sources"; sources: Source[] };

/**
 * Pure response-agent function. Yields each text delta from Claude as it
 * arrives, then optionally a single `sources` chunk at the end if
 * `ctx.groundingSources` is non-empty.
 *
 * Per CLAUDE.md: agents are pure functions with no DB / HTTP awareness, and
 * the model string is hard-coded (never from env).
 */
export async function* runResponseAgent(ctx: ResponseAgentContext): AsyncIterable<AgentChunk> {
  const baseSystem = ctx.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const system = ctx.groundingContext
    ? `${baseSystem}\n\nRetrieved context:\n${ctx.groundingContext}`
    : baseSystem;

  const messages = [...ctx.history, { role: "user" as const, content: ctx.userMessage }];

  const anthropic = getAnthropicClient();
  const stream = anthropic.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    }
  }

  if (ctx.groundingSources && ctx.groundingSources.length > 0) {
    yield { type: "sources", sources: ctx.groundingSources };
  }
}
