import { env } from "@/lib/env";
import type { HealthEvent } from "@/lib/validations/events";

const SERPAPI_ENDPOINT = "https://serpapi.com/search";
const HEALTH_DOMAIN_BASE = "women's health OR cervical screening OR HPV";

export type SearchEventsInput = {
  location: string;
  query?: string;
  max_results?: number;
};

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
 * proxy. Never throws — always resolves to an array (empty on any failure)
 * so callers can degrade gracefully without try/catch boilerplate.
 *
 * Returns `[]` immediately when `location` is empty: SerpAPI requires it,
 * and we'd rather skip the round-trip than burn quota on a guaranteed-empty
 * search.
 */
export async function searchEventsApi({
  location,
  query = "",
  max_results = 5,
}: SearchEventsInput): Promise<HealthEvent[]> {
  const trimmedLocation = location.trim();
  if (!trimmedLocation) return [];

  const max = Math.min(Math.max(max_results, 1), 10);
  const userQuery = query.trim();
  const q = userQuery ? `(${userQuery}) AND (${HEALTH_DOMAIN_BASE})` : HEALTH_DOMAIN_BASE;

  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("engine", "google_events");
  url.searchParams.set("q", q);
  url.searchParams.set("location", trimmedLocation);
  url.searchParams.set("num", String(max));
  url.searchParams.set("api_key", env.serpapiKey);

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    console.error("[events] upstream fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }

  if (!upstream.ok) {
    console.error(`[events] upstream non-2xx: ${upstream.status}`);
    return [];
  }

  let data: UpstreamResponse;
  try {
    data = (await upstream.json()) as UpstreamResponse;
  } catch {
    return [];
  }

  if (!Array.isArray(data.events_results)) return [];

  const normalized: HealthEvent[] = [];
  for (const e of data.events_results) {
    const name = e.title?.trim();
    const url = e.link?.trim();
    const date = e.date?.when?.trim();
    if (!name || !url || !date) continue;
    const address = Array.isArray(e.address) ? e.address.filter(Boolean).join(", ") : "";
    normalized.push({
      name,
      date,
      location: address,
      url,
      description: e.description ?? null,
    });
    if (normalized.length >= max) break;
  }
  return normalized;
}
