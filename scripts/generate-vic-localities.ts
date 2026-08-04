/**
 * Regenerate `lib/mcp/vic-localities.generated.ts` — the Victorian gazetteer the
 * Trusted Health MCP resolves locations against.
 *
 * Run:
 *   pnpm vic:localities                          # fetch the pinned revision
 *   pnpm vic:localities --csv ./australian_postcodes.csv
 *   pnpm vic:localities --ref master             # refresh against latest
 *
 * This runs at development time only. The dataset is never fetched at runtime:
 * the generated module is checked in, so `resolveVictoriaScope` stays a pure
 * synchronous function with no I/O and no network dependency in production.
 *
 * Provenance
 * ----------
 * Source: github.com/matthewproctor/australianpostcodes — a community
 * compilation of Australian postcode/locality data, pinned by commit SHA below
 * so a regeneration is reproducible.
 *
 * The repository publishes no LICENSE file; its README states the author
 * considers the data "arguably public domain". We take only the three factual
 * columns we need — locality name, state, postcode — and none of the
 * compilation's enriched geography (coordinates, SA1-SA4, electorates, PHN).
 * See `docs/trusted-health-mcp.md` for the attribution note.
 */

import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { normalizeLocation } from "../lib/mcp/victoria";

/** Pinned dataset revision. Bump deliberately, and re-run the test suite after. */
const DATASET_REPO = "matthewproctor/australianpostcodes";
const DATASET_SHA = "eda59e4a987d46dbfb1d6bc644a383d322aa3d8d";
const DATASET_FILE = "australian_postcodes.csv";

const OUTPUT_PATH = "lib/mcp/vic-localities.generated.ts";

/**
 * Rows worth keeping. `Delivery Area` excludes the PO-box-only and large-volume
 * receiver entries, whose "locality" is a mail facility rather than a place —
 * without this filter the gazetteer picks up names like "Melbourne Business
 * Centre" and "Were Street PO". `Removed` rows are retired localities.
 */
function isDeliverableLocality(row: Record<string, string>): boolean {
  return (
    row.type === "Delivery Area" &&
    !row.status.startsWith("Removed") &&
    !MAIL_FACILITY_RE.test(row.locality)
  );
}

/**
 * Australia Post facility codes used as a name suffix: PO/LPO (post office),
 * DC/MDC (delivery centre), MC (mail centre), BC (business centre). The dataset
 * types nine Victorian rows like "Epping DC" and "Were Street PO" as delivery
 * areas even though they name a counter, not a place. No Victorian suburb ends
 * in one of these tokens, so the suffix is a safe discriminator.
 */
const MAIL_FACILITY_RE = /\b(?:PO|LPO|DC|MDC|MC|BC)$/i;

/**
 * Victorian postcodes are 3xxx, plus 8xxx for Melbourne PO-box space. Requiring
 * a Victorian row to carry one is a sanity check on a community-maintained
 * dataset, not a second source of truth: it is what keeps the joke entry
 * "NORTH POLE, VIC, 9999" out of the gazetteer.
 */
function hasVictorianPostcode(row: Record<string, string>): boolean {
  if (!/^\d{4}$/.test(row.postcode)) return false;
  const n = Number(row.postcode);
  return (n >= 3000 && n <= 3999) || (n >= 8000 && n <= 8999);
}

async function loadCsv(): Promise<string> {
  const csvFlag = flag("--csv");
  if (csvFlag) return readFile(csvFlag, "utf8");

  const ref = flag("--ref") ?? DATASET_SHA;
  const url = `https://raw.githubusercontent.com/${DATASET_REPO}/${ref}/${DATASET_FILE}`;
  process.stderr.write(`fetching ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`dataset fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Minimal CSV reader. The dataset quotes fields containing commas but has no
 * embedded newlines, so a line-by-line pass with quote tracking is sufficient —
 * not worth a dependency.
 */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const header = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key] = cells[i] ?? "";
    });
    return row;
  });
}

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // A doubled quote inside a quoted field is a literal quote.
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function serializeSet(name: string, values: Iterable<string>, doc: string): string {
  const sorted = Array.from(values).sort();
  const body = sorted.map((v) => `  ${JSON.stringify(v)},`).join("\n");
  return `${doc}\nexport const ${name}: ReadonlySet<string> = new Set([\n${body}\n]);\n`;
}

function serializeStateMap(name: string, entries: Map<string, Set<string>>, doc: string): string {
  const body = Array.from(entries.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `  [${JSON.stringify(k)}, ${JSON.stringify(Array.from(v).sort())}],`)
    .join("\n");
  return `${doc}\nexport const ${name}: ReadonlyMap<string, readonly string[]> = new Map([\n${body}\n]);\n`;
}

async function main() {
  const rows = parseCsv(await loadCsv()).filter(isDeliverableLocality);
  if (rows.length === 0) throw new Error("no deliverable rows parsed — dataset shape changed?");

  // One pass builds both the Victorian gazetteer and the cross-state index. The
  // normalizer is imported from victoria.ts rather than reimplemented, so the
  // generated keys cannot drift from the keys looked up at runtime.
  const statesByLocality = new Map<string, Set<string>>();

  for (const row of rows) {
    if (row.state === "VIC" && !hasVictorianPostcode(row)) continue;
    const locality = normalizeLocation(row.locality);
    if (locality.length === 0) continue;
    const states = statesByLocality.get(locality) ?? new Set<string>();
    states.add(row.state);
    statesByLocality.set(locality, states);
  }

  const vicLocalities = new Set<string>();
  const crossState = new Map<string, Set<string>>();
  const nonVicLocalities = new Set<string>();
  for (const [locality, states] of Array.from(statesByLocality.entries())) {
    if (!states.has("VIC")) {
      nonVicLocalities.add(locality);
      continue;
    }
    vicLocalities.add(locality);
    if (states.size > 1) crossState.set(locality, states);
  }

  const maxWords = Math.max(...Array.from(vicLocalities, (n) => n.split(" ").length));

  const contents = `// GENERATED FILE — do not edit by hand.
// Regenerate with: pnpm vic:localities
//
// Source: https://github.com/${DATASET_REPO}
// Revision: ${DATASET_SHA}
// Filters: type === "Delivery Area"; status not beginning "Removed"; name not
// ending in a mail-facility code (PO/LPO/DC/MDC/MC/BC); Victorian rows must
// carry a 3xxx or 8xxx postcode.
// Extracted columns: locality, state, postcode. Nothing else from the dataset is
// used. See scripts/generate-vic-localities.ts for provenance and licensing.

${serializeSet(
  "VIC_LOCALITIES",
  vicLocalities,
  `/**
 * Every Victorian locality name, normalized by \`normalizeLocation\`.
 * ${vicLocalities.size} entries.
 */`
)}
${serializeStateMap(
  "CROSS_STATE_LOCALITIES",
  crossState,
  `/**
 * Victorian locality names that also name a locality in another state, mapped to
 * every state that has one — Richmond, Brighton, St Kilda, Preston.
 * ${crossState.size} entries.
 *
 * Naming one of these is not evidence of being in Victoria, so the agent layer
 * requires corroboration (an explicit state, a postcode, or a geolocation fix)
 * before routing the turn to the Victorian MCP. Serving Victorian directory
 * links to someone in Richmond NSW is the failure spec §4 exists to prevent.
 * The state list is carried so the clarifying question can name the candidates
 * instead of asking a vague "which state?".
 */`
)}
${serializeSet(
  "NON_VIC_LOCALITIES",
  nonVicLocalities,
  `/**
 * Australian locality names with no Victorian entry. ${nonVicLocalities.size} entries.
 *
 * Carried so the agent layer can tell "a real place we do not cover" from "not a
 * place at all". Both resolve to no Victorian result, but they deserve different
 * replies: naming Sydney should get the out-of-scope explanation, while "in the
 * morning" should get the ordinary location question. Without this, an
 * out-of-state user is asked for their suburb, answers with the same suburb, and
 * loops.
 */`
)}
/**
 * Word count of the longest Victorian locality name ("bell bird creek east" and
 * friends). Bounds the sliding window the message-extractor tries.
 */
export const MAX_LOCALITY_WORDS = ${maxWords};
`;

  writeFileSync(OUTPUT_PATH, contents);
  process.stderr.write(
    `wrote ${OUTPUT_PATH}: ${vicLocalities.size} VIC localities, ${crossState.size} cross-state, ` +
      `${nonVicLocalities.size} non-VIC, max ${maxWords} words\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
