// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./llm", () => ({ runDiscoveryLlm: vi.fn() }));

import { runDiscoveryLlm } from "./llm";
import { scoreAuthority } from "./score-authority";

const result = (url: string) => ({ title: "T", url, snippet: "S" });

describe("scoreAuthority", () => {
  beforeEach(() => vi.clearAllMocks());

  test("denylisted host scores authority 0 without calling the LLM", async () => {
    const s = await scoreAuthority(result("https://www.reddit.com/r/x"));
    expect(s.authorityScore).toBe(0);
    expect(runDiscoveryLlm).not.toHaveBeenCalled();
  });

  test("allowlisted host floors authority at 0.95, keeps LLM relevance", async () => {
    vi.mocked(runDiscoveryLlm).mockResolvedValue(
      JSON.stringify({ authority: 0.4, relevance: 0.8 })
    );
    const s = await scoreAuthority(result("https://www.who.int/hpv"));
    expect(s.authorityScore).toBe(0.95);
    expect(s.relevanceScore).toBe(0.8);
  });

  test("non-listed host uses LLM authority + relevance", async () => {
    vi.mocked(runDiscoveryLlm).mockResolvedValue(
      JSON.stringify({ authority: 0.7, relevance: 0.6 })
    );
    const s = await scoreAuthority(result("https://someclinic.example/hpv"));
    expect(s).toEqual({ authorityScore: 0.7, relevanceScore: 0.6 });
  });

  test("unparseable LLM output → zero scores", async () => {
    vi.mocked(runDiscoveryLlm).mockResolvedValue("nope");
    const s = await scoreAuthority(result("https://someclinic.example/hpv"));
    expect(s).toEqual({ authorityScore: 0, relevanceScore: 0 });
  });

  test("invalid url → zero scores, no LLM call", async () => {
    const s = await scoreAuthority(result("not a url"));
    expect(s).toEqual({ authorityScore: 0, relevanceScore: 0 });
    expect(runDiscoveryLlm).not.toHaveBeenCalled();
  });
});
