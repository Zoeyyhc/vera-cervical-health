// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentChunk } from "./response-agent";

/**
 * Orchestrator dispatch for the Victoria Trusted Health MCP.
 *
 * The load-bearing property here is acceptance criterion 5: "The chat route
 * continues to work when the MCP is unavailable." Every path below has a
 * without-MCP counterpart.
 */

vi.mock("@/lib/ai/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/anthropic")>()),
  getAnthropicClient: vi.fn(),
}));
vi.mock("@/lib/agents/rag-agent", () => ({ runRagAgent: vi.fn() }));
vi.mock("@/lib/agents/news-agent", () => ({ runNewsAgent: vi.fn() }));
vi.mock("@/lib/agents/events-agent", () => ({ runEventsAgent: vi.fn() }));
vi.mock("@/lib/agents/response-agent", () => ({ runResponseAgent: vi.fn() }));
vi.mock("@/lib/agents/victoria-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/victoria-agent")>()),
  runVictoriaHealthAgent: vi.fn(),
  runVictoriaServicesAgent: vi.fn(),
  runVictoriaEventsAgent: vi.fn(),
}));
vi.mock("@/lib/ai/abuse", () => ({ recordAbuseEvent: vi.fn() }));
vi.mock("@/lib/ai/rag-gap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/rag-gap")>()),
  recordRagGap: vi.fn(),
}));

import { getAnthropicClient } from "@/lib/ai/anthropic";
import { runEventsAgent } from "./events-agent";
import {
  type OrchestratorContext,
  SERVICES_EMPTY_FALLBACK,
  SERVICES_NEEDS_LOCATION_FALLBACK,
  SERVICES_OUTSIDE_VICTORIA_FALLBACK,
  runOrchestrator,
} from "./orchestrator";
import { runRagAgent } from "./rag-agent";
import { runResponseAgent } from "./response-agent";
import {
  runVictoriaEventsAgent,
  runVictoriaHealthAgent,
  runVictoriaServicesAgent,
} from "./victoria-agent";

const fakeSupabase = {} as unknown as Parameters<typeof runOrchestrator>[0];

/** Makes the classifier return `intent` without a real Claude call. */
function classifyAs(intent: string) {
  vi.mocked(getAnthropicClient).mockReturnValue({
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: intent }] }),
      stream: vi.fn(),
    },
  } as never);
}

function stream(chunks: AgentChunk[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

async function collect(ctx: OrchestratorContext): Promise<AgentChunk[]> {
  const out: AgentChunk[] = [];
  for await (const c of runOrchestrator(fakeSupabase, ctx)) out.push(c);
  return out;
}

const MCP_SILENT = { context: "", sources: [] };

const VIC_SOURCE = {
  id: "1",
  title: "healthdirect Service Finder",
  url: "https://www.healthdirect.gov.au/australian-health-services",
  chunkId: "vic-directory:https://www.healthdirect.gov.au/australian-health-services",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runResponseAgent).mockReturnValue(stream([{ type: "text", text: "answer" }]));
  vi.mocked(runVictoriaHealthAgent).mockResolvedValue(MCP_SILENT);
  vi.mocked(runVictoriaServicesAgent).mockResolvedValue(MCP_SILENT);
  vi.mocked(runVictoriaEventsAgent).mockResolvedValue(MCP_SILENT);
  vi.mocked(runRagAgent).mockResolvedValue({ ragContext: "rag", ragSources: [], topScore: 0.8 });
  vi.mocked(runEventsAgent).mockResolvedValue({ eventsContext: "", eventsSources: [] });
});

describe("services_request", () => {
  test("grounds the response in the returned directory links", async () => {
    classifyAs("services_request");
    vi.mocked(runVictoriaServicesAgent).mockResolvedValue({
      context: "[1] healthdirect …",
      sources: [VIC_SOURCE],
    });

    await collect({ userMessage: "where can I get screened", history: [], city: "Carlton" });

    const ctx = vi.mocked(runResponseAgent).mock.calls[0][0];
    expect(ctx.groundingContext).toContain("Approved Victorian screening-service directories");
    expect(ctx.groundingSources).toEqual([VIC_SOURCE]);
  });

  test("asks for a location when the agent has none", async () => {
    classifyAs("services_request");
    vi.mocked(runVictoriaServicesAgent).mockResolvedValue({ ...MCP_SILENT, needsLocation: true });

    const chunks = await collect({ userMessage: "where can I get screened", history: [] });

    expect(chunks).toEqual([{ type: "text", text: SERVICES_NEEDS_LOCATION_FALLBACK }]);
    expect(runResponseAgent).not.toHaveBeenCalled();
  });

  test("explains the Victorian scope instead of widening the search", async () => {
    classifyAs("services_request");
    vi.mocked(runVictoriaServicesAgent).mockResolvedValue({
      ...MCP_SILENT,
      outsideVictoria: true,
    });

    const chunks = await collect({ userMessage: "clinics near me", history: [], city: "Sydney" });

    expect(chunks).toEqual([{ type: "text", text: SERVICES_OUTSIDE_VICTORIA_FALLBACK }]);
  });

  test("falls back to a static message when the MCP is unavailable", async () => {
    classifyAs("services_request");
    vi.mocked(runVictoriaServicesAgent).mockResolvedValue(MCP_SILENT);

    const chunks = await collect({ userMessage: "clinics", history: [], city: "Carlton" });

    expect(chunks).toEqual([{ type: "text", text: SERVICES_EMPTY_FALLBACK }]);
  });

  test("bridges a bare postcode reply to the location prompt", async () => {
    classifyAs("general_chat");
    vi.mocked(runVictoriaServicesAgent).mockResolvedValue({
      context: "[1] healthdirect …",
      sources: [VIC_SOURCE],
    });

    await collect({
      userMessage: "3053",
      history: [{ role: "assistant", content: SERVICES_NEEDS_LOCATION_FALLBACK }],
    });

    expect(runVictoriaServicesAgent).toHaveBeenCalledWith(
      expect.objectContaining({ city: "3053" })
    );
  });

  test.each([
    ["out-of-scope", SERVICES_OUTSIDE_VICTORIA_FALLBACK],
    ["unreachable-MCP", SERVICES_EMPTY_FALLBACK],
  ])("bridges a location reply after the %s answer", async (_label, previousAnswer) => {
    // Naming another suburb after a dead end is a retry of the same request.
    // The bridge has to survive every services fallback, not just the prompt.
    classifyAs("general_chat");
    vi.mocked(runVictoriaServicesAgent).mockResolvedValue({
      context: "[1] healthdirect …",
      sources: [VIC_SOURCE],
    });

    await collect({
      userMessage: "burwood east",
      history: [
        { role: "user", content: "where can I get screened?" },
        { role: "assistant", content: previousAnswer },
      ],
    });

    expect(runVictoriaServicesAgent).toHaveBeenCalledWith(
      expect.objectContaining({ city: "burwood east" })
    );
    expect(runResponseAgent).toHaveBeenCalledTimes(1);
  });

  test("does not bridge a location reply after an unrelated answer", async () => {
    classifyAs("general_chat");
    vi.mocked(runResponseAgent).mockReturnValue(
      (async function* () {
        yield { type: "text", text: "ok" } as AgentChunk;
      })() as never
    );

    await collect({
      userMessage: "burwood east",
      history: [
        { role: "user", content: "what is HPV?" },
        { role: "assistant", content: "HPV is a common virus…" },
      ],
    });

    expect(runVictoriaServicesAgent).not.toHaveBeenCalled();
  });
});

describe("health_question", () => {
  test("prefers the governed MCP grounding for a Victorian turn", async () => {
    classifyAs("health_question");
    const mcpSource = {
      id: "1",
      title: "Dept of Health",
      url: "https://health.gov.au/x",
      chunkId: "c1",
    };
    vi.mocked(runVictoriaHealthAgent).mockResolvedValue({
      context: "[1] governed excerpt",
      sources: [mcpSource],
    });

    await collect({ userMessage: "when should I screen", history: [], city: "Melbourne" });

    const ctx = vi.mocked(runResponseAgent).mock.calls[0][0];
    expect(ctx.groundingContext).toBe("[1] governed excerpt");
    expect(ctx.groundingSources).toEqual([mcpSource]);
  });

  test("uses plain RAG when the MCP returns nothing", async () => {
    classifyAs("health_question");
    vi.mocked(runVictoriaHealthAgent).mockResolvedValue(MCP_SILENT);

    await collect({ userMessage: "when should I screen", history: [], city: "Melbourne" });

    expect(vi.mocked(runResponseAgent).mock.calls[0][0].groundingContext).toBe("rag");
  });

  test("does not consult the MCP for a non-Victorian turn", async () => {
    classifyAs("health_question");

    await collect({ userMessage: "when should I screen", history: [], city: "Sydney" });

    expect(runVictoriaHealthAgent).not.toHaveBeenCalled();
    expect(vi.mocked(runResponseAgent).mock.calls[0][0].groundingContext).toBe("rag");
  });

  test("does not consult the MCP when no location is known", async () => {
    classifyAs("health_question");

    await collect({ userMessage: "what is HPV", history: [] });

    expect(runVictoriaHealthAgent).not.toHaveBeenCalled();
    expect(runRagAgent).toHaveBeenCalled();
  });

  test("still records a RAG coverage gap when the MCP answers", async () => {
    classifyAs("health_question");
    vi.mocked(runRagAgent).mockResolvedValue({ ragContext: "", ragSources: [], topScore: 0.1 });
    vi.mocked(runVictoriaHealthAgent).mockResolvedValue({
      context: "[1] governed",
      sources: [{ id: "1", title: "t", chunkId: "c1" }],
    });

    const { recordRagGap } = await import("@/lib/ai/rag-gap");
    await collect({ userMessage: "obscure question", history: [], city: "Melbourne" });

    expect(recordRagGap).toHaveBeenCalled();
  });
});

describe("events_request", () => {
  test("prefers verified Victorian events over the general events agent", async () => {
    classifyAs("events_request");
    const eventSource = {
      id: "1",
      title: "Session",
      url: "https://x.test",
      chunkId: "vic-events:e1",
    };
    vi.mocked(runVictoriaEventsAgent).mockResolvedValue({
      context: "[1] Session",
      sources: [eventSource],
    });

    await collect({ userMessage: "any events", history: [], city: "Carlton" });

    expect(runEventsAgent).not.toHaveBeenCalled();
    const ctx = vi.mocked(runResponseAgent).mock.calls[0][0];
    expect(ctx.groundingContext).toContain("Verified upcoming Victorian events");
    expect(ctx.groundingSources).toEqual([eventSource]);
  });

  test("falls through to the existing events agent when the MCP has nothing", async () => {
    classifyAs("events_request");
    vi.mocked(runVictoriaEventsAgent).mockResolvedValue(MCP_SILENT);
    vi.mocked(runEventsAgent).mockResolvedValue({
      eventsContext: "[1] Some event",
      eventsSources: [{ id: "1", title: "Some event", chunkId: "events:https://x.test" }],
    });

    await collect({ userMessage: "any events", history: [], city: "Carlton" });

    expect(runEventsAgent).toHaveBeenCalled();
    expect(vi.mocked(runResponseAgent).mock.calls[0][0].groundingContext).toContain(
      "Upcoming events"
    );
  });

  test("a non-Victorian events request is unaffected by the MCP", async () => {
    classifyAs("events_request");
    vi.mocked(runVictoriaEventsAgent).mockResolvedValue({ ...MCP_SILENT, outsideVictoria: true });
    vi.mocked(runEventsAgent).mockResolvedValue({
      eventsContext: "[1] Sydney event",
      eventsSources: [{ id: "1", title: "Sydney event", chunkId: "events:https://x.test" }],
    });

    await collect({ userMessage: "any events", history: [], city: "Sydney" });

    expect(runEventsAgent).toHaveBeenCalled();
  });
});

describe("general_chat is untouched by the MCP", () => {
  test("consults no MCP tool", async () => {
    classifyAs("general_chat");

    await collect({ userMessage: "hello", history: [] });

    expect(runVictoriaHealthAgent).not.toHaveBeenCalled();
    expect(runVictoriaServicesAgent).not.toHaveBeenCalled();
    expect(runVictoriaEventsAgent).not.toHaveBeenCalled();
    expect(runResponseAgent).toHaveBeenCalled();
  });
});
