// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./llm", () => ({ runDiscoveryLlm: vi.fn() }));

import { runDiscoveryLlm } from "./llm";
import { synthesizeQueries } from "./synthesize-queries";

describe("synthesizeQueries", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns the parsed query strings", async () => {
    vi.mocked(runDiscoveryLlm).mockResolvedValue(
      JSON.stringify(["hpv vaccine schedule guidelines", "hpv vaccine age recommendations"])
    );
    const out = await synthesizeQueries({ theme: "HPV vaccine", gapEventIds: ["g1"] });
    expect(out).toEqual([
      "hpv vaccine schedule guidelines",
      "hpv vaccine age recommendations",
    ]);
  });

  test("returns [] for an empty array (off-domain topic)", async () => {
    vi.mocked(runDiscoveryLlm).mockResolvedValue("[]");
    expect(await synthesizeQueries({ theme: "crypto prices", gapEventIds: ["g1"] })).toEqual([]);
  });

  test("returns [] on unparseable output and keeps only string entries", async () => {
    vi.mocked(runDiscoveryLlm).mockResolvedValueOnce("nope");
    expect(await synthesizeQueries({ theme: "x", gapEventIds: ["g1"] })).toEqual([]);

    vi.mocked(runDiscoveryLlm).mockResolvedValueOnce(JSON.stringify(["ok", 5, null]));
    expect(await synthesizeQueries({ theme: "x", gapEventIds: ["g1"] })).toEqual(["ok"]);
  });
});
