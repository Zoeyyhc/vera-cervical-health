import {
  CROSS_STATE_LOCALITIES,
  MAX_LOCALITY_WORDS,
  NON_VIC_LOCALITIES,
  VIC_LOCALITIES,
} from "@/lib/mcp/vic-localities.generated";
import { normalizeLocation } from "@/lib/mcp/victoria";

/**
 * Where a turn is, and how confidently we know it.
 *
 * `resolveVictoriaScope` answers "could this be Victoria?" and is the gate at
 * the MCP boundary. This module answers the question the agent layer actually
 * needs — "do we know enough to act?" — and keeps the four ways of not knowing
 * apart, because each one deserves a different reply. Folding them into one
 * boolean is what let a Sydney user be told "no events found", as though a
 * search had run and come back empty.
 *
 * Nothing here asks a model to decide. An LLM may propose a candidate string,
 * but only an explicit state, a postcode, a trusted geolocation fix, or the
 * gazetteer itself can confirm one — spec §4 is a scope guarantee, not a guess.
 */

/** A reverse-geocoded browser fix. Fields are independently optional. */
export type GeoFix = {
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
};

/** What licensed us to call a location Victorian. Recorded for the audit trail. */
export type LocationEvidence = "explicit_state" | "postcode" | "geolocation" | "gazetteer";

export type LocationResolution =
  /** Safe to query the Victorian MCP with. */
  | {
      status: "confirmed_vic";
      locality: string;
      postcode?: string;
      evidence: LocationEvidence;
    }
  /** A real Victorian suburb name that other states also use. Ask; never guess. */
  | { status: "ambiguous"; locality: string; candidateStates: readonly string[] }
  /** A real place we do not cover. Explain the scope rather than asking again. */
  | { status: "outside_vic"; locality: string; state?: string }
  /** No location offered at all. */
  | { status: "missing" }
  /** Something was offered but names no place we know. */
  | { status: "unknown"; locality: string };

/** Australian state and territory abbreviations, plus the long forms we accept. */
const STATE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["vic", "VIC"],
  ["victoria", "VIC"],
  ["nsw", "NSW"],
  ["new south wales", "NSW"],
  ["qld", "QLD"],
  ["queensland", "QLD"],
  ["sa", "SA"],
  ["south australia", "SA"],
  ["wa", "WA"],
  ["western australia", "WA"],
  ["tas", "TAS"],
  ["tasmania", "TAS"],
  ["nt", "NT"],
  ["northern territory", "NT"],
  ["act", "ACT"],
  ["australian capital territory", "ACT"],
]);

/** Phrases meaning "anywhere in Victoria" rather than a specific suburb. */
const STATEWIDE_PHRASES: ReadonlySet<string> = new Set([
  "victoria",
  "vic",
  "statewide",
  "state wide",
  "regional victoria",
  "greater melbourne",
]);

/** Noise words stripped from the end before a lookup ("carlton australia"). */
const TRAILING_NOISE: ReadonlySet<string> = new Set(["australia", "au"]);

const COMPASS_SUFFIXES: ReadonlyArray<string> = ["north", "south", "east", "west"];

/**
 * Victorian localities whose names are also ordinary English words: Research,
 * Officer, Sale, Speed, Bass, Dollar, Hunter, Bright, Canadian.
 *
 * Derived by intersecting the single-word Victorian localities with the 3000
 * most frequent English words, then dropping entries that are only ever proper
 * nouns in practice (Dallas, Denver, Houston, Portland, Vermont, Dean).
 * Multi-word names are exempt — nobody writes "in box hill" meaning anything
 * but the suburb.
 *
 * These are blocked only on the lowercase extraction path, where there is no
 * proper-noun signal to lean on: "what happens in research" must not become a
 * location, while "screening in Research" and "research vic" still resolve.
 */
const COMMON_WORD_LOCALITIES: ReadonlySet<string> = new Set([
  "research",
  "officer",
  "sale",
  "speed",
  "bass",
  "dollar",
  "hunter",
  "bright",
  "canadian",
]);

/** A capitalised place, or a 4-digit postcode, after a location preposition. */
const CAPITALISED_HINT_RE =
  /\b(?:in|near|around|at|from)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*|\d{4})/;

/** Same prepositions, keeping the tail so it can be tested word by word. */
const LOCATION_TAIL_RE = /\b(?:in|near|around|at|from)\s+(.+)/i;

export type LocationInput = {
  /** The new user turn. */
  userMessage: string;
  /** Structured browser fix, when the client has one. */
  geo?: GeoFix | null;
};

/**
 * Classify an explicit location string — a bare follow-up reply ("burwood vic",
 * "3151"), or a phrase already pulled out of a message.
 *
 * Order is by strength of evidence: a postcode and an explicit state are things
 * the user asserted, so they outrank both the gazetteer and the browser's idea
 * of where they are. Someone in Melbourne asking about Burwood NSW for a
 * relative must not be answered about Burwood VIC.
 */
export function resolveLocationPhrase(phrase: string, geo?: GeoFix | null): LocationResolution {
  const normalized = normalizeLocation(phrase);
  if (normalized.length === 0) return { status: "missing" };

  // 1. A postcode anywhere in the string is the most precise thing on offer.
  const postcode = normalized.split(" ").find((t) => /^\d{4}$/.test(t));
  if (postcode) {
    const rest = stripTokens(normalized, [postcode]);
    return isVictorianPostcode(postcode)
      ? { status: "confirmed_vic", locality: rest || postcode, postcode, evidence: "postcode" }
      : { status: "outside_vic", locality: rest || postcode };
  }

  // 2. Whole-phrase statewide request.
  if (STATEWIDE_PHRASES.has(normalized)) {
    return { status: "confirmed_vic", locality: normalized, evidence: "explicit_state" };
  }

  // 3. An explicit trailing state marker settles the question either way.
  const { body, state } = splitTrailingState(normalized);
  if (state === "VIC") {
    return { status: "confirmed_vic", locality: body || normalized, evidence: "explicit_state" };
  }
  if (state) {
    return { status: "outside_vic", locality: body || normalized, state };
  }

  // 4. The gazetteer, with one trailing compass word as a spelling-variant net.
  for (const candidate of [body, stripCompassSuffix(body)]) {
    if (!candidate) continue;
    const resolution = classifyKnownLocality(candidate, body, geo);
    if (resolution) return resolution;
  }

  return { status: "unknown", locality: body || normalized };
}

/**
 * Look one name up in the three gazetteer sets. Returns `null` when the name is
 * in none of them, so the caller can try a variant spelling.
 */
function classifyKnownLocality(
  candidate: string,
  locality: string,
  geo?: GeoFix | null
): LocationResolution | null {
  const sharedWith = CROSS_STATE_LOCALITIES.get(candidate);
  if (sharedWith) {
    // Only a state-bearing fix corroborates. A bare city string is the weak
    // signal this whole change exists to stop trusting.
    return normalizeState(geo?.state) === "VIC"
      ? { status: "confirmed_vic", locality, evidence: "geolocation" }
      : { status: "ambiguous", locality, candidateStates: sharedWith };
  }
  if (VIC_LOCALITIES.has(candidate)) {
    return { status: "confirmed_vic", locality, evidence: "gazetteer" };
  }
  if (NON_VIC_LOCALITIES.has(candidate)) {
    return { status: "outside_vic", locality };
  }
  return null;
}

/**
 * Resolve the turn's location: what the user typed first, then the browser fix.
 *
 * The message wins because it is an assertion and the fix is an inference — and
 * because the fix is stale by construction, cached for the session while the
 * user may ask about three different suburbs.
 */
export function resolveLocation(input: LocationInput): LocationResolution {
  const phrase = extractLocationPhrase(input.userMessage);
  if (phrase !== null) return resolveLocationPhrase(phrase, input.geo);

  return input.geo ? resolveGeoFix(input.geo) : { status: "missing" };
}

/**
 * Resolve a structured browser fix. Its fields are read individually rather than
 * glued into a phrase, because the state is the whole reason the fix is worth
 * more than a bare city string and must not end up parsed as part of a name.
 */
function resolveGeoFix(geo: GeoFix): LocationResolution {
  const state = normalizeState(geo.state);
  const suburb = geo.suburb ? normalizeLocation(geo.suburb) : "";
  const raw = geo.postcode?.trim() ?? "";
  const postcode = /^\d{4}$/.test(raw) ? raw : undefined;

  if (state && state !== "VIC") {
    return { status: "outside_vic", locality: suburb || state, state };
  }
  if (state === "VIC") {
    return {
      status: "confirmed_vic",
      locality: suburb || "victoria",
      ...(postcode ? { postcode } : {}),
      evidence: "geolocation",
    };
  }
  if (postcode) {
    return isVictorianPostcode(postcode)
      ? {
          status: "confirmed_vic",
          locality: suburb || postcode,
          postcode,
          evidence: "geolocation",
        }
      : { status: "outside_vic", locality: suburb || postcode };
  }
  // A suburb with no state is only as good as the name itself — which is to say
  // ambiguous, for the 457 names that more than one state uses.
  return suburb ? resolveLocationPhrase(suburb, geo) : { status: "missing" };
}

/**
 * Pull a location out of a free-text message, or return `null`.
 *
 * Two passes, because the capital letter is doing real work. A capitalised word
 * after "in"/"near" announces itself as a proper noun, so it can be taken at
 * face value. A lowercase one cannot — "in the morning" would read as a place —
 * so the gazetteer has to supply the missing signal, and the common-word
 * localities are held back entirely.
 */
export function extractLocationPhrase(userMessage: string): string | null {
  const capitalised = userMessage.match(CAPITALISED_HINT_RE);
  if (capitalised) return capitalised[1].trim();

  const tail = userMessage.match(LOCATION_TAIL_RE);
  if (!tail) return null;

  // Word tokens only: "burwood east?" must not carry its punctuation into a
  // lookup, and normalizeLocation would strip it a step too late.
  const words = tail[1].toLowerCase().match(/[a-z0-9]+/g);
  if (!words) return null;

  // Longest window first, so "burwood east" wins over the "burwood" inside it,
  // and so "research vic" is seen before the bare "research" inside it.
  for (let n = Math.min(MAX_LOCALITY_WORDS + 1, words.length); n >= 1; n--) {
    const candidate = words.slice(0, n).join(" ");
    // An explicit state is corroboration enough on its own; it is what lets a
    // common-word suburb through, and what admits suburbs too new or too small
    // for the gazetteer.
    if (splitTrailingState(candidate).state !== null) return candidate;
    if (COMMON_WORD_LOCALITIES.has(candidate)) continue;
    if (isKnownLocality(candidate)) return candidate;
  }
  return null;
}

function isKnownLocality(candidate: string): boolean {
  if (VIC_LOCALITIES.has(candidate) || NON_VIC_LOCALITIES.has(candidate)) return true;
  if (/^\d{4}$/.test(candidate)) return true;
  const withoutCompass = stripCompassSuffix(candidate);
  return withoutCompass !== null && VIC_LOCALITIES.has(withoutCompass);
}

// ───── helpers ───────────────────────────────────────────────────────────────

function isVictorianPostcode(value: string): boolean {
  const n = Number(value);
  return (n >= 3000 && n <= 3999) || (n >= 8000 && n <= 8999);
}

function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return STATE_ALIASES.get(normalizeLocation(raw)) ?? null;
}

/** Split "burwood nsw" into `{ body: "burwood", state: "NSW" }`. */
function splitTrailingState(normalized: string): { body: string; state: string | null } {
  let body = normalized;
  let state: string | null = null;

  // Longest alias first, so "new south wales" is not read as a bare "wales".
  const aliases = Array.from(STATE_ALIASES.keys()).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (body === alias) break; // A bare state name is not a suburb called that.
    if (body.endsWith(` ${alias}`)) {
      state = STATE_ALIASES.get(alias) ?? null;
      body = body.slice(0, -(alias.length + 1)).trim();
      break;
    }
  }

  for (const noise of Array.from(TRAILING_NOISE)) {
    if (body.endsWith(` ${noise}`)) body = body.slice(0, -(noise.length + 1)).trim();
  }

  return { body, state };
}

function stripCompassSuffix(body: string): string | null {
  for (const compass of COMPASS_SUFFIXES) {
    if (body.endsWith(` ${compass}`)) {
      return body.slice(0, -(compass.length + 1)).trim() || null;
    }
  }
  return null;
}

function stripTokens(normalized: string, drop: string[]): string {
  return normalized
    .split(" ")
    .filter((t) => !drop.includes(t))
    .join(" ")
    .trim();
}
