import { env } from "@/lib/env";
import type { HealthEvent } from "@/lib/validations/events";

const SERPAPI_ENDPOINT = "https://serpapi.com/search";

/** Local relevance vocabulary — matched against title/description/address, never sent upstream. */
const HEALTH_KEYWORDS = ["women's health", "cervical", "screening", "hpv", "pap"];

export type SearchEventsInput = {
  location: string;
  query?: string;
  max_results?: number;
};

export type EventsSearchResult =
  | { status: "ok"; events: HealthEvent[] }
  | { status: "no_results" }
  | { status: "upstream_unavailable" };

type UpstreamEvent = {
  title?: string | null;
  date?: { when?: string | null } | null;
  address?: string[] | null;
  link?: string | null;
  description?: string | null;
};

type UpstreamResponse = {
  events_results?: UpstreamEvent[];
};

/**
 * Single source of truth for the SerpAPI Google Events call.
 * Used directly by the events agent's tool wrapper and by the `/api/events`
 * proxy. Never throws — always resolves to a typed result so callers can
 * distinguish "searched, nothing relevant" from "couldn't search at all".
 *
 * Sends a natural event query upstream (never a forced health-domain boolean
 * clause — Google Events returns nothing for those) and filters/ranks
 * candidates against `HEALTH_KEYWORDS` locally.
 *
 * Resolves to `no_results` immediately when `location` is empty: SerpAPI
 * requires it, and we'd rather skip the round-trip than burn quota on a
 * guaranteed-empty search.
 */
export async function searchEventsApi({
  location,
  query = "",
  max_results = 5,
}: SearchEventsInput): Promise<EventsSearchResult> {
  const trimmedLocation = location.trim();
  if (!trimmedLocation) return { status: "no_results" };

  const max = Math.min(Math.max(max_results, 1), 10);
  const userQuery = query.trim();
  const q = userQuery || "events";

  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("engine", "google_events");
  url.searchParams.set("q", q);
  url.searchParams.set("location", trimmedLocation);
  url.searchParams.set("gl", "au");
  url.searchParams.set("hl", "en");
  url.searchParams.set("num", String(max));
  url.searchParams.set("api_key", env.serpapiKey);

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    console.error("[events] upstream fetch failed:", err instanceof Error ? err.message : err);
    return { status: "upstream_unavailable" };
  }

  if (!upstream.ok) {
    console.error(`[events] upstream non-2xx: ${upstream.status}`);
    return { status: "upstream_unavailable" };
  }

  let data: UpstreamResponse;
  try {
    data = (await upstream.json()) as UpstreamResponse;
  } catch {
    return { status: "upstream_unavailable" };
  }

  if (!Array.isArray(data.events_results)) return { status: "no_results" };

  const normalized: HealthEvent[] = [];
  for (const e of data.events_results) {
    const name = e.title?.trim();
    const url = e.link?.trim();
    const date = e.date?.when?.trim();
    if (!name || !url || !date) continue;
    const address = Array.isArray(e.address) ? e.address.filter(Boolean).join(", ") : "";
    const description = e.description ?? null;
    if (!isHealthRelevant(name, description, address)) continue;
    normalized.push({ name, date, location: address, url, description });
    if (normalized.length >= max) break;
  }

  if (normalized.length === 0) return { status: "no_results" };
  return { status: "ok", events: normalized };
}

function isHealthRelevant(name: string, description: string | null, address: string): boolean {
  const haystack = `${name} ${description ?? ""} ${address}`.toLowerCase();
  return HEALTH_KEYWORDS.some((kw) => haystack.includes(kw));
}
