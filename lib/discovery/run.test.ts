// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./mine-gaps", () => ({ mineGaps: vi.fn() }));
vi.mock("./synthesize-queries", () => ({ synthesizeQueries: vi.fn() }));
vi.mock("./search", () => ({ searchWeb: vi.fn() }));
vi.mock("./score-authority", () => ({ scoreAuthority: vi.fn() }));
vi.mock("./fetch-extract", () => ({ fetchAndExtract: vi.fn() }));
vi.mock("./dedup", () => ({ checkDuplicate: vi.fn() }));
vi.mock("./stage-candidate", () => ({ stageCandidate: vi.fn() }));

import { checkDuplicate } from "./dedup";
import { fetchAndExtract } from "./fetch-extract";
import { mineGaps } from "./mine-gaps";
import { runDiscovery } from "./run";
import { scoreAuthority } from "./score-authority";
import { searchWeb } from "./search";
import { stageCandidate } from "./stage-candidate";
import { synthesizeQueries } from "./synthesize-queries";

/** Fake discovery_runs row lifecycle: insert→select→single returns an id; update resolves. */
function fakeAdmin() {
  const single = vi.fn().mockResolvedValue({ data: { id: "run-1" }, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  return {
    client: { from: vi.fn().mockReturnValue({ insert, update }) },
    insert,
    update,
  };
}

describe("runDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mineGaps).mockResolvedValue([{ theme: "HPV", gapEventIds: ["g1"] }]);
    vi.mocked(synthesizeQueries).mockResolvedValue(["hpv vaccine schedule"]);
    vi.mocked(searchWeb).mockResolvedValue([
      { title: "T", url: "https://who.int/a", snippet: "s" },
    ]);
    vi.mocked(scoreAuthority).mockResolvedValue({ authorityScore: 0.95, relevanceScore: 0.8 });
    vi.mocked(fetchAndExtract).mockResolvedValue({ title: "T", content: "C" });
    vi.mocked(checkDuplicate).mockResolvedValue({ duplicate: false, contentHash: "h" });
    vi.mocked(stageCandidate).mockResolvedValue("cand-1");
  });

  test("happy path: stages a candidate and returns counts", async () => {
    const { client, insert, update } = fakeAdmin();

    const res = await runDiscovery(client as never, { trigger: "cron" });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "cron", status: "running" })
    );
    expect(stageCandidate).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ sourceUrl: "https://who.int/a", gapEventIds: ["g1"] })
    );
    expect(res).toEqual({ runId: "run-1", gapsProcessed: 1, candidatesStaged: 1 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", gaps_processed: 1, candidates_staged: 1 })
    );
  });

  test("drops results below the authority floor (no fetch/stage)", async () => {
    vi.mocked(scoreAuthority).mockResolvedValue({ authorityScore: 0.3, relevanceScore: 0.9 });
    const { client } = fakeAdmin();

    const res = await runDiscovery(client as never, { trigger: "manual" });

    expect(fetchAndExtract).not.toHaveBeenCalled();
    expect(stageCandidate).not.toHaveBeenCalled();
    expect(res.candidatesStaged).toBe(0);
  });

  test("skips duplicates", async () => {
    vi.mocked(checkDuplicate).mockResolvedValue({ duplicate: true, contentHash: "h" });
    const { client } = fakeAdmin();
    const res = await runDiscovery(client as never, { trigger: "cron" });
    expect(stageCandidate).not.toHaveBeenCalled();
    expect(res.candidatesStaged).toBe(0);
  });

  test("marks the run failed when a stage throws", async () => {
    vi.mocked(mineGaps).mockRejectedValue(new Error("boom"));
    const { client, update } = fakeAdmin();

    await expect(runDiscovery(client as never, { trigger: "cron" })).rejects.toThrow("boom");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  test("stops before staging when the time budget is already exhausted", async () => {
    const { client } = fakeAdmin();
    // budgetMs 0 → deadline == now, so the per-result guard trips immediately.
    const res = await runDiscovery(client as never, { trigger: "cron", budgetMs: 0 });
    expect(stageCandidate).not.toHaveBeenCalled();
    expect(res.candidatesStaged).toBe(0);
  });
});
