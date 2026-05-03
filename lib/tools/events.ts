import { searchEventsApi } from "@/lib/events/search-events";
import type { HealthEvent } from "@/lib/validations/events";

export type FindHealthEventsInput = {
  location: string;
  query?: string;
  max_results?: number;
};

/**
 * Events Agent's tool wrapper. Surfaces the same data the `/api/events` proxy
 * returns — both share `searchEventsApi`. Never throws; returns `[]` on any
 * failure (including missing location).
 */
export async function findHealthEvents(input: FindHealthEventsInput): Promise<HealthEvent[]> {
  return searchEventsApi(input);
}
