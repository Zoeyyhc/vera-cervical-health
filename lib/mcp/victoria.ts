import { VIC_LOCALITIES } from "@/lib/mcp/vic-localities.generated";

/**
 * Victorian geographic scope resolution for the Trusted Health MCP.
 *
 * Spec §4: "A request is eligible when its resolved location is a Victorian
 * suburb or postcode, or when the request is for Victoria-wide information. The
 * MCP returns a clear non-result outside Victoria; it does not silently fall
 * back to nationwide search."
 *
 * The resolver is an allowlist: an unrecognised place name resolves to
 * NOT-Victoria, so the failure mode is "we only cover Victoria" rather than
 * serving Victorian directory links to someone in Sydney. The list is the full
 * state gazetteer (`vic-localities.generated.ts`) rather than a hand-maintained
 * sample, because a hand-maintained sample produces the *other* failure: a
 * resident of Vermont, twenty kilometres from the CBD, told that we do not cover
 * their state.
 *
 * This function answers one narrow question — "could this string be in
 * Victoria?" — and is the gate at the MCP boundary, where the location has
 * already been disambiguated. It deliberately says nothing about whether a name
 * is *unambiguously* Victorian: "Richmond" passes here and exists in four other
 * states. That distinction belongs to the agent layer, before a tool is ever
 * called; see `resolveLocation` in `lib/agents/location.ts`.
 */

/** Victorian postcode ranges. 3xxx is the state; 8xxx is Melbourne PO-box space. */
const VIC_POSTCODE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [3000, 3999],
  [8000, 8999],
];

/** Tokens meaning "anywhere in Victoria" or "not tied to a place at all". */
const STATEWIDE_TOKENS: ReadonlySet<string> = new Set([
  "victoria",
  "vic",
  "statewide",
  "state wide",
  "regional victoria",
  "greater melbourne",
  "online",
  "virtual",
]);

/** Trailing state markers stripped before locality lookup ("Carlton VIC" → "carlton"). */
const STATE_SUFFIXES: ReadonlyArray<string> = ["victoria", "vic", "australia", "au"];

/**
 * Compass suffixes that split a Victorian locality into named parts — Burwood /
 * Burwood East, Bentleigh / Bentleigh East. The gazetteer lists both halves, so
 * this pass is now a spelling-variant net rather than a coverage mechanism: it
 * catches forms the dataset writes differently ("Wandin North" vs "North
 * Wandin"). Stripped only from the end, because a leading compass word makes its
 * own locality — North Melbourne is not Melbourne — and the base name must still
 * be in the gazetteer, so "Bondi East" stays outside Victoria.
 */
const COMPASS_SUFFIXES: ReadonlyArray<string> = ["north", "south", "east", "west"];

export type VictoriaScope =
  | {
      inVictoria: true;
      /** How the match was made — useful for the audit summary. */
      kind: "postcode" | "suburb" | "statewide";
      normalized: string;
    }
  | { inVictoria: false; normalized: string };

/** Lowercase, de-accent, drop punctuation, collapse whitespace. */
export function normalizeLocation(raw: string): string {
  return (
    raw
      .normalize("NFD")
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: stripping combining marks after NFD is exactly the intent, and these are all BMP code units; the rule's suggested `u` flag needs an es6 target, which this tsconfig does not set
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function isVictorianPostcode(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const n = Number(value);
  return VIC_POSTCODE_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
}

/**
 * Drop one trailing compass word, or return `null` when there is nothing left to
 * look up — a bare "east" is not a suburb whose name we happened to lose.
 */
function stripCompassSuffix(body: string): string | null {
  for (const compass of COMPASS_SUFFIXES) {
    if (body.endsWith(` ${compass}`)) {
      return body.slice(0, -(compass.length + 1)).trim() || null;
    }
  }
  return null;
}

/**
 * Resolve a free-text location to Victorian scope.
 *
 * Order matters: a postcode is decisive (in range or not), because "Sydney 3000"
 * is far more likely a typo'd Victorian postcode than a real Sydney address, and
 * either way a postcode is the more precise signal. Only then do we consider an
 * explicit state marker, then the locality allowlist.
 */
export function resolveVictoriaScope(raw: string): VictoriaScope {
  const normalized = normalizeLocation(raw);
  if (normalized.length === 0) return { inVictoria: false, normalized };

  const tokens = normalized.split(" ");

  // 1. Postcode anywhere in the string is decisive.
  const postcode = tokens.find((t) => /^\d{4}$/.test(t));
  if (postcode) {
    return isVictorianPostcode(postcode)
      ? { inVictoria: true, kind: "postcode", normalized }
      : { inVictoria: false, normalized };
  }

  // 2. Whole-string statewide phrase ("victoria", "regional victoria", "online").
  if (STATEWIDE_TOKENS.has(normalized)) {
    return { inVictoria: true, kind: "statewide", normalized };
  }

  // 3. Explicit trailing state marker ("carlton vic", "geelong victoria"). The
  //    marker is strong evidence on its own, so the remainder need not be in the
  //    locality list — that is what lets unlisted Victorian suburbs through.
  let body = normalized;
  let hadStateSuffix = false;
  for (const suffix of STATE_SUFFIXES) {
    if (body === suffix) continue;
    if (body.endsWith(` ${suffix}`)) {
      body = body.slice(0, -(suffix.length + 1)).trim();
      hadStateSuffix = hadStateSuffix || suffix === "vic" || suffix === "victoria";
    }
  }
  if (hadStateSuffix && body.length > 0) {
    return { inVictoria: true, kind: "suburb", normalized };
  }

  // 4. The state gazetteer.
  if (VIC_LOCALITIES.has(body)) {
    return { inVictoria: true, kind: "suburb", normalized };
  }

  // 5. Same gazetteer, minus one trailing compass word — see COMPASS_SUFFIXES.
  const withoutCompass = stripCompassSuffix(body);
  if (withoutCompass && VIC_LOCALITIES.has(withoutCompass)) {
    return { inVictoria: true, kind: "suburb", normalized };
  }

  return { inVictoria: false, normalized };
}

/**
 * Today's date in Australia/Melbourne as `YYYY-MM-DD`. The events tool defaults
 * `fromDate` to this, so "upcoming" means upcoming in the user's timezone rather
 * than the server's (spec §5.3).
 */
export function melbourneToday(now: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD, which is exactly the ISO date shape we want.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
