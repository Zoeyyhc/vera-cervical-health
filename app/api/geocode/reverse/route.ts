import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { reverseGeocodeRequestSchema } from "@/lib/validations/geocode";

const GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

/** Returned on every failure path — the client treats it as "no fix". */
const EMPTY_FIX = { suburb: null, state: null, postcode: null };

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
  error_message?: string;
  results?: GeocodeResult[];
};

// Reverse-geocodes a lat/lng to a structured suburb/state/postcode via Google
// Maps, for the chat client's on-demand location prompt.
//
// The state is the reason this returns a shape rather than a city string: 457
// Victorian suburb names are also used by another state, so "Burwood" on its own
// cannot confirm a location and the agent has to ask. With the state attached it
// does not have to.
//
// Returns an empty fix on any failure, so the client reports "couldn't work out
// where you are" and the user is asked to type a suburb — never told that a
// search found nothing.
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
    return Response.json(EMPTY_FIX);
  }

  if (!upstream.ok) {
    console.error(`[geocode/reverse] upstream non-2xx: ${upstream.status}`);
    return Response.json(EMPTY_FIX);
  }

  let data: GeocodeResponse;
  try {
    data = (await upstream.json()) as GeocodeResponse;
  } catch {
    return Response.json(EMPTY_FIX);
  }

  // Google answers a rejected key with HTTP 200 and a status in the body, so a
  // disabled Geocoding API, an expired key, or an exhausted quota all arrive
  // here looking exactly like "we couldn't place you". Log the ones that are
  // ours to fix — silence here cost an afternoon of chasing a permission prompt
  // that was working the whole time.
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error(
      `[geocode/reverse] Google returned ${data.status}: ${data.error_message ?? "no detail"}`
    );
  }

  if (data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
    return Response.json(EMPTY_FIX);
  }

  return Response.json(extractFix(data.results));
}

type GeoFixResponse = {
  suburb: string | null;
  state: string | null;
  postcode: string | null;
};

/**
 * Pull suburb, state and postcode out of the geocoder's components.
 *
 * Scans every result rather than only the first: Google orders results
 * most-specific first, and the most specific one is often a street address that
 * carries no postcode, while the suburb-level result behind it does. Taking the
 * first non-empty value for each field independently is what makes a complete
 * fix out of two partial ones.
 *
 * Suburb precedence follows Australian addressing: `locality` is the suburb, and
 * `sublocality` covers the cases Google splits further.
 */
function extractFix(results: GeocodeResult[]): GeoFixResponse {
  const fix: GeoFixResponse = { suburb: null, state: null, postcode: null };

  for (const result of results) {
    const components = result.address_components ?? [];
    fix.suburb ??= pick(components, ["locality", "sublocality", "postal_town"], "long_name");
    // Short name, because that is the "VIC" the resolver matches on.
    fix.state ??= pick(components, ["administrative_area_level_1"], "short_name");
    fix.postcode ??= pick(components, ["postal_code"], "long_name");
    if (fix.suburb && fix.state && fix.postcode) break;
  }

  return fix;
}

function pick(
  components: AddressComponent[],
  wanted: string[],
  field: "long_name" | "short_name"
): string | null {
  for (const type of wanted) {
    const match = components.find((c) => c.types?.includes(type));
    const name = match?.[field]?.trim();
    if (name) return name;
  }
  return null;
}
