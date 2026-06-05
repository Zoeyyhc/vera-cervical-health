/** Hostnames whose content is treated as inherently authoritative. Matched by
 *  suffix (so "www.who.int" matches "who.int"). LLM authority is floored to
 *  0.95 for these. */
export const AUTHORITY_ALLOWLIST = [
  "who.int",
  "cdc.gov",
  "nhs.uk",
  "acog.org",
  "cancer.gov",
  "cancer.org",
  "cancer.org.au",
  "cancercouncil.com.au",
  "healthdirect.gov.au",
  "mayoclinic.org",
] as const;

/** Hostnames we never ingest from (forums, social, content farms). Authority
 *  forced to 0 → dropped before fetch. */
export const AUTHORITY_DENYLIST = [
  "reddit.com",
  "quora.com",
  "pinterest.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "medium.com",
] as const;

/** Coverage-gap lookback window for mining. */
export const GAP_LOOKBACK_DAYS = 30;

/** Max gap clusters processed per run (bounded batch). */
export const MAX_GAP_CLUSTERS = 5;

/** Max search results pulled per query. */
export const MAX_RESULTS_PER_QUERY = 5;

/** Hard cap on candidates staged in a single run. */
export const MAX_CANDIDATES_PER_RUN = 15;

/** Wall-clock budget for one run (ms). Guards the 300s function limit: many
 *  search results may be processed (each an LLM authority call) while few get
 *  staged, so the staged-candidate cap alone doesn't bound runtime. */
export const RUN_BUDGET_MS = 240_000;

/** Authority/relevance floors — below either, a candidate is dropped. */
export const AUTHORITY_MIN = 0.6;
export const RELEVANCE_MIN = 0.6;

/** KB-similarity at/above which a candidate is considered already covered. */
export const DEDUP_THRESHOLD = 0.9;

/** Chars of extracted content embedded for the dedup similarity check. */
export const DEDUP_SNIPPET_CHARS = 2000;

/** Max extracted content size (bytes), mirrors the ingest route cap. */
export const MAX_CONTENT_BYTES = 512_000;
