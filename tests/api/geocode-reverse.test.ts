// @vitest-environment node

import { server } from "@/test-utils/server";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST } from "@/app/api/geocode/reverse/route";
import { createClient } from "@/lib/supabase/server";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

function mockSupabase(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  };
}

function makeRequest(body: unknown | string): Request {
  return new Request("http://localhost/api/geocode/reverse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/geocode/reverse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }) as never);
  });

  test("returns suburb, state and postcode from one result", async () => {
    server.use(
      http.get(GEOCODE_URL, () =>
        HttpResponse.json({
          status: "OK",
          results: [
            {
              address_components: [
                { long_name: "123", short_name: "123", types: ["street_number"] },
                {
                  long_name: "Melbourne",
                  short_name: "Melbourne",
                  types: ["locality", "political"],
                },
                {
                  long_name: "Victoria",
                  short_name: "VIC",
                  types: ["administrative_area_level_1", "political"],
                },
                { long_name: "3000", short_name: "3000", types: ["postal_code"] },
              ],
            },
          ],
        })
      )
    );
    const res = await POST(makeRequest({ lat: -37.8136, lng: 144.9631 }));
    expect(res.status).toBe(200);
    // The state is the field that earns this route its keep: "Melbourne" alone
    // would still leave the agent guessing for any shared suburb name.
    expect(await res.json()).toEqual({ suburb: "Melbourne", state: "VIC", postcode: "3000" });
  });

  test("completes a fix from a later result when the first is a street address", async () => {
    // Google returns most-specific first, and that result often carries no
    // postcode while the suburb-level one behind it does.
    server.use(
      http.get(GEOCODE_URL, () =>
        HttpResponse.json({
          status: "OK",
          results: [
            {
              address_components: [
                { long_name: "123", short_name: "123", types: ["street_number"] },
                { long_name: "Burwood", short_name: "Burwood", types: ["locality", "political"] },
              ],
            },
            {
              address_components: [
                {
                  long_name: "Victoria",
                  short_name: "VIC",
                  types: ["administrative_area_level_1", "political"],
                },
                { long_name: "3125", short_name: "3125", types: ["postal_code"] },
              ],
            },
          ],
        })
      )
    );
    const res = await POST(makeRequest({ lat: -37.85, lng: 145.11 }));
    expect(await res.json()).toEqual({ suburb: "Burwood", state: "VIC", postcode: "3125" });
  });

  test("reports missing fields as null rather than substituting a region", async () => {
    // The old route fell back to administrative_area_level_2, then to the state,
    // and called any of them "city". A state is not a suburb, and treating it as
    // one is how a weak location reached the tools in the first place.
    server.use(
      http.get(GEOCODE_URL, () =>
        HttpResponse.json({
          status: "OK",
          results: [
            {
              address_components: [
                {
                  long_name: "Greater Geelong",
                  short_name: "Greater Geelong",
                  types: ["administrative_area_level_2", "political"],
                },
                {
                  long_name: "Victoria",
                  short_name: "VIC",
                  types: ["administrative_area_level_1", "political"],
                },
              ],
            },
          ],
        })
      )
    );
    const res = await POST(makeRequest({ lat: -38.1, lng: 144.3 }));
    expect(await res.json()).toEqual({ suburb: null, state: "VIC", postcode: null });
  });

  test("returns an empty fix on ZERO_RESULTS", async () => {
    server.use(
      http.get(GEOCODE_URL, () => HttpResponse.json({ status: "ZERO_RESULTS", results: [] }))
    );
    const res = await POST(makeRequest({ lat: 0, lng: 0 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suburb: null, state: null, postcode: null });
  });

  test("returns an empty fix when upstream returns non-2xx", async () => {
    server.use(http.get(GEOCODE_URL, () => HttpResponse.json({ error: "boom" }, { status: 500 })));
    const res = await POST(makeRequest({ lat: 1, lng: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suburb: null, state: null, postcode: null });
  });

  test("returns an empty fix when upstream fetch throws", async () => {
    server.use(http.get(GEOCODE_URL, () => HttpResponse.error()));
    const res = await POST(makeRequest({ lat: 1, lng: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suburb: null, state: null, postcode: null });
  });

  test("returns 401 when no user", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase(null) as never);
    const res = await POST(makeRequest({ lat: 1, lng: 1 }));
    expect(res.status).toBe(401);
  });

  test("returns 400 on invalid JSON", async () => {
    const res = await POST(makeRequest("{not json"));
    expect(res.status).toBe(400);
  });

  test("returns 400 when lat is out of range", async () => {
    const res = await POST(makeRequest({ lat: 100, lng: 0 }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when lng is out of range", async () => {
    const res = await POST(makeRequest({ lat: 0, lng: 200 }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when lat/lng missing", async () => {
    const res = await POST(makeRequest({ lat: 0 }));
    expect(res.status).toBe(400);
  });

  test("does not leak the API key in any response field", async () => {
    server.use(
      http.get(GEOCODE_URL, () =>
        HttpResponse.json({
          status: "OK",
          results: [
            {
              address_components: [
                { long_name: "Sydney", short_name: "Sydney", types: ["locality", "political"] },
              ],
            },
          ],
        })
      )
    );
    const res = await POST(makeRequest({ lat: -33.8688, lng: 151.2093 }));
    const text = await res.text();
    expect(text).not.toContain("key=");
  });

  test("sends latlng query param to Google", async () => {
    const captured: { url: string | null } = { url: null };
    server.use(
      http.get(GEOCODE_URL, ({ request }) => {
        captured.url = request.url;
        return HttpResponse.json({ status: "ZERO_RESULTS", results: [] });
      })
    );
    await POST(makeRequest({ lat: -33.8688, lng: 151.2093 }));
    expect(captured.url).toContain("latlng=");
    expect(captured.url).toContain("-33.8688");
    expect(captured.url).toContain("151.2093");
  });
});
