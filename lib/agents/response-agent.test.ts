// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/ai/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic")>();
  return {
    ...actual,
    getAnthropicClient: vi.fn(),
  };
});

import { getAnthropicClient } from "@/lib/ai/anthropic";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { runResponseAgent } from "./response-agent";

type StreamEventLike =
  | {
      type: "content_block_delta";
      delta: { type: "text_delta"; text: string };
    }
  | { type: "message_stop" };

type StreamLike = {
  events: StreamEventLike[];
  throwAt?: number;
};

function mockAnthropic(stream: StreamLike) {
  return {
    messages: {
      create: vi.fn(),
      stream: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < stream.events.length; i++) {
            if (stream.throwAt === i) throw new Error("boom");
            yield stream.events[i];
          }
          // Allow throwAt === events.length so a test can yield N events
          // then throw on the next pull.
          if (stream.throwAt === stream.events.length) throw new Error("boom");
        },
      })),
    },
  };
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const c of iter) chunks.push(c);
  return chunks;
}

describe("runResponseAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("yields each text delta in order", async () => {
    const anthropic = mockAnthropic({
      events: [
        { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: ", " } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "world!" } },
      ],
    });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const chunks = await collect(runResponseAgent({ userMessage: "Hi", history: [] }));
    expect(chunks).toEqual(["Hello", ", ", "world!"]);
  });

  test("ignores non-text events from the SDK", async () => {
    const anthropic = mockAnthropic({
      events: [
        { type: "message_stop" },
        { type: "content_block_delta", delta: { type: "text_delta", text: "only this" } },
        { type: "message_stop" },
      ],
    });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const chunks = await collect(runResponseAgent({ userMessage: "Hi", history: [] }));
    expect(chunks).toEqual(["only this"]);
  });

  test("returns no chunks when the stream is empty", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const chunks = await collect(runResponseAgent({ userMessage: "Hi", history: [] }));
    expect(chunks).toEqual([]);
  });

  test("calls Claude with model claude-sonnet-4-6 and the default system prompt by default", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(runResponseAgent({ userMessage: "Hi", history: [] }));

    const args = anthropic.messages.stream.mock.calls[0] as unknown as [
      { model: string; system: string; messages: unknown[]; max_tokens: number },
    ];
    expect(args[0].model).toBe("claude-sonnet-4-6");
    expect(args[0].system).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(args[0].max_tokens).toBeGreaterThan(0);
  });

  test("appends the userMessage to the history when calling Claude", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(
      runResponseAgent({
        userMessage: "How is it transmitted?",
        history: [
          { role: "user", content: "What is HPV?" },
          { role: "assistant", content: "HPV stands for human papillomavirus..." },
        ],
      })
    );

    const args = anthropic.messages.stream.mock.calls[0] as unknown as [
      { model: string; system: string; messages: unknown[]; max_tokens: number },
    ];
    expect(args[0].messages).toEqual([
      { role: "user", content: "What is HPV?" },
      { role: "assistant", content: "HPV stands for human papillomavirus..." },
      { role: "user", content: "How is it transmitted?" },
    ]);
  });

  test("uses the explicit systemPrompt when provided", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(
      runResponseAgent({
        userMessage: "Hi",
        history: [],
        systemPrompt: "You are a custom assistant.",
      })
    );

    const args = anthropic.messages.stream.mock.calls[0] as unknown as [
      { model: string; system: string; messages: unknown[]; max_tokens: number },
    ];
    expect(args[0].system).toBe("You are a custom assistant.");
  });

  test("appends ragContext to the system prompt when provided", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(
      runResponseAgent({
        userMessage: "Hi",
        history: [],
        ragContext: "Source 1: HPV is...",
      })
    );

    const args = anthropic.messages.stream.mock.calls[0] as unknown as [
      { model: string; system: string; messages: unknown[]; max_tokens: number },
    ];
    expect(args[0].system).toContain(DEFAULT_SYSTEM_PROMPT);
    expect(args[0].system).toContain("Retrieved context:");
    expect(args[0].system).toContain("Source 1: HPV is...");
  });

  test("propagates errors thrown during streaming", async () => {
    const anthropic = mockAnthropic({
      events: [{ type: "content_block_delta", delta: { type: "text_delta", text: "partial" } }],
      throwAt: 1,
    });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await expect(collect(runResponseAgent({ userMessage: "Hi", history: [] }))).rejects.toThrow(
      "boom"
    );
  });
});
