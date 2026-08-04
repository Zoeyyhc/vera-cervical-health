import { runOrchestrator } from "@/lib/agents/orchestrator";
import { auditContext } from "@/lib/ai/audit-context";
import { loadRecentMessages } from "@/lib/ai/context-window";
import type { PendingAction } from "@/lib/ai/pending-action";
import { type ChatStreamEvent, encodeChatStreamEvent } from "@/lib/ai/streaming";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { chatRequestSchema } from "@/lib/validations/chat";

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

  // 4. Load the session's history (PRIOR turns; the response agent appends
  //    the current user message itself).
  let history: Awaited<ReturnType<typeof loadRecentMessages>>;
  try {
    history = await loadRecentMessages(supabase, sessionId);
  } catch (err) {
    console.error("[/api/chat] history load failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "history_load_failed" }, { status: 500 });
  }

  // 4a. Position for the location-scoped paths comes from the chat client
  //     (browser geolocation → /api/geocode/reverse). Optional throughout.
  const geo = parsed.data.geo ?? null;

  // 5. Persist the user message BEFORE calling Claude — durability over speed.
  //    The chat_sessions.updated_at trigger from #24 fires here so the
  //    sidebar reflects activity even if Claude fails.
  //
  //    Skipped on a continuation: the client is resending a turn we asked it to
  //    complete with a location, and the message row already exists from the
  //    first attempt. Writing it again would duplicate it in the transcript and
  //    in the history sent to Claude.
  if (!parsed.data.continuation) {
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
  }

  // 6. Open the response-agent stream + return ReadableStream of NDJSON
  //    events. Pre-stream errors above use plain JSON; from here on, errors
  //    surface as `error` events on the stream.
  const sessionIdResolved = sessionId;
  const userMessage = parsed.data.message;
  const supabaseAdmin = createServiceRoleClient();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encodeChatStreamEvent(event));
      };

      await auditContext.run(
        { supabaseAdmin, userId: user.id, sessionId: sessionIdResolved },
        async () => {
          send({ type: "start", sessionId: sessionIdResolved });

          let assistantText = "";
          let collectedSources: import("@/types/agents").Source[] | null = null;
          let pendingAction: PendingAction | null = null;
          try {
            for await (const chunk of runOrchestrator(supabase, {
              userMessage,
              history,
              geo,
              geolocationAttempted: parsed.data.geolocationAttempted,
            })) {
              if (chunk.type === "text") {
                assistantText += chunk.text;
                send({ type: "text", text: chunk.text });
              } else if (chunk.type === "sources") {
                collectedSources = chunk.sources;
                send({ type: "sources", sources: chunk.sources });
              } else if (chunk.type === "pending_action") {
                pendingAction = chunk.action;
              }
            }

            // The turn asked the browser for a position rather than answering.
            // Nothing was said, so nothing is persisted: the client resolves a
            // location and resends this same turn as a continuation.
            if (pendingAction?.geolocation && assistantText.length === 0) {
              send({ type: "location_request" });
              send({ type: "done" });
              return;
            }

            // Persist the completed assistant message before signalling done.
            // `pendingAction` rides along on the message that asked for it, so
            // the next turn can resume the request instead of guessing from the
            // wording of the reply.
            const { error: insertErr } = await supabase.from("chat_messages").insert({
              session_id: sessionIdResolved,
              role: "assistant",
              content: assistantText,
              // biome-ignore lint/suspicious/noExplicitAny: jsonb column type erases shape; cast is intentional
              sources: collectedSources as any,
              // biome-ignore lint/suspicious/noExplicitAny: jsonb column type erases shape; cast is intentional
              metadata: (pendingAction ? { pendingAction } : null) as any,
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
        }
      );
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
