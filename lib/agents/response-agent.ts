import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

const MAX_TOKENS = 4096;

export type ResponseAgentContext = {
  /** The new user turn. The agent appends this to `history` before calling Claude. */
  userMessage: string;
  /** Prior conversation, oldest first. Does NOT include `userMessage`. */
  history: ChatHistoryMessage[];
  /** Optional retrieved-context block. When present, appended to the system prompt. */
  ragContext?: string;
  /** Optional system-prompt override. Defaults to `DEFAULT_SYSTEM_PROMPT`. */
  systemPrompt?: string;
};

/**
 * Pure response-agent function. Yields each text delta from Claude as it
 * arrives, in order. The caller handles HTTP framing, persistence, and any
 * downstream wire-format concerns.
 *
 * Per CLAUDE.md: agents are pure functions with no DB / HTTP awareness, and
 * the model string is hard-coded (never from env).
 */
export async function* runResponseAgent(ctx: ResponseAgentContext): AsyncIterable<string> {
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
      yield event.delta.text;
    }
  }
}
