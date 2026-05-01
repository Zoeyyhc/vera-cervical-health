import { describe, expect, it } from "vitest";
import { type ChatStreamEvent, encodeChatStreamEvent } from "./streaming";

describe("encodeChatStreamEvent", () => {
  const decoder = new TextDecoder();

  it("encodes a start event as a single NDJSON line", () => {
    const out = encodeChatStreamEvent({ type: "start", sessionId: "sess-abc" });
    const text = decoder.decode(out);
    expect(text).toBe('{"type":"start","sessionId":"sess-abc"}\n');
  });

  it("encodes a text event with the delta", () => {
    const out = encodeChatStreamEvent({ type: "text", text: "Hello" });
    expect(decoder.decode(out)).toBe('{"type":"text","text":"Hello"}\n');
  });

  it("encodes a done event with no payload", () => {
    const out = encodeChatStreamEvent({ type: "done" });
    expect(decoder.decode(out)).toBe('{"type":"done"}\n');
  });

  it("encodes an error event with the message", () => {
    const out = encodeChatStreamEvent({ type: "error", message: "upstream boom" });
    expect(decoder.decode(out)).toBe('{"type":"error","message":"upstream boom"}\n');
  });

  it("escapes special characters in text content correctly", () => {
    const out = encodeChatStreamEvent({ type: "text", text: 'quote " and newline \n' });
    // JSON.stringify handles the escaping; we just trust it round-trips.
    const parsed = JSON.parse(decoder.decode(out).trim()) as ChatStreamEvent;
    expect(parsed).toEqual({ type: "text", text: 'quote " and newline \n' });
  });

  it("always terminates the line with a single \\n", () => {
    const out = encodeChatStreamEvent({ type: "done" });
    const text = decoder.decode(out);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.match(/\n/g)?.length).toBe(1);
  });
});
