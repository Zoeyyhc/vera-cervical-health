import { server } from "@/test-utils/server";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`);
}

function makePlace(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ChIJ_test_01",
    displayName: { text: "Test Women's Health Centre", languageCode: "en" },
    formattedAddress: "1 Test St, Sydney NSW 2000",
    location: { latitude: -33.8688, longitude: 151.2093 },
    internationalPhoneNumber: "+61 2 1234 5678",
    websiteUri: "https://example.org/clinic",
    rating: 4.5,
    userRatingCount: 100,
    currentOpeningHours: {
      openNow: true,
      weekdayDescriptions: ["Monday: 9:00 AM - 5:00 PM"],
    },
    googleMapsUri: "https://www.google.com/maps/place/?q=place_id:ChIJ_test_01",
    ...over,
  };
}

describe("GET /api/clinics/search", () => {
  it("returns 200 with mapped clinics on a valid query", async () => {
    server.use(http.post(PLACES_URL, () => HttpResponse.json({ places: [makePlace()] })));
    const res = await GET(makeRequest("/api/clinics/search?location=Sydney"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { clinics: Array<{ placeId: string; name: string }> };
    expect(body.clinics).toHaveLength(1);
    expect(body.clinics[0].placeId).toBe("ChIJ_test_01");
    expect(body.clinics[0].name).toBe("Test Women's Health Centre");
  });

  it("forwards keyword + location into textQuery", async () => {
    const captured: { body: { textQuery?: string } | null } = { body: null };
    server.use(
      http.post(PLACES_URL, async ({ request }) => {
        captured.body = (await request.json()) as { textQuery?: string };
        return HttpResponse.json({ places: [] });
      })
    );
    await GET(makeRequest("/api/clinics/search?location=Sydney&keyword=cervical%20screening"));
    expect(captured.body).not.toBeNull();
    expect(captured.body?.textQuery).toBe("cervical screening women's health clinic in Sydney");
  });

  it("uses location only when no keyword provided", async () => {
    const captured: { body: { textQuery?: string } | null } = { body: null };
    server.use(
      http.post(PLACES_URL, async ({ request }) => {
        captured.body = (await request.json()) as { textQuery?: string };
        return HttpResponse.json({ places: [] });
      })
    );
    await GET(makeRequest("/api/clinics/search?location=Sydney"));
    expect(captured.body?.textQuery).toBe("women's health clinic in Sydney");
  });

  it("sends lat,lng location as locationBias.circle, not textQuery", async () => {
    type CapturedBody = {
      textQuery?: string;
      locationBias?: {
        circle?: { center?: { latitude?: number; longitude?: number }; radius?: number };
      };
    };
    const captured: { body: CapturedBody | null } = { body: null };
    server.use(
      http.post(PLACES_URL, async ({ request }) => {
        captured.body = (await request.json()) as CapturedBody;
        return HttpResponse.json({ places: [] });
      })
    );
    await GET(makeRequest("/api/clinics/search?location=-37.8499,145.1343"));
    expect(captured.body?.textQuery).toBe("women's health clinic");
    expect(captured.body?.locationBias?.circle?.center).toEqual({
      latitude: -37.8499,
      longitude: 145.1343,
    });
    expect(captured.body?.locationBias?.circle?.radius).toBeGreaterThan(0);
  });

  it("combines keyword with locationBias when location is coordinates", async () => {
    type CapturedBody = {
      textQuery?: string;
      locationBias?: { circle?: { center?: { latitude?: number; longitude?: number } } };
    };
    const captured: { body: CapturedBody | null } = { body: null };
    server.use(
      http.post(PLACES_URL, async ({ request }) => {
        captured.body = (await request.json()) as CapturedBody;
        return HttpResponse.json({ places: [] });
      })
    );
    await GET(
      makeRequest("/api/clinics/search?location=-37.8499,145.1343&keyword=cervical%20screening")
    );
    expect(captured.body?.textQuery).toBe("cervical screening women's health clinic");
    expect(captured.body?.locationBias?.circle?.center).toEqual({
      latitude: -37.8499,
      longitude: 145.1343,
    });
  });

  it("sends X-Goog-Api-Key and X-Goog-FieldMask headers", async () => {
    const captured: { headers: Headers | null } = { headers: null };
    server.use(
      http.post(PLACES_URL, ({ request }) => {
        captured.headers = request.headers;
        return HttpResponse.json({ places: [] });
      })
    );
    await GET(makeRequest("/api/clinics/search?location=Sydney"));
    expect(captured.headers).not.toBeNull();
    expect(captured.headers?.get("X-Goog-Api-Key")).toBe("test-google-maps-key");
    expect(captured.headers?.get("X-Goog-FieldMask")).toContain("places.id");
    expect(captured.headers?.get("X-Goog-FieldMask")).toContain("places.googleMapsUri");
  });

  it("returns 400 on empty location", async () => {
    const res = await GET(makeRequest("/api/clinics/search?location="));
    expect(res.status).toBe(400);
  });

  it("returns 400 when location is missing", async () => {
    const res = await GET(makeRequest("/api/clinics/search"));
    expect(res.status).toBe(400);
  });

  it("returns 502 on upstream 500", async () => {
    server.use(http.post(PLACES_URL, () => new HttpResponse(null, { status: 500 })));
    const res = await GET(makeRequest("/api/clinics/search?location=Sydney"));
    expect(res.status).toBe(502);
  });

  it("returns 502 on upstream fetch failure", async () => {
    server.use(http.post(PLACES_URL, () => HttpResponse.error()));
    const res = await GET(makeRequest("/api/clinics/search?location=Sydney"));
    expect(res.status).toBe(502);
  });

  it("drops invalid upstream rows but keeps valid ones", async () => {
    server.use(
      http.post(PLACES_URL, () =>
        HttpResponse.json({
          places: [
            makePlace(),
            // Missing id - should be dropped by clinicResultSchema.safeParse
            { ...makePlace(), id: undefined },
            // Missing googleMapsUri AND no id to construct from - should be dropped
            { ...makePlace({ id: "ChIJ_test_02" }), googleMapsUri: undefined },
          ],
        })
      )
    );
    const res = await GET(makeRequest("/api/clinics/search?location=Sydney"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { clinics: unknown[] };
    // Row 1 valid; row 2 dropped (no id); row 3 keeps the constructed googleMapsUri from id
    expect(body.clinics).toHaveLength(2);
  });

  it("never echoes the API key in the response body", async () => {
    server.use(http.post(PLACES_URL, () => HttpResponse.json({ places: [makePlace()] })));
    const res = await GET(makeRequest("/api/clinics/search?location=Sydney"));
    const text = await res.text();
    expect(text).not.toContain("test-google-maps-key");
  });
});
