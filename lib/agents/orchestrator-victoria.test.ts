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
  EVENTS_NEEDS_LOCATION_FALLBACK,
  EVENTS_OUTSIDE_VICTORIA_FALLBACK,
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

/** A state-bearing fix is what confirms a location; a bare suburb is not. */
const VIC_FIX = { suburb: "Melbourne", state: "VIC", postcode: "3000" };
const NSW_FIX = { suburb: "Sydney", state: "NSW", postcode: "2000" };

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

    await collect({ userMessage: "where can I get screened in glen waverley", history: [] });

    const ctx = vi.mocked(runResponseAgent).mock.calls[0][0];
    expect(ctx.groundingContext).toContain("Approved Victorian screening-service directories");
    expect(ctx.groundingSources).toEqual([VIC_SOURCE]);
  });

  test("asks for a location when the turn names none, without calling the MCP", async () => {
    classifyAs("services_request");

    const chunks = await collect({ userMessage: "where can I get screened", history: [] });

    expect(chunks[0]).toEqual({ type: "text", text: SERVICES_NEEDS_LOCATION_FALLBACK });
    expect(runVictoriaServicesAgent).not.toHaveBeenCalled();
    expect(runResponseAgent).not.toHaveBeenCalled();
  });

  test("refuses to guess a suburb name that another state also uses", async () => {
    classifyAs("services_request");

    const chunks = await collect({
      userMessage: "where can I get screened in burwood",
      history: [],
    });

    const text = chunks[0];
    expect(text.type).toBe("text");
    if (text.type === "text") {
      expect(text.text).toContain("Burwood");
      expect(text.text).toContain("New South Wales");
      expect(text.text).toContain("Victoria");
    }
    // The whole point: no tool call happens on a guess.
    expect(runVictoriaServicesAgent).not.toHaveBeenCalled();
    expect(runResponseAgent).not.toHaveBeenCalled();
  });

  test("accepts a shared suburb name once the state is given", async () => {
    classifyAs("services_request");
    vi.mocked(runVictoriaServicesAgent).mockResolvedValue({
      context: "[1] healthdirect …",
      sources: [VIC_SOURCE],
    });

    await collect({ userMessage: "where can I get screened in burwood vic", history: [] });

    expect(runVictoriaServicesAgent).toHaveBeenCalledWith(
      expect.objectContaining({ location: "burwood" })
    );
  });

  test("explains the Victorian scope instead of widening the search", async () => {
    classifyAs("services_request");

    const chunks = await collect({
      userMessage: "clinics near me",
      history: [],
      geo: { suburb: "Bondi", state: "NSW", postcode: "2026" },
    });

    expect(chunks).toEqual([{ type: "text", text: SERVICES_OUTSIDE_VICTORIA_FALLBACK }]);
    expect(runVictoriaServicesAgent).not.toHaveBeenCalled();
  });

  test("falls back to a static message when the MCP is unavailable", async () => {
    classifyAs("services_request");
    vi.mocked(runVictoriaServicesAgent).mockResolvedValue(MCP_SILENT);

    const chunks = await collect({ userMessage: "clinics in glen waverley", history: [] });

    expect(chunks[0]).toEqual({ type: "text", text: SERVICES_EMPTY_FALLBACK });
  });

  test("bridges a bare postcode reply to the location prompt", async () => {
    classifyAs("general_chat");
    vi.mocked(runVictoriaServicesAgent).mockResolvedValue({
      context: "[1] healthdirect …",
      sources: [VIC_SOURCE],
    });

    await collect({
      userMessage: "3053",
      history: [
        {
          role: "assistant",
          content: SERVICES_NEEDS_LOCATION_FALLBACK,
          pendingAction: { kind: "find_services", awaiting: "location" },
        },
      ],
    });

    expect(runVictoriaServicesAgent).toHaveBeenCalledWith(
      expect.objectContaining({ location: "3053" })
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
      expect.objectContaining({ location: "burwood east" })
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

    await collect({ userMessage: "when should I screen", history: [], geo: VIC_FIX });

    const ctx = vi.mocked(runResponseAgent).mock.calls[0][0];
    expect(ctx.groundingContext).toBe("[1] governed excerpt");
    expect(ctx.groundingSources).toEqual([mcpSource]);
  });

  test("uses plain RAG when the MCP returns nothing", async () => {
    classifyAs("health_question");
    vi.mocked(runVictoriaHealthAgent).mockResolvedValue(MCP_SILENT);

    await collect({ userMessage: "when should I screen", history: [], geo: VIC_FIX });

    expect(vi.mocked(runResponseAgent).mock.calls[0][0].groundingContext).toBe("rag");
  });

  test("does not consult the MCP for a non-Victorian turn", async () => {
    classifyAs("health_question");

    await collect({ userMessage: "when should I screen", history: [], geo: NSW_FIX });

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
    await collect({ userMessage: "obscure question", history: [], geo: VIC_FIX });

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

    await collect({ userMessage: "any events in glen waverley", history: [] });

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

    await collect({ userMessage: "any events in glen waverley", history: [] });

    expect(runEventsAgent).toHaveBeenCalled();
    expect(vi.mocked(runResponseAgent).mock.calls[0][0].groundingContext).toContain(
      "Upcoming events"
    );
  });

  test("a statewide question may be answered without knowing the user's suburb", async () => {
    classifyAs("events_request");
    vi.mocked(runVictoriaEventsAgent).mockResolvedValue({
      context: "[1] Statewide session",
      sources: [{ id: "1", title: "Statewide session", chunkId: "vic-events:e2" }],
    });

    await collect({ userMessage: "what health events are on in victoria?", history: [] });

    // No location: that is precisely what a statewide query asks the MCP for.
    expect(runVictoriaEventsAgent).toHaveBeenCalledWith({
      userMessage: "what health events are on in victoria?",
    });
  });

  test("explains the Victorian scope rather than reporting an empty search", async () => {
    // The old path ignored outsideVictoria, fell through to SerpAPI, and
    // rendered its empty result as "I couldn't find any upcoming health events
    // for that location" — a sentence about a search that was never run for
    // this user. Say what is actually true instead.
    classifyAs("events_request");

    const chunks = await collect({ userMessage: "any events in sydney nsw", history: [] });

    expect(chunks).toEqual([{ type: "text", text: EVENTS_OUTSIDE_VICTORIA_FALLBACK }]);
    expect(runVictoriaEventsAgent).not.toHaveBeenCalled();
    expect(runEventsAgent).not.toHaveBeenCalled();
  });

  test.each(["any events in burwood", "any events in richmond"])(
    "refuses to guess the state for %s, and calls nothing",
    async (userMessage) => {
      classifyAs("events_request");

      const chunks = await collect({ userMessage, history: [] });

      const text = chunks[0];
      expect(text.type).toBe("text");
      if (text.type === "text") expect(text.text).toContain("postcode");
      expect(runVictoriaEventsAgent).not.toHaveBeenCalled();
      expect(runEventsAgent).not.toHaveBeenCalled();
    }
  );

  test("asks the browser before asking the user, on a nearby question", async () => {
    classifyAs("events_request");

    const chunks = await collect({ userMessage: "any events near me?", history: [] });

    // Nothing is said and nothing is searched: the client raises the permission
    // prompt and resends the turn with whatever it resolves.
    expect(chunks).toEqual([
      {
        type: "pending_action",
        action: { kind: "find_events", awaiting: "location", scope: "nearby", geolocation: true },
      },
    ]);
    expect(runVictoriaEventsAgent).not.toHaveBeenCalled();
    expect(runEventsAgent).not.toHaveBeenCalled();
  });

  test("asks the user to type a suburb once the browser has failed", async () => {
    classifyAs("events_request");

    const chunks = await collect({
      userMessage: "any events near me?",
      history: [],
      geolocationAttempted: true,
    });

    // A denied or timed-out permission must never surface as "no events found".
    expect(chunks[0]).toEqual({ type: "text", text: EVENTS_NEEDS_LOCATION_FALLBACK });
    expect(runVictoriaEventsAgent).not.toHaveBeenCalled();
    expect(runEventsAgent).not.toHaveBeenCalled();
  });

  test("uses a Victorian fix from the browser on a nearby question", async () => {
    classifyAs("events_request");
    vi.mocked(runVictoriaEventsAgent).mockResolvedValue({
      context: "[1] Session",
      sources: [{ id: "1", title: "Session", chunkId: "vic-events:e1" }],
    });

    await collect({
      userMessage: "any events near me?",
      history: [],
      geo: { suburb: "Burwood", state: "VIC", postcode: "3125" },
      geolocationAttempted: true,
    });

    expect(runVictoriaEventsAgent).toHaveBeenCalledWith(
      expect.objectContaining({ location: "3125" })
    );
  });

  test("takes a typed state over a conflicting browser fix", async () => {
    classifyAs("events_request");

    const chunks = await collect({
      userMessage: "any events in burwood nsw",
      history: [],
      geo: { suburb: "Carlton", state: "VIC", postcode: "3053" },
    });

    expect(chunks).toEqual([{ type: "text", text: EVENTS_OUTSIDE_VICTORIA_FALLBACK }]);
  });

  test("resumes the events request from a pending action, not from the wording", async () => {
    classifyAs("general_chat");
    vi.mocked(runVictoriaEventsAgent).mockResolvedValue({
      context: "[1] Session",
      sources: [{ id: "1", title: "Session", chunkId: "vic-events:e1" }],
    });

    await collect({
      userMessage: "3151",
      history: [
        { role: "user", content: "any events near me?" },
        {
          role: "assistant",
          content: "some wording nothing in the codebase matches",
          pendingAction: { kind: "find_events", awaiting: "location", scope: "nearby" },
        },
      ],
    });

    expect(runVictoriaEventsAgent).toHaveBeenCalledWith(
      expect.objectContaining({ location: "3151" })
    );
  });

  test.each(["VIC", "Burwood Victoria", "burwood 3125"])(
    "resumes from the location reply %s",
    async (userMessage) => {
      classifyAs("general_chat");
      vi.mocked(runVictoriaEventsAgent).mockResolvedValue({
        context: "[1] Session",
        sources: [{ id: "1", title: "Session", chunkId: "vic-events:e1" }],
      });

      await collect({
        userMessage,
        history: [
          { role: "user", content: "any events near me?" },
          {
            role: "assistant",
            content: EVENTS_NEEDS_LOCATION_FALLBACK,
            pendingAction: { kind: "find_events", awaiting: "location", scope: "nearby" },
          },
        ],
      });

      expect(runVictoriaEventsAgent).toHaveBeenCalled();
    }
  );

  test("resumes from a location named inside a sentence, not just a bare reply", async () => {
    // Reported from manual testing: "I am in burwood east, 3151." is six words,
    // and a token count cannot tell it from "actually, tell me about HPV
    // instead". Counting words dropped it, so the turn fell to the classifier
    // and answered a different question than the one being resumed.
    classifyAs("general_chat");
    vi.mocked(runVictoriaEventsAgent).mockResolvedValue({
      context: "[1] Session",
      sources: [{ id: "1", title: "Session", chunkId: "vic-events:e1" }],
    });

    await collect({
      userMessage: "I am in burwood east, 3151.",
      history: [
        { role: "user", content: "any events near me?" },
        {
          role: "assistant",
          content: EVENTS_NEEDS_LOCATION_FALLBACK,
          pendingAction: { kind: "find_events", awaiting: "location", scope: "nearby" },
        },
      ],
    });

    expect(runVictoriaEventsAgent).toHaveBeenCalledWith(
      expect.objectContaining({ location: "3151" })
    );
  });

  test("a change of subject after the location prompt is not read as a location", async () => {
    classifyAs("general_chat");

    await collect({
      userMessage: "actually, tell me about HPV instead",
      history: [
        {
          role: "assistant",
          content: EVENTS_NEEDS_LOCATION_FALLBACK,
          pendingAction: { kind: "find_events", awaiting: "location", scope: "nearby" },
        },
      ],
    });

    expect(runVictoriaEventsAgent).not.toHaveBeenCalled();
    expect(runResponseAgent).toHaveBeenCalled();
  });

  test("an out-of-Victoria reply to the location prompt explains the scope", async () => {
    // Reported from manual testing: this answered "your message may have been
    // cut off" instead, because the pending action had been lost.
    classifyAs("general_chat");

    const chunks = await collect({
      userMessage: "Bondi East",
      history: [
        { role: "user", content: "any events near me?" },
        {
          role: "assistant",
          content: EVENTS_NEEDS_LOCATION_FALLBACK,
          pendingAction: { kind: "find_events", awaiting: "location", scope: "nearby" },
        },
      ],
    });

    expect(chunks).toEqual([{ type: "text", text: EVENTS_OUTSIDE_VICTORIA_FALLBACK }]);
    expect(runVictoriaEventsAgent).not.toHaveBeenCalled();
    expect(runEventsAgent).not.toHaveBeenCalled();
  });

  test("a resumed nearby request does not ask the browser again", async () => {
    classifyAs("general_chat");

    const chunks = await collect({
      userMessage: "burwood",
      history: [
        {
          role: "assistant",
          content: EVENTS_NEEDS_LOCATION_FALLBACK,
          pendingAction: { kind: "find_events", awaiting: "location", scope: "nearby" },
        },
      ],
    });

    // "burwood" is still ambiguous, so it asks which state — but it must not
    // re-open the geolocation prompt the user already dealt with.
    const text = chunks[0];
    expect(text.type).toBe("text");
    expect(chunks.some((c) => c.type === "pending_action" && c.action.geolocation)).toBe(false);
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
