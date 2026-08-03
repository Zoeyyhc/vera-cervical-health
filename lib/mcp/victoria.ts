/**
 * Victorian geographic scope resolution for the Trusted Health MCP.
 *
 * Spec §4: "A request is eligible when its resolved location is a Victorian
 * suburb or postcode, or when the request is for Victoria-wide information. The
 * MCP returns a clear non-result outside Victoria; it does not silently fall
 * back to nationwide search."
 *
 * The resolver is deliberately an allowlist. An unrecognised place name resolves
 * to NOT-Victoria, so the failure mode is "we only cover Victoria" rather than
 * serving Victorian directory links to someone in Sydney. `KNOWN_LOCALITIES`
 * covers Melbourne metro plus the regional centres; postcodes cover the rest of
 * the state, and admins extend the list as real traffic shows what is missing.
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
 * Burwood East, Bentleigh / Bentleigh East. Stripped only as a second pass, and
 * only from the end: a leading compass word makes its own locality (North
 * Melbourne is not Melbourne), and those are listed individually below.
 */
const COMPASS_SUFFIXES: ReadonlyArray<string> = ["north", "south", "east", "west"];

/**
 * Victorian localities recognised by name. Not exhaustive — a postcode always
 * works, and this list grows through the source registry review as gaps appear.
 */
const KNOWN_LOCALITIES: ReadonlySet<string> = new Set([
  // Melbourne CBD and inner
  "melbourne",
  "melbourne cbd",
  "carlton",
  "carlton north",
  "fitzroy",
  "collingwood",
  "abbotsford",
  "richmond",
  "south yarra",
  "prahran",
  "windsor",
  "st kilda",
  "south melbourne",
  "port melbourne",
  "albert park",
  "middle park",
  "docklands",
  "southbank",
  "east melbourne",
  "west melbourne",
  "north melbourne",
  "parkville",
  "kensington",
  "flemington",
  "brunswick",
  "brunswick east",
  "brunswick west",
  "coburg",
  "preston",
  "thornbury",
  "northcote",
  "clifton hill",
  "hawthorn",
  "kew",
  "camberwell",
  "balwyn",
  "canterbury",
  "surrey hills",
  "box hill",
  "burwood",
  "glen iris",
  "malvern",
  "armadale",
  "toorak",
  "caulfield",
  "elsternwick",
  "brighton",
  "bentleigh",
  "carnegie",
  "murrumbeena",
  "oakleigh",
  "clayton",
  "mount waverley",
  "glen waverley",
  "chadstone",
  "footscray",
  "yarraville",
  "seddon",
  "williamstown",
  "altona",
  "sunshine",
  "st albans",
  "essendon",
  "moonee ponds",
  "ascot vale",
  "pascoe vale",
  "glenroy",
  "broadmeadows",
  "craigieburn",
  "epping",
  "reservoir",
  "bundoora",
  "heidelberg",
  "ivanhoe",
  "eltham",
  "greensborough",
  "doncaster",
  "templestowe",
  "ringwood",
  "croydon",
  "lilydale",
  "bayswater",
  "boronia",
  "ferntree gully",
  "dandenong",
  "noble park",
  "springvale",
  "keysborough",
  "cheltenham",
  "mentone",
  "mordialloc",
  "chelsea",
  "carrum",
  "frankston",
  "seaford",
  "mornington",
  "mount eliza",
  "rosebud",
  "sorrento",
  "hastings",
  "cranbourne",
  "berwick",
  "narre warren",
  "pakenham",
  "officer",
  "werribee",
  "point cook",
  "hoppers crossing",
  "tarneit",
  "wyndham vale",
  "melton",
  "caroline springs",
  "sunbury",
  "gisborne",
  // Regional Victoria
  "geelong",
  "north geelong",
  "south geelong",
  "belmont",
  "ocean grove",
  "torquay",
  "queenscliff",
  "ballarat",
  "bendigo",
  "castlemaine",
  "kyneton",
  "daylesford",
  "shepparton",
  "wodonga",
  "wangaratta",
  "benalla",
  "seymour",
  "echuca",
  "swan hill",
  "mildura",
  "horsham",
  "ararat",
  "stawell",
  "hamilton",
  "portland",
  "warrnambool",
  "colac",
  "camperdown",
  "traralgon",
  "morwell",
  "moe",
  "sale",
  "bairnsdale",
  "lakes entrance",
  "orbost",
  "warragul",
  "drouin",
  "leongatha",
  "wonthaggi",
  "korumburra",
  "healesville",
  "yarra glen",
  "marysville",
  "bright",
  "myrtleford",
  "mansfield",
  "alexandra",
  "kilmore",
  "wallan",
  "romsey",
  "bacchus marsh",
  "maryborough",
  "st arnaud",
  "kerang",
  "cobram",
  "yarrawonga",
  "phillip island",
  "cowes",
  "inverloch",
  "apollo bay",
  "lorne",
]);

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

  // 4. Locality allowlist.
  if (KNOWN_LOCALITIES.has(body)) {
    return { inVictoria: true, kind: "suburb", normalized };
  }

  // 5. Same list, minus one trailing compass word. This admits the whole
  //    "<listed suburb> East/West/North/South" family without listing each part
  //    by hand, and stays as tight as the allowlist itself: the base name must
  //    still be listed, so "Bondi East" remains outside Victoria.
  const withoutCompass = stripCompassSuffix(body);
  if (withoutCompass && KNOWN_LOCALITIES.has(withoutCompass)) {
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
