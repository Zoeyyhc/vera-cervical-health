import { env } from "@/lib/env";
import { clinicResultSchema } from "@/lib/validations/clinic";
import type { ClinicResult } from "@/types/clinic";

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.currentOpeningHours.openNow",
  "places.currentOpeningHours.weekdayDescriptions",
  "places.googleMapsUri",
].join(",");

export type SearchPlacesInput = {
  location: string;
  keyword?: string;
};

export type SearchPlacesResult =
  | { status: "ok"; clinics: ClinicResult[] }
  | { status: "upstream_error"; httpStatus: number }
  | { status: "fetch_failed" };

type UpstreamPlace = {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  googleMapsUri?: string;
};

type UpstreamResponse = { places?: UpstreamPlace[] };

// Anchors every search to medical results in the user's location. Without this,
// Google Places returns admin areas (postcodes, suburbs) and unrelated matches
// like "Papa Rich" for a "pap" keyword. The "in <location>" framing tells Google
// to treat <location> as a place filter rather than a name match.
const HEALTH_QUALIFIER = "women's health clinic";

export async function searchPlacesApi({
  location,
  keyword,
}: SearchPlacesInput): Promise<SearchPlacesResult> {
  const trimmedKeyword = keyword?.trim();
  const textQuery = trimmedKeyword
    ? `${trimmedKeyword} ${HEALTH_QUALIFIER} in ${location}`
    : `${HEALTH_QUALIFIER} in ${location}`;

  let upstream: Response;
  try {
    upstream = await fetch(PLACES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.googleMapsApiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery }),
    });
  } catch (err) {
    console.error("[clinics] places fetch failed:", err instanceof Error ? err.message : err);
    return { status: "fetch_failed" };
  }

  if (!upstream.ok) {
    console.error(`[clinics] places upstream non-2xx: ${upstream.status}`);
    return { status: "upstream_error", httpStatus: upstream.status };
  }

  let data: UpstreamResponse;
  try {
    data = (await upstream.json()) as UpstreamResponse;
  } catch {
    return { status: "fetch_failed" };
  }

  const clinics: ClinicResult[] = [];
  for (const p of data.places ?? []) {
    const candidate = mapPlace(p);
    const parsed = clinicResultSchema.safeParse(candidate);
    if (!parsed.success) {
      console.warn(
        `[clinics] dropping invalid place ${p.id ?? "<no-id>"}:`,
        parsed.error.issues.map((i) => i.path.join(".")).join(", ")
      );
      continue;
    }
    clinics.push(parsed.data);
  }
  return { status: "ok", clinics };
}

function mapPlace(p: UpstreamPlace): Partial<ClinicResult> {
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  const name = p.displayName?.text;
  const placeId = p.id;
  return {
    placeId,
    name,
    formattedAddress: p.formattedAddress,
    location: lat != null && lng != null ? { lat, lng } : undefined,
    phone: p.internationalPhoneNumber,
    websiteUri: p.websiteUri,
    rating: p.rating,
    userRatingCount: p.userRatingCount,
    openNow: p.currentOpeningHours?.openNow,
    weekdayDescriptions: p.currentOpeningHours?.weekdayDescriptions,
    googleMapsUri:
      p.googleMapsUri ??
      (placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : undefined),
  };
}
