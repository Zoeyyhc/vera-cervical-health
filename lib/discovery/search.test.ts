// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { serpapiKey: "test-key" } }));

import { searchWeb } from "./search";

describe("searchWeb", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  test("maps organic_results to SearchResult[] and caps at max", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          organic_results: [
            { title: "A", link: "https://who.int/a", snippet: "sa" },
            { title: "B", link: "https://cdc.gov/b", snippet: "sb" },
          ],
        }),
        { status: 200 }
      )
    );

    const out = await searchWeb("hpv vaccine schedule", 1);

    expect(out).toEqual([{ title: "A", url: "https://who.int/a", snippet: "sa" }]);
  });

  test("returns [] for an empty query without calling fetch", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    expect(await searchWeb("   ", 5)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("returns [] on non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    expect(await searchWeb("q", 5)).toEqual([]);
  });

  test("returns [] when fetch throws", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    expect(await searchWeb("q", 5)).toEqual([]);
  });

  test("skips results missing title or link", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          organic_results: [
            { title: "", link: "https://who.int/a", snippet: "s" },
            { title: "B", snippet: "s" },
            { title: "C", link: "https://cdc.gov/c", snippet: "" },
          ],
        }),
        { status: 200 }
      )
    );
    const out = await searchWeb("q", 5);
    expect(out).toEqual([{ title: "C", url: "https://cdc.gov/c", snippet: "" }]);
  });
});
