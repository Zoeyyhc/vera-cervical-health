// @vitest-environment node

import type { HealthEvent } from "@/lib/validations/events";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/tools/events", () => ({
  findHealthEvents: vi.fn(),
}));

import { findHealthEvents } from "@/lib/tools/events";
import { runEventsAgent } from "./events-agent";

function ev(overrides: Partial<HealthEvent> = {}): HealthEvent {
  return {
    name: "Women's Health Fair",
    date: "Sat, May 10, 2026",
    location: "Sydney NSW",
    url: "https://example.com/event-1",
    description: "Free screenings",
    ...overrides,
  };
}

describe("runEventsAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findHealthEvents).mockResolvedValue({ status: "no_results" });
  });

  test("calls findHealthEvents with caller-provided city as location", async () => {
    await runEventsAgent({ userMessage: "any health events?", city: "Sydney" });

    expect(findHealthEvents).toHaveBeenCalledTimes(1);
    expect(findHealthEvents).toHaveBeenCalledWith({
      location: "Sydney",
      query: "any health events?",
      max_results: 5,
    });
  });

  test("extracts location from userMessage when city not provided", async () => {
    await runEventsAgent({ userMessage: "screening events in Melbourne next week?" });

    expect(findHealthEvents).toHaveBeenCalledWith(
      expect.objectContaining({ location: "Melbourne" })
    );
  });

  test("supports 'near <Place>' phrasing", async () => {
    await runEventsAgent({ userMessage: "any HPV events near Brisbane this month" });

    expect(findHealthEvents).toHaveBeenCalledWith(
      expect.objectContaining({ location: "Brisbane" })
    );
  });

  test("prefers city over a location mentioned in userMessage", async () => {
    await runEventsAgent({
      userMessage: "events in Melbourne?",
      city: "Sydney",
    });

    expect(findHealthEvents).toHaveBeenCalledWith(expect.objectContaining({ location: "Sydney" }));
  });

  test("returns needsLocation=true and empty result when neither city nor extractable location", async () => {
    const result = await runEventsAgent({ userMessage: "any health events soon?" });

    expect(findHealthEvents).not.toHaveBeenCalled();
    expect(result).toEqual({
      eventsContext: "",
      eventsSources: [],
      needsLocation: true,
    });
  });

  test("returns empty result when tool returns no_results", async () => {
    vi.mocked(findHealthEvents).mockResolvedValue({ status: "no_results" });

    const result = await runEventsAgent({ userMessage: "x", city: "Sydney" });

    expect(result).toEqual({ eventsContext: "", eventsSources: [] });
    expect(result).not.toHaveProperty("needsLocation", true);
    expect(result).not.toHaveProperty("unavailable", true);
  });

  test("returns unavailable=true when tool returns upstream_unavailable", async () => {
    vi.mocked(findHealthEvents).mockResolvedValue({ status: "upstream_unavailable" });

    const result = await runEventsAgent({ userMessage: "x", city: "Sydney" });

    expect(result).toEqual({ eventsContext: "", eventsSources: [], unavailable: true });
  });

  test("formats a single event with [1] marker, name, date, location", async () => {
    vi.mocked(findHealthEvents).mockResolvedValue({
      status: "ok",
      events: [
        ev({
          name: "Women's Health Fair",
          date: "Sat, May 10, 2026",
          location: "Town Hall, Sydney NSW",
          url: "https://example.com/1",
        }),
      ],
    });

    const result = await runEventsAgent({ userMessage: "x", city: "Sydney" });

    expect(result.eventsContext).toContain("[1]");
    expect(result.eventsContext).toContain("Women's Health Fair");
    expect(result.eventsContext).toContain("Sat, May 10, 2026");
    expect(result.eventsContext).toContain("Town Hall, Sydney NSW");
    expect(result.eventsSources).toEqual([
      {
        id: "1",
        title: "Women's Health Fair",
        url: "https://example.com/1",
        chunkId: "events:https://example.com/1",
      },
    ]);
  });

  test("formats multiple events with sequential markers and blank-line separators", async () => {
    vi.mocked(findHealthEvents).mockResolvedValue({
      status: "ok",
      events: [
        ev({ name: "A", url: "https://a.com" }),
        ev({ name: "B", url: "https://b.com" }),
        ev({ name: "C", url: "https://c.com" }),
      ],
    });

    const result = await runEventsAgent({ userMessage: "x", city: "Sydney" });

    expect(result.eventsContext).toMatch(/\[1\][\s\S]*\[2\][\s\S]*\[3\]/);
    expect(result.eventsContext).toContain("\n\n");
    expect(result.eventsSources.map((s) => s.id)).toEqual(["1", "2", "3"]);
  });

  test("includes description when present", async () => {
    vi.mocked(findHealthEvents).mockResolvedValue({
      status: "ok",
      events: [ev({ description: "Free screenings and Q&A" })],
    });

    const result = await runEventsAgent({ userMessage: "x", city: "Sydney" });

    expect(result.eventsContext).toContain("Free screenings and Q&A");
  });

  test("omits description gracefully when null", async () => {
    vi.mocked(findHealthEvents).mockResolvedValue({
      status: "ok",
      events: [ev({ description: null, name: "T" })],
    });

    const result = await runEventsAgent({ userMessage: "x", city: "Sydney" });

    expect(result.eventsContext).not.toContain("null");
    expect(result.eventsContext).toContain("T");
  });

  test("uses url-keyed chunkId for citation deduplication", async () => {
    vi.mocked(findHealthEvents).mockResolvedValue({
      status: "ok",
      events: [ev({ url: "https://x.com/event-42" })],
    });

    const result = await runEventsAgent({ userMessage: "x", city: "Sydney" });

    expect(result.eventsSources[0].chunkId).toBe("events:https://x.com/event-42");
  });

  test("never throws — degrades to unavailable when tool unexpectedly throws", async () => {
    vi.mocked(findHealthEvents).mockRejectedValueOnce(new Error("boom"));

    await expect(runEventsAgent({ userMessage: "x", city: "Sydney" })).resolves.toEqual({
      eventsContext: "",
      eventsSources: [],
      unavailable: true,
    });
  });

  test("trims whitespace-only city and falls back to extraction", async () => {
    await runEventsAgent({ userMessage: "events in Perth", city: "   " });

    expect(findHealthEvents).toHaveBeenCalledWith(expect.objectContaining({ location: "Perth" }));
  });
});
