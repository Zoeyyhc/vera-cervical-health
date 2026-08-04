import type { LocationResolution } from "@/lib/agents/location";

/**
 * How wide an events question is, which decides whether it may be answered
 * without knowing where the user is.
 *
 * Only `statewide` may query the MCP with no location. The other two are
 * location-collection flows: answering them from an empty statewide search
 * produces "I couldn't find any events for that location", a sentence about a
 * search that was never scoped to the user's location at all.
 */
export type EventsScope = "statewide" | "nearby" | "specified_location";

/** "near me", "nearby", "around here", "in my area". */
const NEARBY_RE =
  /\bnear\s?by\b|\b(?:near|around|close to|round)\s+(?:me|us|here|my\b)|\bin my area\b|\bmy local\b/i;

/** A request for the state as a whole rather than a place inside it. */
const STATEWIDE_RE = /\b(?:victoria|vic|state[\s-]?wide|across the state|anywhere in the state)\b/i;

/**
 * Statewide phrases `resolveLocation` confirms as Victorian. They name the whole
 * state, so they are not "a specific place the user asked about".
 */
const STATEWIDE_LOCALITIES: ReadonlySet<string> = new Set([
  "victoria",
  "vic",
  "statewide",
  "state wide",
  "regional victoria",
  "greater melbourne",
]);

export function detectEventsScope(
  userMessage: string,
  resolution: LocationResolution
): EventsScope {
  // Explicit "near me" wins over everything: "any events near me in Victoria"
  // is still a request about where the user is standing.
  if (NEARBY_RE.test(userMessage)) return "nearby";

  if (namesAPlace(resolution)) return "specified_location";
  if (STATEWIDE_RE.test(userMessage)) return "statewide";

  // No place named and no statewide marker — "are there any events coming up?".
  // Treat it as a nearby request so it collects a location rather than
  // silently answering for the whole state.
  return "nearby";
}

/** True when the turn named somewhere specific, wherever it turned out to be. */
function namesAPlace(resolution: LocationResolution): boolean {
  switch (resolution.status) {
    case "confirmed_vic":
      return !STATEWIDE_LOCALITIES.has(resolution.locality);
    case "ambiguous":
    case "outside_vic":
      return true;
    default:
      return false;
  }
}
