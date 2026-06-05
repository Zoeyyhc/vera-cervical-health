// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./llm", () => ({ runDiscoveryLlm: vi.fn() }));

import { runDiscoveryLlm } from "./llm";
import { mineGaps } from "./mine-gaps";

/** Minimal fake of the supabaseAdmin query chain mineGaps uses. */
function fakeAdmin(gapRows: unknown[], candidateRows: unknown[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === "analytics_events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockResolvedValue({ data: gapRows, error: null }),
        };
      }
      // knowledge_candidates
      return {
        select: vi.fn().mockResolvedValue({ data: candidateRows, error: null }),
      };
    }),
  };
}

describe("mineGaps", () => {
  beforeEach(() => vi.clearAllMocks());

  test("excludes already-addressed gap ids, clusters via LLM, caps at MAX_GAP_CLUSTERS", async () => {
    const gapRows = [
      { id: "g1", payload: { question: "hpv vaccine ages?", top_score: 0.2 } },
      { id: "g2", payload: { question: "is the jab safe?", top_score: 0.3 } },
      { id: "g3", payload: { question: "smear test pain?", top_score: 0.1 } },
    ];
    const candidateRows = [{ gap_refs: ["g3"] }]; // g3 already addressed
    vi.mocked(runDiscoveryLlm).mockResolvedValue(
      JSON.stringify([{ theme: "HPV vaccine", gapEventIds: ["g1", "g2"] }])
    );

    const clusters = await mineGaps(fakeAdmin(gapRows, candidateRows) as never);

    expect(clusters).toEqual([{ theme: "HPV vaccine", gapEventIds: ["g1", "g2"] }]);
    // The LLM saw only the un-addressed gaps (g1, g2), not g3.
    const userContent = vi.mocked(runDiscoveryLlm).mock.calls[0][1];
    expect(userContent).toContain("g1");
    expect(userContent).toContain("g2");
    expect(userContent).not.toContain("g3");
  });

  test("returns [] when there are no un-addressed gaps (no LLM call)", async () => {
    const clusters = await mineGaps(fakeAdmin([], []) as never);
    expect(clusters).toEqual([]);
    expect(runDiscoveryLlm).not.toHaveBeenCalled();
  });

  test("returns [] when the LLM output is not valid JSON", async () => {
    const gapRows = [{ id: "g1", payload: { question: "q", top_score: 0.2 } }];
    vi.mocked(runDiscoveryLlm).mockResolvedValue("not json");
    const clusters = await mineGaps(fakeAdmin(gapRows, []) as never);
    expect(clusters).toEqual([]);
  });
});
