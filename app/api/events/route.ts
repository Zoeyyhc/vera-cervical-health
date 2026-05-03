import { searchEventsApi } from "@/lib/events/search-events";
import { eventsQuerySchema } from "@/lib/validations/events";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = eventsQuerySchema.safeParse({
    location: searchParams.get("location") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    max: searchParams.get("max") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const events = await searchEventsApi({
    location: parsed.data.location,
    query: parsed.data.q,
    max_results: parsed.data.max,
  });

  if (events.length === 0) {
    return Response.json({ events: [], error: "unavailable" });
  }
  return Response.json({ events });
}
