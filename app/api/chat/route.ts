import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import { loadRecentMessages } from "@/lib/ai/context-window";
import { type ChatStreamEvent, encodeChatStreamEvent } from "@/lib/ai/streaming";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { createClient } from "@/lib/supabase/server";
import { chatRequestSchema } from "@/lib/validations/chat";

// max_tokens choice: 4096 is comfortably long for educational replies.
// Streaming removes the SDK HTTP-timeout concern that gated the old 16K
// non-streaming bound, but 4096 still feels like the right ceiling for
// a chat reply — easy to raise here if longer answers are needed.
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

  // 5. Load the session's history (includes the just-inserted user msg)
  let history: Awaited<ReturnType<typeof loadRecentMessages>>;
  try {
    history = await loadRecentMessages(supabase, sessionId);
  } catch (err) {
    console.error("[/api/chat] history load failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "history_load_failed" }, { status: 500 });
  }

  // 6. Open Claude stream + return ReadableStream of NDJSON events.
  // The pre-stream errors above use plain JSON responses; from here on,
  // the response is a streaming body and errors surface as `error` events.
  const sessionIdResolved = sessionId;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encodeChatStreamEvent(event));
      };

      send({ type: "start", sessionId: sessionIdResolved });

      let assistantText = "";
      try {
        const anthropic = getAnthropicClient();
        const claudeStream = anthropic.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system: DEFAULT_SYSTEM_PROMPT,
          messages: history,
        });

        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text;
            assistantText += text;
            send({ type: "text", text });
          }
        }

        // Persist the completed assistant message before signalling done.
        const { error: insertErr } = await supabase.from("chat_messages").insert({
          session_id: sessionIdResolved,
          role: "assistant",
          content: assistantText,
        });
        if (insertErr) {
          // Same policy as the non-streaming version: log but still emit done,
          // because the user already saw the reply on screen.
          console.error(
            "[/api/chat] assistant message insert failed (reply still streamed):",
            insertErr instanceof Error ? insertErr.message : insertErr
          );
        }

        send({ type: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream error";
        console.error("[/api/chat] stream error:", message);

        // Persist whatever we got, with a human-readable interruption marker.
        // We persist even on zero text so the session reflects that a turn
        // was attempted; the marker tells the UI/user what happened.
        const interrupted =
          assistantText.length > 0
            ? `${assistantText}\n\n[reply was interrupted: ${message}]`
            : `[reply was interrupted: ${message}]`;
        const { error: insertErr } = await supabase.from("chat_messages").insert({
          session_id: sessionIdResolved,
          role: "assistant",
          content: interrupted,
        });
        if (insertErr) {
          console.error(
            "[/api/chat] interrupted-message insert failed:",
            insertErr instanceof Error ? insertErr.message : insertErr
          );
        }

        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      // Allow proxies/CDNs to bypass buffering for streaming responses.
      "X-Accel-Buffering": "no",
    },
  });
}
