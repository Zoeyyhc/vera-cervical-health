import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { reverseGeocodeRequestSchema } from "@/lib/validations/geocode";

const GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

type AddressComponent = {
  long_name?: string | null;
  short_name?: string | null;
  types?: string[];
};

type GeocodeResult = {
  address_components?: AddressComponent[];
};

type GeocodeResponse = {
  status?: string;
  results?: GeocodeResult[];
};

// Reverse-geocodes a lat/lng to a city name via Google Maps. Used by the
// chat client's useUserCity hook to feed `profiles`-less location into the
// events agent. Returns `{ city: null }` on any failure so the client can
// silently fall back to the orchestrator's "Which city are you in?" path.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = reverseGeocodeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const { lat, lng } = parsed.data;
  const url = new URL(GEOCODE_ENDPOINT);
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", env.googleMapsApiKey);

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    console.error("[geocode/reverse] fetch failed:", err instanceof Error ? err.message : err);
    return Response.json({ city: null });
  }

  if (!upstream.ok) {
    console.error(`[geocode/reverse] upstream non-2xx: ${upstream.status}`);
    return Response.json({ city: null });
  }

  let data: GeocodeResponse;
  try {
    data = (await upstream.json()) as GeocodeResponse;
  } catch {
    return Response.json({ city: null });
  }

  if (data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
    return Response.json({ city: null });
  }

  const city = extractCity(data.results[0]);
  return Response.json({ city });
}

// City precedence: locality (canonical city) → admin_area_level_2 (county/region,
// catches rural areas and metros that Google labels at level_2 only, e.g.
// Greater Manchester) → admin_area_level_1 (state, last-ditch hint).
function extractCity(result: GeocodeResult): string | null {
  const components = result.address_components ?? [];
  for (const wanted of ["locality", "administrative_area_level_2", "administrative_area_level_1"]) {
    const match = components.find((c) => c.types?.includes(wanted));
    const name = match?.long_name?.trim();
    if (name) return name;
  }
  return null;
}
