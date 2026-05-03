import { server } from "@/test-utils/server";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { fetchHealthNews } from "./news";

const NEWSAPI_URL = "https://newsapi.org/v2/everything";

describe("fetchHealthNews", () => {
  it("returns parsed articles on success", async () => {
    server.use(
      http.get(NEWSAPI_URL, () =>
        HttpResponse.json({
          status: "ok",
          articles: [
            {
              title: "HPV vaccine update",
              source: { name: "BBC Health" },
              url: "https://bbc.example/1",
              publishedAt: "2026-04-30T12:00:00Z",
              description: "summary",
            },
          ],
        })
      )
    );
    const articles = await fetchHealthNews({ query: "vaccine" });
    expect(articles).toHaveLength(1);
    expect(articles[0].source).toBe("BBC Health");
  });

  it("returns empty array on upstream failure (does not throw)", async () => {
    server.use(http.get(NEWSAPI_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(fetchHealthNews({})).resolves.toEqual([]);
  });

  it("returns empty array on empty upstream", async () => {
    server.use(http.get(NEWSAPI_URL, () => HttpResponse.json({ status: "ok", articles: [] })));
    await expect(fetchHealthNews({})).resolves.toEqual([]);
  });

  it("defaults max_results to 5", async () => {
    server.use(
      http.get(NEWSAPI_URL, () =>
        HttpResponse.json({
          status: "ok",
          articles: Array.from({ length: 10 }, (_, i) => ({
            title: `h${i}`,
            source: { name: "X" },
            url: `https://example.com/${i}`,
            publishedAt: "2026-04-30T12:00:00Z",
            description: null,
          })),
        })
      )
    );
    const articles = await fetchHealthNews({});
    expect(articles).toHaveLength(5);
  });
});
