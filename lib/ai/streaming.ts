import type { Source } from "@/types/agents";

/**
 * Wire format for the streaming `/api/chat` response. NDJSON over
 * `application/x-ndjson` — one JSON-encoded `ChatStreamEvent` per line.
 *
 * Sequence on the happy path: `start` → 1+ `text` → (`sources`)? → `done`.
 * On mid-stream error: `start` → 0+ `text` → `error`. The terminal event
 * is sent AFTER the assistant message has been persisted, so consumers
 * can treat `done`/`error` as the durability signal.
 *
 * `sources` is emitted at most once, after all text chunks, when the
 * response agent received `ragSources` in its context. Plumbed by #27.
 */
export type ChatStreamEvent =
  | { type: "start"; sessionId: string }
  | { type: "text"; text: string }
  | { type: "sources"; sources: Source[] }
  /**
   * The turn needs to know where the user is and the client should offer a
   * browser geolocation prompt, then resend the same turn as a `continuation`
   * carrying whatever it resolved. Emitted instead of `text` — nothing is shown
   * and nothing is persisted, because the turn has not been answered yet.
   *
   * The prompt is deliberately raised here rather than on page load: browsers
   * treat a permission request tied to a user's own "what's near me?" as
   * legitimate, and one raised on mount as a nuisance.
   */
  | { type: "location_request" }
  | { type: "done" }
  | { type: "error"; message: string };

const encoder = new TextEncoder();

/**
 * Serialize one event as NDJSON: a single JSON object followed by `\n`.
 * Returns bytes ready for `controller.enqueue()` in a `ReadableStream`.
 */
export function encodeChatStreamEvent(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

const sharedDecoder = new TextDecoder();

/**
 * Async generator that parses an NDJSON `ReadableStream<Uint8Array>` into
 * `ChatStreamEvent`s. Symmetric with `encodeChatStreamEvent` — the wire
 * round-trips cleanly. Reassembles JSON objects split across chunk
 * boundaries and tolerates a missing trailing newline on the last line.
 *
 * Throws on malformed JSON so the consumer can surface a clear error
 * instead of silently dropping a half-parsed event.
 */
export async function* parseChatStream(
  body: ReadableStream<Uint8Array>
): AsyncIterable<ChatStreamEvent> {
  const reader = body.getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += sharedDecoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as ChatStreamEvent;
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer) as ChatStreamEvent;
}
