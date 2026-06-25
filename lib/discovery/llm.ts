import { CLAUDE_FAST_MODEL } from "@/lib/ai/anthropic";
import { loggedMessagesCreate } from "@/lib/ai/logged-anthropic";
import type { PromptDef } from "@/lib/ai/prompts";

/**
 * Run one discovery LLM step: system = prompt.text, single user turn, temp 0.
 * Returns the concatenated text blocks. Audited via loggedMessagesCreate.
 * Errors propagate — callers decide how to degrade.
 */
export async function runDiscoveryLlm(
  prompt: PromptDef,
  userContent: string,
  agent: string
): Promise<string> {
  const res = await loggedMessagesCreate(
    {
      model: CLAUDE_FAST_MODEL,
      max_tokens: 1024,
      temperature: 0,
      system: prompt.text,
      messages: [{ role: "user", content: userContent }],
    },
    { agent, prompt }
  );
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
