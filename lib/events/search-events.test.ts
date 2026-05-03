import { server } from "@/test-utils/server";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { searchEventsApi } from "./search-events";

const SERPAPI_URL = "https://serpapi.com/search";

describe("searchEventsApi", () => {
  it("returns up to max_results events, normalized", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "Women's Health Fair",
              date: { when: "Sat, May 10, 2026" },
              address: ["123 Main St", "Sydney NSW"],
              link: "https://example.com/event-1",
              description: "Free screenings and Q&A",
            },
            {
              title: "HPV Awareness Talk",
              date: { when: "Sun, May 11, 2026" },
              address: ["Town Hall", "Sydney NSW"],
              link: "https://example.com/event-2",
              description: null,
            },
          ],
        })
      )
    );

    const events = await searchEventsApi({ location: "Sydney", max_results: 5 });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      name: "Women's Health Fair",
      date: "Sat, May 10, 2026",
      location: "123 Main St, Sydney NSW",
      url: "https://example.com/event-1",
      description: "Free screenings and Q&A",
    });
    expect(events[1].description).toBeNull();
  });

  it("respects max_results when upstream returns more", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: Array.from({ length: 8 }, (_, i) => ({
            title: `Event ${i}`,
            date: { when: "May 10" },
            address: ["X"],
            link: `https://example.com/${i}`,
            description: null,
          })),
        })
      )
    );
    const events = await searchEventsApi({ location: "Sydney", max_results: 3 });
    expect(events).toHaveLength(3);
  });

  it("returns empty array on empty upstream", async () => {
    server.use(http.get(SERPAPI_URL, () => HttpResponse.json({ events_results: [] })));
    const events = await searchEventsApi({ location: "Sydney" });
    expect(events).toEqual([]);
  });

  it("returns empty array when upstream omits events_results", async () => {
    server.use(http.get(SERPAPI_URL, () => HttpResponse.json({})));
    const events = await searchEventsApi({ location: "Sydney" });
    expect(events).toEqual([]);
  });

  it("returns empty array on upstream 500", async () => {
    server.use(http.get(SERPAPI_URL, () => new HttpResponse(null, { status: 500 })));
    const events = await searchEventsApi({ location: "Sydney" });
    expect(events).toEqual([]);
  });

  it("returns empty array on network failure", async () => {
    server.use(http.get(SERPAPI_URL, () => HttpResponse.error()));
    const events = await searchEventsApi({ location: "Sydney" });
    expect(events).toEqual([]);
  });

  it("returns empty array when location is missing", async () => {
    let called = false;
    server.use(
      http.get(SERPAPI_URL, () => {
        called = true;
        return HttpResponse.json({ events_results: [] });
      })
    );
    const events = await searchEventsApi({ location: "" });
    expect(events).toEqual([]);
    expect(called).toBe(false);
  });

  it("forwards location and adds health-domain keywords to upstream q", async () => {
    let captured = "";
    server.use(
      http.get(SERPAPI_URL, ({ request }) => {
        captured = request.url;
        return HttpResponse.json({ events_results: [] });
      })
    );
    await searchEventsApi({ location: "Sydney NSW", query: "cancer" });
    const params = new URL(captured).searchParams;
    expect(params.get("location")).toBe("Sydney NSW");
    expect(params.get("engine")).toBe("google_events");
    const q = params.get("q") ?? "";
    expect(q.toLowerCase()).toContain("cancer");
    expect(q.toLowerCase()).toContain("women's health");
  });

  it("never echoes the SerpAPI key in returned data", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "x",
              date: { when: "x" },
              address: ["x"],
              link: "https://example.com/x",
              description: null,
            },
          ],
        })
      )
    );
    const events = await searchEventsApi({ location: "Sydney" });
    expect(JSON.stringify(events)).not.toContain("test-serpapi-key");
  });

  it("skips items missing required fields (title/link/date/address)", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "ok",
              date: { when: "May 10" },
              address: ["A"],
              link: "https://a.com",
              description: null,
            },
            {
              title: "no-link",
              date: { when: "May 10" },
              address: ["A"],
              link: null,
              description: null,
            },
            {
              title: "no-date",
              date: null,
              address: ["A"],
              link: "https://b.com",
              description: null,
            },
            {
              title: null,
              date: { when: "May 10" },
              address: ["A"],
              link: "https://c.com",
              description: null,
            },
          ],
        })
      )
    );
    const events = await searchEventsApi({ location: "Sydney" });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("ok");
  });

  it("falls back to empty location string when address array missing", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "T",
              date: { when: "May 10" },
              address: null,
              link: "https://a.com",
              description: null,
            },
          ],
        })
      )
    );
    const events = await searchEventsApi({ location: "Sydney" });
    expect(events).toHaveLength(1);
    expect(events[0].location).toBe("");
  });
});
