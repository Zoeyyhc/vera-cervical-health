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

import { runRagAgent } from "@/lib/agents/rag-agent";
import { type AgentChunk, runResponseAgent } from "@/lib/agents/response-agent";
import type { ChatHistoryMessage } from "@/lib/ai/context-window";

vi.mock("@/lib/agents/response-agent", () => ({
  runResponseAgent: vi.fn(),
}));

vi.mock("@/lib/agents/rag-agent", () => ({
  runRagAgent: vi.fn(),
}));

import { type OrchestratorContext, runOrchestrator } from "./orchestrator";

const fakeSupabase = {} as unknown as Parameters<typeof runOrchestrator>[0];

function fakeAgentStream(chunks: AgentChunk[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

async function collectOrchestrator(ctx: OrchestratorContext): Promise<AgentChunk[]> {
  const out: AgentChunk[] = [];
  for await (const c of runOrchestrator(fakeSupabase, ctx)) out.push(c);
  return out;
}

const baseCtx: OrchestratorContext = {
  userMessage: "What is HPV?",
  history: [] as ChatHistoryMessage[],
};

describe("runOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default classifier mock: general_chat. Tests override per case.
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropicCreate("general_chat") as never);
  });

  // ───── general_chat ────────────────────────────────────────────────────

  test("general_chat: skips RAG and yields response-agent chunks directly", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropicCreate("general_chat") as never);
    vi.mocked(runResponseAgent).mockReturnValue(
      fakeAgentStream([{ type: "text", text: "Hello!" }]) as never
    );

    const chunks = await collectOrchestrator(baseCtx);

    expect(runRagAgent).not.toHaveBeenCalled();
    expect(runResponseAgent).toHaveBeenCalledTimes(1);
    expect(runResponseAgent).toHaveBeenCalledWith({
      userMessage: baseCtx.userMessage,
      history: baseCtx.history,
    });
    expect(chunks).toEqual([{ type: "text", text: "Hello!" }]);
  });

  // ───── health_question ─────────────────────────────────────────────────

  test("health_question: calls runRagAgent and threads ragContext + ragSources into the response agent", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropicCreate("health_question") as never);
    const ragContext = "[1] (Source A) HPV is a common virus.";
    const ragSources = [{ id: "1", title: "Source A", chunkId: "uuid-1" }];
    vi.mocked(runRagAgent).mockResolvedValue({ ragContext, ragSources });
    vi.mocked(runResponseAgent).mockReturnValue(
      fakeAgentStream([
        { type: "text", text: "HPV is..." },
        { type: "sources", sources: ragSources },
      ]) as never
    );

    const chunks = await collectOrchestrator(baseCtx);

    expect(runRagAgent).toHaveBeenCalledTimes(1);
    expect(runRagAgent).toHaveBeenCalledWith(fakeSupabase, {
      userMessage: baseCtx.userMessage,
    });
    expect(runResponseAgent).toHaveBeenCalledTimes(1);
    expect(runResponseAgent).toHaveBeenCalledWith({
      userMessage: baseCtx.userMessage,
      history: baseCtx.history,
      ragContext,
      ragSources,
    });
    expect(chunks).toEqual([
      { type: "text", text: "HPV is..." },
      { type: "sources", sources: ragSources },
    ]);
  });

  test("health_question with empty RAG result: still calls response agent (with empty ragContext/ragSources)", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropicCreate("health_question") as never);
    vi.mocked(runRagAgent).mockResolvedValue({ ragContext: "", ragSources: [] });
    vi.mocked(runResponseAgent).mockReturnValue(
      fakeAgentStream([{ type: "text", text: "I don't have specific info..." }]) as never
    );

    await collectOrchestrator(baseCtx);

    expect(runResponseAgent).toHaveBeenCalledWith({
      userMessage: baseCtx.userMessage,
      history: baseCtx.history,
      ragContext: "",
      ragSources: [],
    });
  });

  test("health_question with zero chunks: logs an operational warning for threshold tuning", async () => {
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropicCreate("health_question") as never);
    vi.mocked(runRagAgent).mockResolvedValue({ ragContext: "", ragSources: [] });
    vi.mocked(runResponseAgent).mockReturnValue(
      fakeAgentStream([{ type: "text", text: "ok" }]) as never
    );

    await collectOrchestrator(baseCtx);

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining("health_question returned 0 chunks")
    );
    consoleInfoSpy.mockRestore();
  });

  test("health_question with non-zero chunks: does NOT log the zero-chunk warning", async () => {
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropicCreate("health_question") as never);
    vi.mocked(runRagAgent).mockResolvedValue({
      ragContext: "ctx",
      ragSources: [{ id: "1", title: "WHO", chunkId: "c1" }],
    });
    vi.mocked(runResponseAgent).mockReturnValue(
      fakeAgentStream([{ type: "text", text: "ok" }]) as never
    );

    await collectOrchestrator(baseCtx);

    // The dispatch log uses `console.info` too, so filter by the specific message.
    const zeroChunkLogs = consoleInfoSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("returned 0 chunks")
    );
    expect(zeroChunkLogs).toHaveLength(0);
    consoleInfoSpy.mockRestore();
  });

  // ───── news_request / events_request stubs ─────────────────────────────

  test("news_request: yields a stub text chunk; never calls RAG or response agent", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropicCreate("news_request") as never);

    const chunks = await collectOrchestrator(baseCtx);

    expect(runRagAgent).not.toHaveBeenCalled();
    expect(runResponseAgent).not.toHaveBeenCalled();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      type: "text",
      text: expect.stringContaining("news"),
    });
  });

  test("events_request: yields a stub text chunk; never calls RAG or response agent", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropicCreate("events_request") as never);

    const chunks = await collectOrchestrator(baseCtx);

    expect(runRagAgent).not.toHaveBeenCalled();
    expect(runResponseAgent).not.toHaveBeenCalled();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      type: "text",
      text: expect.stringContaining("events"),
    });
  });

  // ───── error propagation ───────────────────────────────────────────────

  test("propagates errors thrown by runRagAgent on the health_question path", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropicCreate("health_question") as never);
    vi.mocked(runRagAgent).mockRejectedValue(new Error("rag exploded"));

    await expect(collectOrchestrator(baseCtx)).rejects.toThrow("rag exploded");
    expect(runResponseAgent).not.toHaveBeenCalled();
  });
});
