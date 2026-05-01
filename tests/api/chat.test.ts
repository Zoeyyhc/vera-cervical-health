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
import { createClient } from "@/lib/supabase/server";

type MockedAnthropic = {
  messages: { create: ReturnType<typeof vi.fn> };
};

type SupabaseFromMock = {
  from: ReturnType<typeof vi.fn>;
  sessionInsert: ReturnType<typeof vi.fn>;
  sessionSingle: ReturnType<typeof vi.fn>;
  messageInsert: ReturnType<typeof vi.fn>;
};

type SupabaseChainOpts = {
  newSessionId?: string;
  sessionInsertError?: Error | null;
  messageInsertError?: Error | null;
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

  const from = vi.fn((table: string) => {
    if (table === "chat_sessions") return { insert: sessionInsert };
    if (table === "chat_messages") return { insert: messageInsert };
    throw new Error(`Unmocked table: ${table}`);
  });

  return { from, sessionInsert, sessionSingle, messageInsert };
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

function mockAnthropic(reply: string): MockedAnthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: reply }],
      }),
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

  test("creates a new session, writes user+assistant messages, returns { sessionId, reply }", async () => {
    const fromChain = mockSupabaseChain({ newSessionId: "22222222-2222-4222-8222-222222222222" });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);

    const anthropic = mockAnthropic("Hello there!");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const res = await POST(postRequest({ message: "Hi" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      sessionId: "22222222-2222-4222-8222-222222222222",
      reply: "Hello there!",
    });

    // Order: session created → user msg written → Claude called → assistant msg written
    expect(fromChain.sessionInsert).toHaveBeenCalledWith({ user_id: "u1", title: null });
    expect(fromChain.messageInsert).toHaveBeenNthCalledWith(1, {
      session_id: "22222222-2222-4222-8222-222222222222",
      role: "user",
      content: "Hi",
    });
    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
    const [callArgs] = anthropic.messages.create.mock.calls;
    expect(callArgs[0].model).toBe("claude-sonnet-4-6");
    expect(callArgs[0].system).toMatch(/cervical health/i);
    expect(callArgs[0].messages).toEqual([{ role: "user", content: "Hi" }]);
    expect(fromChain.messageInsert).toHaveBeenNthCalledWith(2, {
      session_id: "22222222-2222-4222-8222-222222222222",
      role: "assistant",
      content: "Hello there!",
    });

    // Strict ordering: user-msg insert came before the Claude call
    const userInsertOrder = fromChain.messageInsert.mock.invocationCallOrder[0];
    const claudeCallOrder = anthropic.messages.create.mock.invocationCallOrder[0];
    expect(userInsertOrder).toBeLessThan(claudeCallOrder);
  });

  test("with a provided sessionId, reuses it (no new session insert)", async () => {
    const fromChain = mockSupabaseChain();
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropic("ok") as never);

    const res = await POST(
      postRequest({
        message: "Hi",
        sessionId: "c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sessionId).toBe("c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4");
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

  test("logs but does not fail the request if the assistant-message insert errors", async () => {
    // First insert (user) succeeds, second insert (assistant) errors.
    const fromChain = mockSupabaseChain();
    fromChain.messageInsert
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("write race") });

    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropic("Hello") as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));
    const json = await res.json();

    // The user already paid for the Claude call; surface the reply.
    expect(res.status).toBe(200);
    expect(json.reply).toBe("Hello");
    expect(errSpy).toHaveBeenCalled(); // assistant-write failure must be logged
    errSpy.mockRestore();
  });

  test("returns 500 when the Anthropic call rejects, without leaking the error", async () => {
    const fromChain = mockSupabaseChain();
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    const anthropic: MockedAnthropic = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("upstream boom — secret_key=sk-leaked")),
      },
    };
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("sk-leaked");
    expect(JSON.stringify(json)).not.toContain("secret_key");

    // The user's message was persisted before the Claude call — that's deliberate.
    expect(fromChain.messageInsert).toHaveBeenCalledTimes(1);
    expect(fromChain.messageInsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", content: "Hi" })
    );

    errSpy.mockRestore();
  });
});
