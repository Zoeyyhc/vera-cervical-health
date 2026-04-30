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

type MockedSupabase = {
  auth: { getUser: ReturnType<typeof vi.fn> };
};

type MockedAnthropic = {
  messages: { create: ReturnType<typeof vi.fn> };
};

function mockSupabase(user: { id: string } | null): MockedSupabase {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
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

  test("returns 200 with { reply } and calls Claude with the system prompt", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }) as never);
    const anthropic = mockAnthropic("Hello there!");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const res = await POST(postRequest({ message: "Hi" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ reply: "Hello there!" });

    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
    const [callArgs] = anthropic.messages.create.mock.calls;
    expect(callArgs[0].model).toBe("claude-sonnet-4-6");
    expect(callArgs[0].system).toMatch(/cervical health/i);
    expect(callArgs[0].messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  test("returns 500 when the Anthropic call rejects, without leaking the error", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }) as never);
    const anthropic: MockedAnthropic = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("upstream boom — secret_key=sk-leaked")),
      },
    };
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    // Suppress the expected console.error so test output stays clean.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("sk-leaked");
    expect(JSON.stringify(json)).not.toContain("secret_key");

    errSpy.mockRestore();
  });
});
