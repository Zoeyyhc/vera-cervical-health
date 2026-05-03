import { server } from "@/test-utils/server";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

const SERPAPI_URL = "https://serpapi.com/search";

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`);
}

describe("GET /api/events", () => {
  it("returns 200 with events array", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "Women's Health Fair",
              date: { when: "May 10, 2026" },
              address: ["Sydney"],
              link: "https://example.com/1",
              description: null,
            },
          ],
        })
      )
    );
    const res = await GET(makeRequest("/api/events?location=Sydney"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[] };
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events).toHaveLength(1);
  });

  it("returns 400 when location is missing", async () => {
    const res = await GET(makeRequest("/api/events"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when location is empty string", async () => {
    const res = await GET(makeRequest("/api/events?location="));
    expect(res.status).toBe(400);
  });

  it("rejects max above 10 with 400", async () => {
    const res = await GET(makeRequest("/api/events?location=Sydney&max=999"));
    expect(res.status).toBe(400);
  });

  it("rejects non-numeric max with 400", async () => {
    const res = await GET(makeRequest("/api/events?location=Sydney&max=abc"));
    expect(res.status).toBe(400);
  });

  it("returns empty events + error flag on upstream 500", async () => {
    server.use(http.get(SERPAPI_URL, () => new HttpResponse(null, { status: 500 })));
    const res = await GET(makeRequest("/api/events?location=Sydney"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[]; error?: string };
    expect(body.events).toEqual([]);
    expect(body.error).toBe("unavailable");
  });

  it("never echoes the SerpAPI key in the response", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "T",
              date: { when: "May 10" },
              address: ["X"],
              link: "https://example.com/x",
              description: null,
            },
          ],
        })
      )
    );
    const res = await GET(makeRequest("/api/events?location=Sydney"));
    const text = await res.text();
    expect(text).not.toContain("test-serpapi-key");
  });
});
