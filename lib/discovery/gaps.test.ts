// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";
import { listRecentGaps } from "./gaps";

// Two tables are read: analytics_events (the gap events) and
// knowledge_candidates (to compute "addressed"). The fake branches on table.
function fakeAdmin(gapRows: unknown[], candRows: unknown[], opts: { gapErr?: unknown } = {}) {
  const analytics = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: gapRows, error: opts.gapErr ?? null }),
        }),
      }),
    }),
  };
  const candidates = {
    select: vi.fn().mockResolvedValue({ data: candRows, error: null }),
  };
  const from = vi.fn((table: string) => (table === "analytics_events" ? analytics : candidates));
  return { client: { from }, from };
}

describe("listRecentGaps", () => {
  beforeEach(() => vi.clearAllMocks());

  test("maps rows, defaults source to user, and flags addressed via gap_refs", async () => {
    const gapRows = [
      {
        id: "g1",
        payload: { question: "what is hpv?", top_score: 0.4 },
        created_at: "2026-06-20T00:00:00Z",
      },
      {
        id: "g2",
        payload: { question: "booster timing?", top_score: 0, source: "manual" },
        created_at: "2026-06-21T00:00:00Z",
      },
    ];
    const candRows = [{ gap_refs: ["g1"] }];
    const { client, from } = fakeAdmin(gapRows, candRows);

    const out = await listRecentGaps(client as never);

    expect(from).toHaveBeenCalledWith("analytics_events");
    expect(from).toHaveBeenCalledWith("knowledge_candidates");
    expect(out).toEqual([
      {
        id: "g1",
        question: "what is hpv?",
        topScore: 0.4,
        source: "user",
        createdAt: "2026-06-20T00:00:00Z",
        addressed: true,
      },
      {
        id: "g2",
        question: "booster timing?",
        topScore: 0,
        source: "manual",
        createdAt: "2026-06-21T00:00:00Z",
        addressed: false,
      },
    ]);
  });

  test("drops events with no usable question text", async () => {
    const gapRows = [{ id: "g3", payload: {}, created_at: "2026-06-22T00:00:00Z" }];
    const { client } = fakeAdmin(gapRows, []);
    const out = await listRecentGaps(client as never);
    expect(out).toEqual([]);
  });

  test("throws on a gap query error", async () => {
    const { client } = fakeAdmin([], [], { gapErr: { message: "boom" } });
    await expect(listRecentGaps(client as never)).rejects.toThrow("boom");
  });
});
