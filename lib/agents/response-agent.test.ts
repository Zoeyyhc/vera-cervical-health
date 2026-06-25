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

import type { AgentChunk } from "./response-agent";

async function collect(iter: AsyncIterable<AgentChunk>): Promise<AgentChunk[]> {
  const chunks: AgentChunk[] = [];
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
    expect(chunks).toEqual([
      { type: "text", text: "Hello" },
      { type: "text", text: ", " },
      { type: "text", text: "world!" },
    ]);
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
    expect(chunks).toEqual([{ type: "text", text: "only this" }]);
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
    // The last prior turn carries the cache_control breakpoint; the current
    // user turn is appended plain (no grounding here).
    expect(args[0].messages).toEqual([
      { role: "user", content: "What is HPV?" },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "HPV stands for human papillomavirus...",
            cache_control: { type: "ephemeral" },
          },
        ],
      },
      { role: "user", content: "How is it transmitted?" },
    ]);
  });

  test("marks no cache breakpoint when there is no prior history", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(runResponseAgent({ userMessage: "Hi", history: [] }));

    const args = anthropic.messages.stream.mock.calls[0] as unknown as [{ messages: unknown[] }];
    expect(args[0].messages).toEqual([{ role: "user", content: "Hi" }]);
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

  test("carries groundingContext on the current user turn, keeping system stable", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(
      runResponseAgent({
        userMessage: "Hi",
        history: [],
        groundingContext: "Source 1: HPV is...",
      })
    );

    const args = anthropic.messages.stream.mock.calls[0] as unknown as [
      { system: string; messages: { content: string }[] },
    ];
    // System stays byte-identical to the default so the cached prefix holds.
    expect(args[0].system).toBe(DEFAULT_SYSTEM_PROMPT);
    // Grounding rides on the (last) user turn, not the system prompt.
    const userTurn = args[0].messages[args[0].messages.length - 1].content;
    expect(userTurn).toContain("Retrieved context:");
    expect(userTurn).toContain("Source 1: HPV is...");
    expect(userTurn).toContain("Hi");
  });

  test("treats empty-string groundingContext the same as absent (plain user turn)", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(
      runResponseAgent({
        userMessage: "Hi",
        history: [],
        groundingContext: "", // explicit empty — the no-match case from runRagAgent
      })
    );

    const args = anthropic.messages.stream.mock.calls[0] as unknown as [
      { system: string; messages: { content: string }[] },
    ];
    expect(args[0].system).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(args[0].messages[args[0].messages.length - 1].content).toBe("Hi");
  });

  test("appends the citation instruction on the user turn when groundingContext is present", async () => {
    const anthropic = mockAnthropic({
      events: [{ type: "content_block_delta", delta: { type: "text_delta", text: "ok" } }],
    });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(
      runResponseAgent({
        userMessage: "Hi",
        history: [],
        groundingContext: "[1] HPV is a virus.",
      })
    );
    const args = anthropic.messages.stream.mock.calls[0] as unknown as [
      { system: string; messages: { content: string }[] },
    ];
    expect(args[0].messages[args[0].messages.length - 1].content).toContain(
      "append the corresponding marker"
    );
    expect(args[0].system).not.toContain("append the corresponding marker");
  });

  test("does NOT append the citation instruction for ungrounded turns", async () => {
    const anthropic = mockAnthropic({
      events: [{ type: "content_block_delta", delta: { type: "text_delta", text: "ok" } }],
    });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(runResponseAgent({ userMessage: "Hi", history: [] }));
    const args = anthropic.messages.stream.mock.calls[0] as unknown as [
      { system: string; messages: { content: string }[] },
    ];
    expect(args[0].system).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(args[0].messages[args[0].messages.length - 1].content).not.toContain(
      "append the corresponding marker"
    );
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

  test("emits a sources chunk after text when ctx.groundingSources is non-empty", async () => {
    const anthropic = mockAnthropic({
      events: [{ type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } }],
    });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const chunks = await collect(
      runResponseAgent({
        userMessage: "What is HPV?",
        history: [],
        groundingSources: [
          { id: "1", title: "Cancer Council", url: "https://example.com", chunkId: "c1" },
        ],
      })
    );
    expect(chunks).toEqual([
      { type: "text", text: "Hi" },
      {
        type: "sources",
        sources: [{ id: "1", title: "Cancer Council", url: "https://example.com", chunkId: "c1" }],
      },
    ]);
  });

  test("does not emit a sources chunk when ctx.groundingSources is empty or absent", async () => {
    const anthropic = mockAnthropic({
      events: [{ type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } }],
    });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    // groundingSources omitted entirely
    const chunksNoField = await collect(runResponseAgent({ userMessage: "Hi", history: [] }));
    expect(chunksNoField).toEqual([{ type: "text", text: "Hi" }]);

    // groundingSources present but empty
    const chunksEmpty = await collect(
      runResponseAgent({ userMessage: "Hi", history: [], groundingSources: [] })
    );
    expect(chunksEmpty).toEqual([{ type: "text", text: "Hi" }]);
  });
});
