import { env } from "@/lib/env";
import type { SearchResult } from "./types";

const SERPAPI_ENDPOINT = "https://serpapi.com/search";

type UpstreamOrganic = { title?: string | null; link?: string | null; snippet?: string | null };
type UpstreamResponse = { organic_results?: UpstreamOrganic[] };

/**
 * Web search via SerpAPI's google engine. Mirrors lib/events/search-events:
 * never throws, always resolves to an array (empty on any failure or empty
 * query). Caps results at `max` (1–10).
 */
export async function searchWeb(query: string, max: number): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cap = Math.min(Math.max(max, 1), 10);
  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", q);
  url.searchParams.set("num", String(cap));
  url.searchParams.set("api_key", env.serpapiKey);

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    console.error("[discovery] search fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }
  if (!upstream.ok) {
    console.error(`[discovery] search non-2xx: ${upstream.status}`);
    return [];
  }

  let data: UpstreamResponse;
  try {
    data = (await upstream.json()) as UpstreamResponse;
  } catch {
    return [];
  }
  if (!Array.isArray(data.organic_results)) return [];

  const out: SearchResult[] = [];
  for (const r of data.organic_results) {
    const title = r.title?.trim();
    const link = r.link?.trim();
    if (!title || !link) continue;
    out.push({ title, url: link, snippet: r.snippet?.trim() ?? "" });
    if (out.length >= cap) break;
  }
  return out;
}
