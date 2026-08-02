// @vitest-environment node

import { describe, expect, test, vi } from "vitest";
import { listVictoriaVerifiedEvents } from "./events";

/**
 * Spec §5.3 and acceptance criterion 3: an event appears only after admin
 * approval, and no longer appears after expiration.
 */

type Row = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  expires_at: string | null;
  location_label: string;
  format: string;
  registration_url: string;
  source_url: string;
  reviewed_at: string | null;
  topic: string | null;
  trusted_sources: { id: string; organisation: string };
};

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "e1",
    name: "Cervical screening information session",
    starts_at: "2026-09-01T10:00:00+10:00",
    ends_at: "2026-09-01T12:00:00+10:00",
    expires_at: "2026-09-01T12:00:00+10:00",
    location_label: "Carlton 3053",
    format: "in_person",
    registration_url: "https://www.cancervic.org.au/register",
    source_url: "https://www.cancervic.org.au/event",
    reviewed_at: "2026-08-01T00:00:00Z",
    topic: "cervical_screening",
    trusted_sources: { id: "src-ccv", organisation: "Cancer Council Victoria" },
    ...overrides,
  };
}

/** Chainable stub; `limit` resolves. Records every filter for assertions. */
function mockSupabase(rows: Row[], error: { message: string } | null = null) {
  const calls: Array<[string, unknown, unknown]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "contains", "gte", "order"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, args[0], args[1]]);
      return builder;
    });
  }
  builder.limit = vi.fn((...args: unknown[]) => {
    calls.push(["limit", args[0], undefined]);
    return Promise.resolve({ data: rows, error });
  });
  return { supabase: { from: vi.fn(() => builder) }, calls };
}

const NOW = new Date("2026-08-03T00:00:00Z");

describe("listVictoriaVerifiedEvents", () => {
  test("maps an approved event to the full output contract", async () => {
    const { supabase } = mockSupabase([row()]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    const result = await listVictoriaVerifiedEvents(supabase as any, {}, NOW);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      id: "e1",
      name: "Cervical screening information session",
      startsAt: "2026-09-01T10:00:00+10:00",
      endsAt: "2026-09-01T12:00:00+10:00",
      locationLabel: "Carlton 3053",
      format: "in_person",
      organiser: "Cancer Council Victoria",
      registrationUrl: "https://www.cancervic.org.au/register",
      sourceUrl: "https://www.cancervic.org.au/event",
      verification: "manually_curated",
      reviewedAt: "2026-08-01T00:00:00Z",
      expiresAt: "2026-09-01T12:00:00+10:00",
    });
    expect(result.sourceIds).toEqual(["src-ccv"]);
  });

  test("only requests approved events from still-approved organisers", async () => {
    const { supabase, calls } = mockSupabase([]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    await listVictoriaVerifiedEvents(supabase as any, {}, NOW);

    expect(calls).toContainEqual(["eq", "status", "approved"]);
    expect(calls).toContainEqual(["eq", "trusted_sources.status", "approved"]);
    expect(calls).toContainEqual(["contains", "trusted_sources.permitted_content", ["events"]]);
  });

  test("excludes anything already expired, relative to now", async () => {
    const { supabase, calls } = mockSupabase([]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    await listVictoriaVerifiedEvents(supabase as any, {}, NOW);

    const expiryBounds = calls.filter((c) => c[0] === "gte" && c[1] === "expires_at");
    expect(expiryBounds).toContainEqual(["gte", "expires_at", NOW.toISOString()]);
  });

  test("defaults the window to today in Melbourne, not UTC", async () => {
    // 22:00Z on the 3rd is already the 4th in Melbourne.
    const { supabase, calls } = mockSupabase([]);

    await listVictoriaVerifiedEvents(
      // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
      supabase as any,
      {},
      new Date("2026-08-03T22:00:00Z")
    );

    expect(calls).toContainEqual(["gte", "expires_at", "2026-08-04T00:00:00+10:00"]);
  });

  test("honours an explicit fromDate", async () => {
    const { supabase, calls } = mockSupabase([]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    await listVictoriaVerifiedEvents(supabase as any, { fromDate: "2026-10-01" }, NOW);

    expect(calls).toContainEqual(["gte", "expires_at", "2026-10-01T00:00:00+10:00"]);
  });

  test("caps at five and orders by start date", async () => {
    const { supabase, calls } = mockSupabase([]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    await listVictoriaVerifiedEvents(supabase as any, {}, NOW);

    expect(calls).toContainEqual(["limit", 5, undefined]);
    expect(calls).toContainEqual(["order", "starts_at", { ascending: true }]);
  });

  test("filters by topic when supplied", async () => {
    const { supabase, calls } = mockSupabase([]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    await listVictoriaVerifiedEvents(supabase as any, { topic: "hpv_vaccination" }, NOW);

    expect(calls).toContainEqual(["eq", "topic", "hpv_vaccination"]);
  });

  test("returns outside_victoria without querying for a non-Victorian location", async () => {
    const { supabase } = mockSupabase([row()]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    const result = await listVictoriaVerifiedEvents(supabase as any, { location: "Sydney" }, NOW);

    expect(result.events).toEqual([]);
    expect(result.noResultReason).toBe("outside_victoria");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test("allows a missing location — statewide and online events have none", async () => {
    const { supabase } = mockSupabase([row({ format: "online", location_label: "Online" })]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    const result = await listVictoriaVerifiedEvents(supabase as any, {}, NOW);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].format).toBe("online");
  });

  test("omits endsAt when the event has none", async () => {
    const { supabase } = mockSupabase([
      row({ ends_at: null, expires_at: "2026-09-01T10:00:00+10:00" }),
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    const { events } = await listVictoriaVerifiedEvents(supabase as any, {}, NOW);

    expect(events[0].endsAt).toBeUndefined();
    expect(events[0].expiresAt).toBe("2026-09-01T10:00:00+10:00");
  });

  test("skips an event with no reviewer attestation", async () => {
    const { supabase } = mockSupabase([row({ reviewed_at: null })]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    const result = await listVictoriaVerifiedEvents(supabase as any, {}, NOW);

    expect(result.events).toEqual([]);
    expect(result.noResultReason).toBe("no_upcoming_events");
  });

  test("reports no_upcoming_events for an empty result", async () => {
    const { supabase } = mockSupabase([]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    const result = await listVictoriaVerifiedEvents(supabase as any, {}, NOW);

    expect(result).toEqual({ events: [], noResultReason: "no_upcoming_events", sourceIds: [] });
  });

  test("propagates a query error", async () => {
    const { supabase } = mockSupabase([], { message: "db down" });

    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
      listVictoriaVerifiedEvents(supabase as any, {}, NOW)
    ).rejects.toThrow("db down");
  });
});
