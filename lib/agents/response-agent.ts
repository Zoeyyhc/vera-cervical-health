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
  /** Optional retrieved-context block. When present, appended to the system prompt. */
  ragContext?: string;
  /**
   * Optional structured citations from the RAG agent. When non-empty, the
   * agent yields one `sources` chunk after all text chunks. Wired by #27.
   */
  ragSources?: Source[];
  /** Optional system-prompt override. Defaults to `DEFAULT_SYSTEM_PROMPT`. */
  systemPrompt?: string;
};

export type AgentChunk = { type: "text"; text: string } | { type: "sources"; sources: Source[] };

/**
 * Pure response-agent function. Yields each text delta from Claude as it
 * arrives, then optionally a single `sources` chunk at the end if
 * `ctx.ragSources` is non-empty.
 *
 * Per CLAUDE.md: agents are pure functions with no DB / HTTP awareness, and
 * the model string is hard-coded (never from env).
 */
export async function* runResponseAgent(ctx: ResponseAgentContext): AsyncIterable<AgentChunk> {
  const baseSystem = ctx.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const system = ctx.ragContext
    ? `${baseSystem}\n\nRetrieved context:\n${ctx.ragContext}`
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

  if (ctx.ragSources && ctx.ragSources.length > 0) {
    yield { type: "sources", sources: ctx.ragSources };
  }
}
