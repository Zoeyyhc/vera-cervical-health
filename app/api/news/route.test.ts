import { server } from "@/test-utils/server";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

const NEWSAPI_URL = "https://newsapi.org/v2/everything";

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`);
}

describe("GET /api/news", () => {
  it("returns 200 with articles array", async () => {
    server.use(
      http.get(NEWSAPI_URL, () =>
        HttpResponse.json({
          status: "ok",
          articles: [
            {
              title: "x",
              source: { name: "Y" },
              url: "https://example.com/x",
              publishedAt: "2026-04-30T12:00:00Z",
              description: null,
            },
          ],
        })
      )
    );
    const res = await GET(makeRequest("/api/news"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { articles: unknown[] };
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body.articles).toHaveLength(1);
  });

  it("clamps max above 10 to a 400", async () => {
    const res = await GET(makeRequest("/api/news?max=999"));
    expect(res.status).toBe(400);
  });

  it("rejects non-numeric max", async () => {
    const res = await GET(makeRequest("/api/news?max=abc"));
    expect(res.status).toBe(400);
  });

  it("returns empty articles + error flag on upstream 500", async () => {
    server.use(http.get(NEWSAPI_URL, () => new HttpResponse(null, { status: 500 })));
    const res = await GET(makeRequest("/api/news"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { articles: unknown[]; error?: string };
    expect(body.articles).toEqual([]);
    expect(body.error).toBe("unavailable");
  });

  it("never echoes the NewsAPI key in the response", async () => {
    server.use(
      http.get(NEWSAPI_URL, () =>
        HttpResponse.json({
          status: "ok",
          articles: [
            {
              title: "x",
              source: { name: "Y" },
              url: "https://example.com/x",
              publishedAt: "2026-04-30T12:00:00Z",
              description: null,
            },
          ],
        })
      )
    );
    const res = await GET(makeRequest("/api/news?q=hpv"));
    const text = await res.text();
    expect(text).not.toContain("test-news-api-key");
  });

  it("forwards user query to upstream q param", async () => {
    let captured = "";
    server.use(
      http.get(NEWSAPI_URL, ({ request }) => {
        captured = request.url;
        return HttpResponse.json({ status: "ok", articles: [] });
      })
    );
    await GET(makeRequest("/api/news?q=screening"));
    expect(captured).toContain("screening");
  });
});
