import type { EventsSearchResult } from "@/lib/events/search-events";
import { searchEventsApi } from "@/lib/events/search-events";

export type FindHealthEventsInput = {
  location: string;
  query?: string;
  max_results?: number;
};

/**
 * Events Agent's tool wrapper. Surfaces the same typed result the `/api/events`
 * proxy returns — both share `searchEventsApi`. Never throws; a missing
 * location or any upstream failure resolves rather than rejects.
 */
export async function findHealthEvents(input: FindHealthEventsInput): Promise<EventsSearchResult> {
  return searchEventsApi(input);
}
