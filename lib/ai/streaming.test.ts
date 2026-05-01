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

import { parseChatStream } from "./streaming";

function streamFromString(s: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(s));
      controller.close();
    },
  });
}

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events: ChatStreamEvent[] = [];
  for await (const ev of parseChatStream(stream)) events.push(ev);
  return events;
}

describe("parseChatStream", () => {
  it("yields a single event from a complete NDJSON line", async () => {
    const events = await collect(streamFromString('{"type":"done"}\n'));
    expect(events).toEqual([{ type: "done" }]);
  });

  it("yields multiple events from one chunk", async () => {
    const events = await collect(
      streamFromString(
        '{"type":"start","sessionId":"s1"}\n{"type":"text","text":"hi"}\n{"type":"done"}\n'
      )
    );
    expect(events).toEqual([
      { type: "start", sessionId: "s1" },
      { type: "text", text: "hi" },
      { type: "done" },
    ]);
  });

  it("reassembles a JSON object split across chunk boundaries", async () => {
    const events = await collect(streamFromChunks(['{"type":"text",', '"text":"par', 'tial"}\n']));
    expect(events).toEqual([{ type: "text", text: "partial" }]);
  });

  it("yields a final event that lacks a trailing newline", async () => {
    // Some upstreams omit the trailing \n on the last line.
    const events = await collect(streamFromString('{"type":"done"}'));
    expect(events).toEqual([{ type: "done" }]);
  });

  it("skips blank lines", async () => {
    const events = await collect(
      streamFromString('{"type":"start","sessionId":"s1"}\n\n{"type":"done"}\n')
    );
    expect(events).toEqual([{ type: "start", sessionId: "s1" }, { type: "done" }]);
  });

  it("throws on malformed JSON so the UI can surface the error", async () => {
    await expect(collect(streamFromString("not json\n"))).rejects.toThrow();
  });
});
