// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./llm", () => ({ runDiscoveryLlm: vi.fn() }));

import { runDiscoveryLlm } from "./llm";
import { stageCandidate } from "./stage-candidate";

function fakeAdmin(insertResult: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(insertResult);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  return { client: { from: vi.fn().mockReturnValue({ insert }) }, insert };
}

const baseInput = {
  sourceUrl: "https://who.int/hpv",
  page: { title: "HPV", content: "HPV is common. Get screened." },
  scores: { authorityScore: 0.95, relevanceScore: 0.8 },
  gapEventIds: ["g1", "g2"],
  contentHash: "a".repeat(64),
};

describe("stageCandidate", () => {
  beforeEach(() => vi.clearAllMocks());

  test("summarizes, then inserts a pending candidate row and returns its id", async () => {
    vi.mocked(runDiscoveryLlm).mockResolvedValue(
      JSON.stringify({ summary: "About HPV.", tags: ["hpv-vaccine"] })
    );
    const { client, insert } = fakeAdmin({ data: { id: "cand-1" }, error: null });

    const id = await stageCandidate(client as never, baseInput);

    expect(id).toBe("cand-1");
    expect(insert).toHaveBeenCalledWith({
      source_url: "https://who.int/hpv",
      title: "HPV",
      raw_content: "HPV is common. Get screened.",
      summary: "About HPV.",
      authority_score: 0.95,
      relevance_score: 0.8,
      domain_tags: ["hpv-vaccine"],
      gap_refs: ["g1", "g2"],
      content_hash: "a".repeat(64),
      status: "pending",
    });
  });

  test("returns null on a unique-violation (already staged)", async () => {
    vi.mocked(runDiscoveryLlm).mockResolvedValue(JSON.stringify({ summary: "s", tags: [] }));
    const { client } = fakeAdmin({ data: null, error: { code: "23505", message: "dup" } });
    expect(await stageCandidate(client as never, baseInput)).toBeNull();
  });

  test("uses empty summary/tags when the LLM output can't be parsed", async () => {
    vi.mocked(runDiscoveryLlm).mockResolvedValue("nope");
    const { client, insert } = fakeAdmin({ data: { id: "cand-2" }, error: null });
    await stageCandidate(client as never, baseInput);
    const row = insert.mock.calls[0][0];
    expect(row.summary).toBe("");
    expect(row.domain_tags).toEqual([]);
  });
});
