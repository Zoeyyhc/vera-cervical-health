import { server } from "@/test-utils/server";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { searchNewsApi } from "./search-news";

const NEWSAPI_URL = "https://newsapi.org/v2/everything";

describe("searchNewsApi", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns up to max_results articles, normalized", async () => {
    server.use(
      http.get(NEWSAPI_URL, () => {
        return HttpResponse.json({
          status: "ok",
          articles: [
            {
              title: "HPV vaccine update",
              source: { id: null, name: "BBC Health" },
              url: "https://bbc.example/1",
              publishedAt: "2026-04-30T12:00:00Z",
              description: "summary",
            },
            {
              title: "Cervical screening reaches more women",
              source: { id: null, name: "Reuters" },
              url: "https://reuters.example/2",
              publishedAt: "2026-04-29T08:00:00Z",
              description: null,
            },
          ],
        });
      })
    );

    const articles = await searchNewsApi({ query: "vaccine", max_results: 5 });
    expect(articles).toHaveLength(2);
    expect(articles[0]).toEqual({
      title: "HPV vaccine update",
      source: "BBC Health",
      url: "https://bbc.example/1",
      published_at: "2026-04-30T12:00:00Z",
      description: "summary",
    });
    expect(articles[1].description).toBeNull();
  });

  it("respects max_results when upstream returns more", async () => {
    server.use(
      http.get(NEWSAPI_URL, () => {
        return HttpResponse.json({
          status: "ok",
          articles: Array.from({ length: 10 }, (_, i) => ({
            title: `headline ${i}`,
            source: { name: "X" },
            url: `https://example.com/${i}`,
            publishedAt: "2026-04-30T12:00:00Z",
            description: null,
          })),
        });
      })
    );

    const articles = await searchNewsApi({ max_results: 3 });
    expect(articles).toHaveLength(3);
  });

  it("returns empty array on empty upstream result", async () => {
    server.use(http.get(NEWSAPI_URL, () => HttpResponse.json({ status: "ok", articles: [] })));
    const articles = await searchNewsApi({});
    expect(articles).toEqual([]);
  });

  it("returns empty array on upstream 500", async () => {
    server.use(http.get(NEWSAPI_URL, () => new HttpResponse(null, { status: 500 })));
    const articles = await searchNewsApi({});
    expect(articles).toEqual([]);
  });

  it("returns empty array on network failure", async () => {
    server.use(http.get(NEWSAPI_URL, () => HttpResponse.error()));
    const articles = await searchNewsApi({});
    expect(articles).toEqual([]);
  });

  it("sends the user query unwrapped when provided (no implicit-AND with domain terms)", async () => {
    let capturedUrl = "";
    server.use(
      http.get(NEWSAPI_URL, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ status: "ok", articles: [] });
      })
    );
    await searchNewsApi({ query: "vaccine" });
    const params = new URL(capturedUrl).searchParams;
    const q = params.get("q") ?? "";
    // NewsAPI treats unquoted multi-word `q` as implicit AND, so wrapping
    // user terms with the domain clause requires every user word + a domain
    // match to coexist → empirically returns 0. Trust the upstream classifier.
    expect(q).toBe("vaccine");
  });

  it("uses base health terms when no user query is provided", async () => {
    let capturedUrl = "";
    server.use(
      http.get(NEWSAPI_URL, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ status: "ok", articles: [] });
      })
    );
    await searchNewsApi({});
    const q = new URL(capturedUrl).searchParams.get("q") ?? "";
    expect(q.toLowerCase()).toContain("cervical health");
  });

  it("constrains the date window to the last 7 days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T00:00:00Z"));
    let capturedUrl = "";
    server.use(
      http.get(NEWSAPI_URL, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ status: "ok", articles: [] });
      })
    );
    await searchNewsApi({});
    const from = new URL(capturedUrl).searchParams.get("from");
    expect(from).toBe("2026-04-27");
  });

  it("requests articles sorted by publishedAt", async () => {
    let capturedUrl = "";
    server.use(
      http.get(NEWSAPI_URL, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ status: "ok", articles: [] });
      })
    );
    await searchNewsApi({});
    expect(new URL(capturedUrl).searchParams.get("sortBy")).toBe("publishedAt");
  });

  it("never includes the API key in returned data", async () => {
    server.use(
      http.get(NEWSAPI_URL, () =>
        HttpResponse.json({
          status: "ok",
          articles: [
            {
              title: "x",
              source: { name: "y" },
              url: "https://example.com",
              publishedAt: "2026-04-30T12:00:00Z",
              description: null,
            },
          ],
        })
      )
    );
    const articles = await searchNewsApi({});
    const serialized = JSON.stringify(articles);
    expect(serialized).not.toContain("test-news-api-key");
  });

  it("skips upstream items missing required fields", async () => {
    server.use(
      http.get(NEWSAPI_URL, () =>
        HttpResponse.json({
          status: "ok",
          articles: [
            {
              title: "ok",
              source: { name: "X" },
              url: "https://a.com",
              publishedAt: "2026-04-30T12:00:00Z",
              description: null,
            },
            {
              title: "no-url",
              source: { name: "X" },
              url: null,
              publishedAt: "2026-04-30T12:00:00Z",
              description: null,
            },
            {
              title: "no-source",
              source: null,
              url: "https://b.com",
              publishedAt: "2026-04-30T12:00:00Z",
              description: null,
            },
          ],
        })
      )
    );
    const articles = await searchNewsApi({});
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("ok");
  });
});
