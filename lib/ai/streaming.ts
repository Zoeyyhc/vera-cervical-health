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
