// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/ai/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic")>();
  return {
    ...actual,
    getAnthropicClient: vi.fn(),
  };
});

import { POST } from "@/app/api/chat/route";
import { getAnthropicClient } from "@/lib/ai/anthropic";
import { parseChatStream } from "@/lib/ai/streaming";
import { createClient } from "@/lib/supabase/server";

type MockedAnthropic = {
  messages: {
    create: ReturnType<typeof vi.fn>; // legacy — no longer called by the route
    stream: ReturnType<typeof vi.fn>;
  };
};

type SupabaseFromMock = {
  from: ReturnType<typeof vi.fn>;
  sessionInsert: ReturnType<typeof vi.fn>;
  sessionSingle: ReturnType<typeof vi.fn>;
  messageInsert: ReturnType<typeof vi.fn>;
  historyOrder: ReturnType<typeof vi.fn>;
};

type SupabaseChainOpts = {
  newSessionId?: string;
  sessionInsertError?: Error | null;
  messageInsertError?: Error | null;
  historyRows?: Array<{ role: string; content: string }>;
  historyError?: Error | null;
};

function mockSupabaseChain(opts: SupabaseChainOpts = {}): SupabaseFromMock {
  const newSessionId = opts.newSessionId ?? "11111111-1111-4111-8111-111111111111";

  const sessionSingle = vi
    .fn()
    .mockResolvedValue(
      opts.sessionInsertError
        ? { data: null, error: opts.sessionInsertError }
        : { data: { id: newSessionId }, error: null }
    );
  const sessionSelect = vi.fn().mockReturnValue({ single: sessionSingle });
  const sessionInsert = vi.fn().mockReturnValue({ select: sessionSelect });

  const messageInsert = vi.fn().mockResolvedValue({
    data: null,
    error: opts.messageInsertError ?? null,
  });

  const historyOrder = vi.fn().mockResolvedValue({
    data: opts.historyRows ?? [],
    error: opts.historyError ?? null,
  });
  const historyEq = vi.fn().mockReturnValue({ order: historyOrder });
  const messageSelect = vi.fn().mockReturnValue({ eq: historyEq });

  const from = vi.fn((table: string) => {
    if (table === "chat_sessions") return { insert: sessionInsert };
    if (table === "chat_messages") return { insert: messageInsert, select: messageSelect };
    throw new Error(`Unmocked table: ${table}`);
  });

  return { from, sessionInsert, sessionSingle, messageInsert, historyOrder };
}

function mockSupabase(
  user: { id: string } | null,
  fromChain: SupabaseFromMock = mockSupabaseChain()
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: fromChain.from,
  };
}

type StreamEventLike = {
  type: "content_block_delta";
  delta: { type: "text_delta"; text: string };
};

/** Mocks the Anthropic SDK with a `messages.stream(...)` returning the given events as an async iterable. */
function mockAnthropic(reply: string): MockedAnthropic {
  return {
    messages: {
      create: vi.fn(),
      stream: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: reply },
          } as StreamEventLike;
        },
      })),
    },
  };
}

/** Mocks `messages.stream(...)` so iteration yields each event in order, optionally throwing at index `throwAt`. */
function mockAnthropicStream(
  events: StreamEventLike[],
  opts: { throwAt?: number } = {}
): MockedAnthropic {
  return {
    messages: {
      create: vi.fn(),
      stream: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < events.length; i++) {
            if (opts.throwAt === i) throw new Error("upstream stream boom");
            yield events[i];
          }
          if (opts.throwAt === events.length) throw new Error("upstream stream boom");
        },
      })),
    },
  };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readNdjsonStream(response: Response): Promise<unknown[]> {
  if (!response.body) throw new Error("response has no body stream");
  const events: unknown[] = [];
  for await (const ev of parseChatStream(response.body)) events.push(ev);
  return events;
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when there is no Supabase user", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase(null) as never);

    const res = await POST(postRequest({ message: "hi" }));

    expect(res.status).toBe(401);
    expect(getAnthropicClient).not.toHaveBeenCalled();
  });

  test("returns 400 when the body fails Zod validation", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }) as never);

    const res = await POST(postRequest({ message: "" }));

    expect(res.status).toBe(400);
    expect(getAnthropicClient).not.toHaveBeenCalled();
  });

  test("returns 400 when the body is not valid JSON", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }) as never);

    const res = await POST(postRequest("not json"));

    expect(res.status).toBe(400);
    expect(getAnthropicClient).not.toHaveBeenCalled();
  });

  test("creates a new session, streams text deltas, persists on done", async () => {
    const fromChain = mockSupabaseChain({
      newSessionId: "22222222-2222-4222-8222-222222222222",
      historyRows: [{ role: "user", content: "Hi" }],
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);

    const anthropic = mockAnthropic("Hello there!");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const res = await POST(postRequest({ message: "Hi" }));
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");

    const events = await readNdjsonStream(res);
    expect(events[0]).toEqual({
      type: "start",
      sessionId: "22222222-2222-4222-8222-222222222222",
    });
    expect(events.find((e) => (e as { type: string }).type === "text")).toEqual({
      type: "text",
      text: "Hello there!",
    });
    expect(events.at(-1)).toEqual({ type: "done" });

    // Order: session created → user msg written → Claude streamed → assistant msg persisted with full content
    expect(fromChain.sessionInsert).toHaveBeenCalledWith({ user_id: "u1", title: null });
    expect(fromChain.messageInsert).toHaveBeenNthCalledWith(1, {
      session_id: "22222222-2222-4222-8222-222222222222",
      role: "user",
      content: "Hi",
    });
    expect(fromChain.messageInsert).toHaveBeenNthCalledWith(2, {
      session_id: "22222222-2222-4222-8222-222222222222",
      role: "assistant",
      content: "Hello there!",
    });

    expect(anthropic.messages.stream).toHaveBeenCalledTimes(1);
    const [streamArgs] = anthropic.messages.stream.mock.calls;
    expect(streamArgs[0].model).toBe("claude-sonnet-4-6");
    expect(streamArgs[0].system).toMatch(/cervical health/i);
    expect(streamArgs[0].messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  test("sends prior session history to Claude on a follow-up turn", async () => {
    const fromChain = mockSupabaseChain({
      historyRows: [
        { role: "user", content: "What is HPV?" },
        { role: "assistant", content: "HPV stands for human papillomavirus..." },
        { role: "user", content: "How is it transmitted?" },
      ],
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    const anthropic = mockAnthropic("Skin-to-skin contact...");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const res = await POST(
      postRequest({
        message: "How is it transmitted?",
        sessionId: "c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4",
      })
    );

    // Drain the stream so the route's start() block runs to completion.
    await readNdjsonStream(res);

    const [streamArgs] = anthropic.messages.stream.mock.calls;
    expect(streamArgs[0].messages).toEqual([
      { role: "user", content: "What is HPV?" },
      { role: "assistant", content: "HPV stands for human papillomavirus..." },
      { role: "user", content: "How is it transmitted?" },
    ]);
  });

  test("with a provided sessionId, reuses it (no new session insert)", async () => {
    const fromChain = mockSupabaseChain({
      historyRows: [{ role: "user", content: "Hi" }],
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropic("ok") as never);

    const res = await POST(
      postRequest({
        message: "Hi",
        sessionId: "c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4",
      })
    );

    const events = await readNdjsonStream(res);
    expect(events[0]).toEqual({
      type: "start",
      sessionId: "c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4",
    });
    expect(fromChain.sessionInsert).not.toHaveBeenCalled();
    expect(fromChain.messageInsert).toHaveBeenCalledTimes(2);
  });

  test("returns 500 if creating the chat_sessions row fails", async () => {
    const fromChain = mockSupabaseChain({ sessionInsertError: new Error("db down") });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));

    expect(res.status).toBe(500);
    expect(getAnthropicClient).not.toHaveBeenCalled();
    expect(fromChain.messageInsert).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test("returns 404 when the user-message insert fails (RLS denial / unowned session)", async () => {
    const fromChain = mockSupabaseChain({ messageInsertError: new Error("RLS violation") });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(
      postRequest({
        message: "Hi",
        sessionId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      })
    );

    expect(res.status).toBe(404);
    expect(getAnthropicClient).not.toHaveBeenCalled();
    expect(fromChain.messageInsert).toHaveBeenCalledTimes(1); // only the failed user write
    errSpy.mockRestore();
  });

  test("returns 500 when loading session history fails", async () => {
    const fromChain = mockSupabaseChain({
      historyError: new Error("history query exploded"),
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));

    expect(res.status).toBe(500);
    expect(getAnthropicClient).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test("emits start → text → error and persists partial with marker on stream error", async () => {
    const fromChain = mockSupabaseChain({
      historyRows: [{ role: "user", content: "Hi" }],
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);

    // Two text deltas arrive, then the iterator throws on the third pull.
    const anthropic = mockAnthropicStream(
      [
        { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: " there" } },
      ],
      { throwAt: 2 }
    );
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));
    const events = await readNdjsonStream(res);

    expect(events.map((e) => (e as { type: string }).type)).toEqual([
      "start",
      "text",
      "text",
      "error",
    ]);
    expect((events.at(-1) as { type: string; message: string }).message).toBe(
      "upstream stream boom"
    );

    // Partial content persisted with the marker
    const assistantInsert = fromChain.messageInsert.mock.calls.find(
      (call) => call[0].role === "assistant"
    );
    expect(assistantInsert?.[0].content).toMatch(/^Hello there\n\n\[reply was interrupted:/);

    errSpy.mockRestore();
  });

  test("logs but still emits done if the assistant-message insert errors", async () => {
    // First insert (user) succeeds, second insert (assistant) errors.
    const fromChain = mockSupabaseChain({
      historyRows: [{ role: "user", content: "Hi" }],
    });
    fromChain.messageInsert
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("write race") });

    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropic("Hello") as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));
    const events = await readNdjsonStream(res);

    // The user already saw the reply; surface done normally.
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
