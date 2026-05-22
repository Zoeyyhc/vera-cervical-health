// @vitest-environment node

import type { NewsArticle } from "@/lib/validations/news";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/tools/news", () => ({
  fetchHealthNews: vi.fn(),
}));

import { fetchHealthNews } from "@/lib/tools/news";
import { refineNewsQuery, runNewsAgent } from "./news-agent";

function article(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    title: "HPV vaccine update",
    source: "BBC Health",
    url: "https://bbc.example/1",
    published_at: "2026-04-30T12:00:00Z",
    description: "summary",
    ...overrides,
  };
}

describe("runNewsAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchHealthNews).mockResolvedValue([]);
  });

  test("calls fetchHealthNews with refined query and max_results=5", async () => {
    await runNewsAgent({ userMessage: "Show me the latest cervical health news." });

    expect(fetchHealthNews).toHaveBeenCalledTimes(1);
    expect(fetchHealthNews).toHaveBeenCalledWith({
      query: "cervical health",
      max_results: 5,
    });
  });

  test("returns empty newsContext and empty newsSources when tool returns []", async () => {
    vi.mocked(fetchHealthNews).mockResolvedValue([]);

    const result = await runNewsAgent({ userMessage: "anything" });

    expect(result).toEqual({ newsContext: "", newsSources: [] });
  });

  test("formats a single article with [1] marker, title, source, date", async () => {
    vi.mocked(fetchHealthNews).mockResolvedValue([
      article({
        title: "HPV vaccine update",
        source: "BBC Health",
        url: "https://bbc.example/1",
        published_at: "2026-04-30T12:00:00Z",
      }),
    ]);

    const result = await runNewsAgent({ userMessage: "news?" });

    expect(result.newsContext).toContain("[1]");
    expect(result.newsContext).toContain("HPV vaccine update");
    expect(result.newsContext).toContain("BBC Health");
    expect(result.newsContext).toContain("2026-04-30");
    expect(result.newsSources).toEqual([
      {
        id: "1",
        title: "HPV vaccine update",
        url: "https://bbc.example/1",
        chunkId: "news:https://bbc.example/1",
      },
    ]);
  });

  test("formats multiple articles with sequential markers", async () => {
    vi.mocked(fetchHealthNews).mockResolvedValue([
      article({ title: "A", url: "https://a.com", source: "S1" }),
      article({ title: "B", url: "https://b.com", source: "S2" }),
      article({ title: "C", url: "https://c.com", source: "S3" }),
    ]);

    const result = await runNewsAgent({ userMessage: "news" });

    expect(result.newsContext).toMatch(/\[1\][\s\S]*\[2\][\s\S]*\[3\]/);
    expect(result.newsSources.map((s) => s.id)).toEqual(["1", "2", "3"]);
    expect(result.newsSources.map((s) => s.title)).toEqual(["A", "B", "C"]);
  });

  test("separates multiple articles with blank lines for response-agent grounding", async () => {
    vi.mocked(fetchHealthNews).mockResolvedValue([
      article({ title: "A", url: "https://a.com" }),
      article({ title: "B", url: "https://b.com" }),
    ]);

    const result = await runNewsAgent({ userMessage: "news" });

    expect(result.newsContext).toContain("\n\n");
  });

  test("never throws when tool resolves with malformed data — degrades to empty", async () => {
    // Tool itself never throws (per #63), but if it ever does, runNewsAgent must
    // still return a valid empty result rather than propagating.
    vi.mocked(fetchHealthNews).mockRejectedValueOnce(new Error("boom"));

    await expect(runNewsAgent({ userMessage: "x" })).resolves.toEqual({
      newsContext: "",
      newsSources: [],
    });
  });

  test("uses url as the chunkId so citation chips can dedupe across turns", async () => {
    vi.mocked(fetchHealthNews).mockResolvedValue([
      article({ url: "https://example.com/article-42" }),
    ]);

    const result = await runNewsAgent({ userMessage: "x" });

    expect(result.newsSources[0].chunkId).toBe("news:https://example.com/article-42");
  });

  test("includes article description in context when present", async () => {
    vi.mocked(fetchHealthNews).mockResolvedValue([
      article({ title: "T", description: "useful summary line" }),
    ]);

    const result = await runNewsAgent({ userMessage: "x" });

    expect(result.newsContext).toContain("useful summary line");
  });

  test("omits description gracefully when null", async () => {
    vi.mocked(fetchHealthNews).mockResolvedValue([article({ title: "T", description: null })]);

    const result = await runNewsAgent({ userMessage: "x" });

    // No crash, no literal "null" leaking into the prompt
    expect(result.newsContext).not.toContain("null");
    expect(result.newsContext).toContain("T");
  });
});

describe("refineNewsQuery", () => {
  test("strips conversational filler from the button prompt", () => {
    expect(refineNewsQuery("Show me the latest cervical health news.")).toBe("cervical health");
  });

  test("strips filler from a typed natural query", () => {
    expect(refineNewsQuery("What's the latest news on HPV?")).toBe("hpv");
  });

  test("preserves specific multi-word terms", () => {
    expect(refineNewsQuery("HPV vaccine recall")).toBe("hpv vaccine recall");
  });

  test("preserves apostrophes inside contractions", () => {
    expect(refineNewsQuery("Show me women's health news.")).toBe("women's health");
  });

  test("returns empty when only noise words are present (search-news falls back to domain)", () => {
    expect(refineNewsQuery("Show me the latest news.")).toBe("");
  });

  test("handles empty input", () => {
    expect(refineNewsQuery("")).toBe("");
  });

  test("normalises case so NewsAPI search is consistent", () => {
    expect(refineNewsQuery("Cervical CANCER")).toBe("cervical cancer");
  });
});
