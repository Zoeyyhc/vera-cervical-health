import { AUTHORITY_ALLOWLIST, AUTHORITY_DENYLIST } from "./constants";
import { runDiscoveryLlm } from "./llm";
import { AUTHORITY_JUDGE_PROMPT } from "./prompts";
import type { CandidateScores, SearchResult } from "./types";

const ZERO: CandidateScores = { authorityScore: 0, relevanceScore: 0 };

/** True when `host` equals `domain` or is a subdomain of it. */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function clamp01(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0;
}

/**
 * Score a search result's authority + relevance (0–1 each). Denylisted hosts
 * short-circuit to authority 0 (caller drops). Allowlisted hosts floor
 * authority at 0.95. Everything else is judged by the LLM. Unparseable LLM
 * output or an invalid URL yields zero scores.
 */
export async function scoreAuthority(result: SearchResult): Promise<CandidateScores> {
  const host = hostnameOf(result.url);
  if (!host) return { ...ZERO };

  if (AUTHORITY_DENYLIST.some((d) => hostMatches(host, d))) return { ...ZERO };

  const raw = await runDiscoveryLlm(
    AUTHORITY_JUDGE_PROMPT,
    JSON.stringify({ url: result.url, title: result.title, snippet: result.snippet }),
    "discovery.authority-judge"
  );

  let parsed: { authority?: unknown; relevance?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...ZERO };
  }

  let authorityScore = clamp01(parsed.authority);
  const relevanceScore = clamp01(parsed.relevance);
  if (AUTHORITY_ALLOWLIST.some((d) => hostMatches(host, d))) {
    authorityScore = Math.max(authorityScore, 0.95);
  }
  return { authorityScore, relevanceScore };
}
