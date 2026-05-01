/**
 * Wire format for the streaming `/api/chat` response. NDJSON over
 * `application/x-ndjson` — one JSON-encoded `ChatStreamEvent` per line.
 *
 * Sequence on the happy path: `start` → 1+ `text` → `done`.
 * On mid-stream error: `start` → 0+ `text` → `error`. The terminal event
 * is sent AFTER the assistant message has been persisted, so consumers
 * can treat `done`/`error` as the durability signal.
 */
export type ChatStreamEvent =
  | { type: "start"; sessionId: string }
  | { type: "text"; text: string }
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
