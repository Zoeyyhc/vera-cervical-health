// @vitest-environment node

import type { Intent } from "@/types/agents";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/ai/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic")>();
  return {
    ...actual,
    getAnthropicClient: vi.fn(),
  };
});

import { getAnthropicClient } from "@/lib/ai/anthropic";
import { classifyIntent } from "./orchestrator";

function mockAnthropicCreate(replyText: string | Error) {
  return {
    messages: {
      create:
        replyText instanceof Error
          ? vi.fn().mockRejectedValue(replyText)
          : vi.fn().mockResolvedValue({
              content: [{ type: "text", text: replyText }],
            }),
      stream: vi.fn(),
    },
  };
}

describe("classifyIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───── Claude-success path ─────────────────────────────────────────────

  test("returns health_question for a clear health question", async () => {
    const anthropic = mockAnthropicCreate("health_question");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const result = await classifyIntent("What is HPV and how is it transmitted?");
    expect(result.intent satisfies Intent).toBe("health_question");
  });

  test("returns news_request when the model says so", async () => {
    const anthropic = mockAnthropicCreate("news_request");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const result = await classifyIntent("latest news on HPV vaccine");
    expect(result.intent).toBe("news_request");
  });

  test("returns events_request when the model says so", async () => {
    const anthropic = mockAnthropicCreate("events_request");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const result = await classifyIntent("events near me");
    expect(result.intent).toBe("events_request");
  });

  test("returns general_chat for small talk", async () => {
    const anthropic = mockAnthropicCreate("general_chat");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const result = await classifyIntent("hello!");
    expect(result.intent).toBe("general_chat");
  });

  test("trims and lowercases the model's output before matching", async () => {
    const anthropic = mockAnthropicCreate("  HEALTH_QUESTION  \n");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const result = await classifyIntent("anything");
    expect(result.intent).toBe("health_question");
  });

  test("calls Claude with temperature 0 and max_tokens small", async () => {
    const anthropic = mockAnthropicCreate("general_chat");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await classifyIntent("hi");

    const args = anthropic.messages.create.mock.calls[0] as unknown as [
      { temperature: number; max_tokens: number; model: string; system: string },
    ];
    expect(args[0].temperature).toBe(0);
    expect(args[0].max_tokens).toBeLessThan(64); // tight bound for a single label
    expect(args[0].model).toBe("claude-sonnet-4-6");
    expect(typeof args[0].system).toBe("string");
    expect(args[0].system.length).toBeGreaterThan(0);
  });

  // ───── Fallback path ───────────────────────────────────────────────────

  test("falls back to news_request via keyword when Claude errors and the message mentions news", async () => {
    const anthropic = mockAnthropicCreate(new Error("Claude exploded"));
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await classifyIntent("latest news on HPV vaccine");
    expect(result.intent).toBe("news_request");
    errSpy.mockRestore();
  });

  test("falls back to events_request via keyword when Claude errors and the message mentions events", async () => {
    const anthropic = mockAnthropicCreate(new Error("Claude exploded"));
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await classifyIntent("any events near me?");
    expect(result.intent).toBe("events_request");
    errSpy.mockRestore();
  });

  test("falls back to general_chat as the safe default when Claude errors and no keyword matches", async () => {
    const anthropic = mockAnthropicCreate(new Error("Claude exploded"));
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await classifyIntent("What is HPV?");
    expect(result.intent).toBe("general_chat");
    errSpy.mockRestore();
  });

  test("falls back when the model returns garbage that doesn't match any intent", async () => {
    const anthropic = mockAnthropicCreate("not_a_real_intent");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const result = await classifyIntent("hello");
    // garbage from the model + no keyword match → safe default
    expect(result.intent).toBe("general_chat");
  });

  test("never throws — always resolves to a valid Intent", async () => {
    const anthropic = mockAnthropicCreate(new Error("anything"));
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // Won't reject even though the SDK threw.
    await expect(classifyIntent("anything")).resolves.toBeTruthy();
    errSpy.mockRestore();
  });
});
