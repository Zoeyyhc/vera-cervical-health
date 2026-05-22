// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/agents/orchestrator", () => ({
  runOrchestrator: vi.fn(),
}));

import { POST } from "@/app/api/chat/route";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import type { AgentChunk } from "@/lib/agents/response-agent";
import { parseChatStream } from "@/lib/ai/streaming";
import { createClient } from "@/lib/supabase/server";

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

type OrchestratorMockOpts = {
  chunks: AgentChunk[];
  /** If set, the iterator throws on the i-th pull (0-indexed). throwAt === chunks.length throws after the last yield. */
  throwAt?: number;
};

/**
 * Mocks `runOrchestrator` to yield a controlled set of `AgentChunk`s.
 * Replaces the SDK-level mocking from #28 — route tests now exercise the
 * route's iteration/persistence/wire-format in isolation; orchestrator
 * dispatch and agent internals are tested in their own files.
 */
function mockOrchestratorYields(opts: OrchestratorMockOpts | AgentChunk[]) {
  const config: OrchestratorMockOpts = Array.isArray(opts) ? { chunks: opts } : opts;
  vi.mocked(runOrchestrator).mockReturnValue({
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < config.chunks.length; i++) {
        if (config.throwAt === i) throw new Error("upstream stream boom");
        yield config.chunks[i];
      }
      if (config.throwAt === config.chunks.length) {
        throw new Error("upstream stream boom");
      }
    },
  } as never);
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

  // ───── Bail-before-stream paths ────────────────────────────────────────

  test("returns 401 when there is no Supabase user", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase(null) as never);

    const res = await POST(postRequest({ message: "hi" }));

    expect(res.status).toBe(401);
    expect(runOrchestrator).not.toHaveBeenCalled();
  });

  test("returns 400 when the body fails Zod validation", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }) as never);

    const res = await POST(postRequest({ message: "" }));

    expect(res.status).toBe(400);
    expect(runOrchestrator).not.toHaveBeenCalled();
  });

  test("returns 400 when the body is not valid JSON", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }) as never);

    const res = await POST(postRequest("not json"));

    expect(res.status).toBe(400);
    expect(runOrchestrator).not.toHaveBeenCalled();
  });

  test("returns 500 if creating the chat_sessions row fails", async () => {
    const fromChain = mockSupabaseChain({ sessionInsertError: new Error("db down") });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));

    expect(res.status).toBe(500);
    expect(runOrchestrator).not.toHaveBeenCalled();
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
    expect(runOrchestrator).not.toHaveBeenCalled();
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
    expect(runOrchestrator).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  // ───── Streaming success paths ─────────────────────────────────────────

  test("creates a new session, streams text deltas, persists on done", async () => {
    const fromChain = mockSupabaseChain({
      newSessionId: "22222222-2222-4222-8222-222222222222",
      historyRows: [], // brand-new session
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    mockOrchestratorYields([{ type: "text", text: "Hello there!" }]);

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
      sources: null,
    });

    // Orchestrator was called with the supabase client + userMessage + (empty) history
    expect(runOrchestrator).toHaveBeenCalledTimes(1);
    const [, ctxArg] = vi.mocked(runOrchestrator).mock.calls[0];
    expect(ctxArg).toEqual({ userMessage: "Hi", history: [], city: null });
  });

  test("passes prior session history through to the orchestrator on a follow-up turn", async () => {
    const fromChain = mockSupabaseChain({
      historyRows: [
        { role: "user", content: "What is HPV?" },
        { role: "assistant", content: "HPV stands for human papillomavirus..." },
      ],
    });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    mockOrchestratorYields([{ type: "text", text: "Skin-to-skin contact..." }]);

    const res = await POST(
      postRequest({
        message: "How is it transmitted?",
        sessionId: "c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4",
      })
    );

    await readNdjsonStream(res);

    const [, ctxArg] = vi.mocked(runOrchestrator).mock.calls[0];
    expect(ctxArg).toEqual({
      userMessage: "How is it transmitted?",
      history: [
        { role: "user", content: "What is HPV?" },
        { role: "assistant", content: "HPV stands for human papillomavirus..." },
      ],
      city: null,
    });
  });

  test("threads body.city through to the orchestrator", async () => {
    const fromChain = mockSupabaseChain({ historyRows: [] });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    mockOrchestratorYields([{ type: "text", text: "ok" }]);

    const res = await POST(
      postRequest({
        message: "events near me?",
        sessionId: "c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4",
        city: "Melbourne",
      })
    );
    await readNdjsonStream(res);

    const [, ctxArg] = vi.mocked(runOrchestrator).mock.calls[0];
    expect(ctxArg).toMatchObject({ city: "Melbourne" });
  });

  test("with a provided sessionId, reuses it (no new session insert)", async () => {
    const fromChain = mockSupabaseChain({ historyRows: [] });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    mockOrchestratorYields([{ type: "text", text: "ok" }]);

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

  // ───── Streaming error paths ───────────────────────────────────────────

  test("emits start → text → error and persists partial with marker on stream error", async () => {
    const fromChain = mockSupabaseChain({ historyRows: [] });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    mockOrchestratorYields({
      chunks: [
        { type: "text", text: "Hello" },
        { type: "text", text: " there" },
      ],
      throwAt: 2,
    });
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
    const fromChain = mockSupabaseChain({ historyRows: [] });
    fromChain.messageInsert
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("write race") });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    mockOrchestratorYields([{ type: "text", text: "Hello" }]);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));
    const events = await readNdjsonStream(res);

    // The user already saw the reply; surface done normally.
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
