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

  // 3. Resolve session id — create one if the caller didn't supply it
  let sessionId = parsed.data.sessionId;
  if (!sessionId) {
    const { data: created, error: createErr } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, title: null })
      .select("id")
      .single();
    if (createErr || !created) {
      console.error(
        "[/api/chat] session create failed:",
        createErr instanceof Error ? createErr.message : createErr
      );
      return Response.json({ error: "session_create_failed" }, { status: 500 });
    }
    sessionId = created.id;
  }

  // 4. Persist the user message BEFORE calling Claude — durability over speed.
  // If the caller passed a sessionId they don't own, RLS will reject this
  // insert; surface as 404 (don't differentiate "not found" from "not yours").
  const { error: userMsgErr } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content: parsed.data.message,
  });
  if (userMsgErr) {
    console.error(
      "[/api/chat] user message insert failed:",
      userMsgErr instanceof Error ? userMsgErr.message : userMsgErr
    );
    return Response.json({ error: "session_not_found" }, { status: 404 });
  }

  // 5. Call Claude
  let reply: string;
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
    reply = completion.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  } catch (err) {
    // Log to the server only — never echo the upstream error in the response
    // body, which can leak prompt fragments or API-key context.
    console.error("[/api/chat] upstream error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "upstream_error" }, { status: 500 });
  }

  // 6. Persist the assistant message. Failure here is logged but does NOT
  // fail the request — the user already paid for the Claude call and the
  // reply is real; losing the assistant message is recoverable on a future
  // round-trip via session re-fetch (and #22 will need to handle this for
  // streaming anyway).
  const { error: assistantMsgErr } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: reply,
  });
  if (assistantMsgErr) {
    console.error(
      "[/api/chat] assistant message insert failed (reply still returned):",
      assistantMsgErr instanceof Error ? assistantMsgErr.message : assistantMsgErr
    );
  }

  return Response.json({ sessionId, reply });
}
