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

    const result = await searchEventsApi({ location: "Sydney", max_results: 5 });
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toEqual({
      name: "Women's Health Fair",
      date: "Sat, May 10, 2026",
      location: "123 Main St, Sydney NSW",
      url: "https://example.com/event-1",
      description: "Free screenings and Q&A",
    });
    expect(result.events[1].description).toBeNull();
  });

  it("respects max_results when upstream returns more", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: Array.from({ length: 8 }, (_, i) => ({
            title: `Cervical Screening Info Session ${i}`,
            date: { when: "May 10" },
            address: ["X"],
            link: `https://example.com/${i}`,
            description: null,
          })),
        })
      )
    );
    const result = await searchEventsApi({ location: "Sydney", max_results: 3 });
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    expect(result.events).toHaveLength(3);
  });

  it("returns no_results on a valid empty upstream response", async () => {
    server.use(http.get(SERPAPI_URL, () => HttpResponse.json({ events_results: [] })));
    const result = await searchEventsApi({ location: "Sydney" });
    expect(result).toEqual({ status: "no_results" });
  });

  it("returns no_results when upstream omits events_results", async () => {
    server.use(http.get(SERPAPI_URL, () => HttpResponse.json({})));
    const result = await searchEventsApi({ location: "Sydney" });
    expect(result).toEqual({ status: "no_results" });
  });

  it("returns upstream_unavailable on upstream 500", async () => {
    server.use(http.get(SERPAPI_URL, () => new HttpResponse(null, { status: 500 })));
    const result = await searchEventsApi({ location: "Sydney" });
    expect(result).toEqual({ status: "upstream_unavailable" });
  });

  it("returns upstream_unavailable on network failure", async () => {
    server.use(http.get(SERPAPI_URL, () => HttpResponse.error()));
    const result = await searchEventsApi({ location: "Sydney" });
    expect(result).toEqual({ status: "upstream_unavailable" });
  });

  it("returns upstream_unavailable on malformed JSON", async () => {
    server.use(http.get(SERPAPI_URL, () => new HttpResponse("not json", { status: 200 })));
    const result = await searchEventsApi({ location: "Sydney" });
    expect(result).toEqual({ status: "upstream_unavailable" });
  });

  it("returns no_results when location is missing, without calling upstream", async () => {
    let called = false;
    server.use(
      http.get(SERPAPI_URL, () => {
        called = true;
        return HttpResponse.json({ events_results: [] });
      })
    );
    const result = await searchEventsApi({ location: "" });
    expect(result).toEqual({ status: "no_results" });
    expect(called).toBe(false);
  });

  it("sends a natural query — no forced health-domain boolean clause", async () => {
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
    expect(params.get("q")).toBe("cancer");
    expect(params.get("gl")).toBe("au");
    expect(params.get("hl")).toBe("en");
  });

  it("falls back to a plain 'events' query when no user query is given", async () => {
    let captured = "";
    server.use(
      http.get(SERPAPI_URL, ({ request }) => {
        captured = request.url;
        return HttpResponse.json({ events_results: [] });
      })
    );
    await searchEventsApi({ location: "Sydney" });
    const params = new URL(captured).searchParams;
    expect(params.get("q")).toBe("events");
  });

  it("never echoes the SerpAPI key in returned data", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "Cervical Screening Pop-Up",
              date: { when: "x" },
              address: ["x"],
              link: "https://example.com/x",
              description: null,
            },
          ],
        })
      )
    );
    const result = await searchEventsApi({ location: "Sydney" });
    expect(JSON.stringify(result)).not.toContain("test-serpapi-key");
  });

  it("skips items missing required fields (title/link/date/address)", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "Cervical Screening Info Day",
              date: { when: "May 10" },
              address: ["A"],
              link: "https://a.com",
              description: null,
            },
            {
              title: "Cervical Screening no-link",
              date: { when: "May 10" },
              address: ["A"],
              link: null,
              description: null,
            },
            {
              title: "Cervical Screening no-date",
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
    const result = await searchEventsApi({ location: "Sydney" });
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].name).toBe("Cervical Screening Info Day");
  });

  it("falls back to empty location string when address array missing", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "Cervical Screening Session",
              date: { when: "May 10" },
              address: null,
              link: "https://a.com",
              description: null,
            },
          ],
        })
      )
    );
    const result = await searchEventsApi({ location: "Sydney" });
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].location).toBe("");
  });

  it("returns no_results when candidates exist but none are health-relevant", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "Saturday Night Concert",
              date: { when: "May 10" },
              address: ["Town Hall"],
              link: "https://example.com/concert",
              description: "Live music all night",
            },
            {
              title: "Farmers Market",
              date: { when: "May 11" },
              address: ["Main St"],
              link: "https://example.com/market",
              description: "Fresh produce and crafts",
            },
          ],
        })
      )
    );
    const result = await searchEventsApi({ location: "Sydney" });
    expect(result).toEqual({ status: "no_results" });
  });

  it("keeps only health-relevant candidates out of a mixed result set", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "Saturday Night Concert",
              date: { when: "May 10" },
              address: ["Town Hall"],
              link: "https://example.com/concert",
              description: "Live music all night",
            },
            {
              title: "HPV Vaccination Info Session",
              date: { when: "May 11" },
              address: ["Community Centre"],
              link: "https://example.com/hpv-session",
              description: null,
            },
          ],
        })
      )
    );
    const result = await searchEventsApi({ location: "Sydney" });
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].name).toBe("HPV Vaccination Info Session");
  });

  it("treats health relevance found in the description as sufficient", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "Community Wellness Day",
              date: { when: "May 10" },
              address: ["Town Hall"],
              link: "https://example.com/wellness",
              description: "Includes free cervical screening for eligible attendees",
            },
          ],
        })
      )
    );
    const result = await searchEventsApi({ location: "Sydney" });
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    expect(result.events).toHaveLength(1);
  });
});
