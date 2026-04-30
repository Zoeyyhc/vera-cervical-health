import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { createClient } from "@/lib/supabase/server";
import { chatRequestSchema } from "@/lib/validations/chat";

// max_tokens choice: 4096 is comfortably long for educational replies and
// well under the 16K non-streaming SDK-timeout threshold. See
// docs/superpowers/plans/2026-04-30-epic3-api-chat-single-turn.md §Task 1.
const MAX_TOKENS = 4096;

export async function POST(request: Request) {
  // 1. Auth — bail before parsing the body
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse + validate body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  // 3. Call Claude
  try {
    const anthropic = getAnthropicClient();
    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: DEFAULT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: parsed.data.message }],
    });

    // The SDK's content union is { type: 'text', text, ... } | { type: 'thinking', ... }
    // | tool blocks. Discriminate inside `.map` so TS narrows correctly without a
    // custom predicate that has to mirror every field on TextBlock.
    const reply = completion.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    return Response.json({ reply });
  } catch (err) {
    // Log to the server only — never echo the upstream error in the response
    // body, which can leak prompt fragments or API-key context.
    console.error("[/api/chat] upstream error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "upstream_error" }, { status: 500 });
  }
}
