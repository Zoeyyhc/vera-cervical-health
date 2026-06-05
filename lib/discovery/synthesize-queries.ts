import { runDiscoveryLlm } from "./llm";
import { SYNTHESIZE_QUERIES_PROMPT } from "./prompts";
import type { GapCluster } from "./types";

/**
 * Turn a gap cluster into 1–2 in-domain web search queries. Returns [] when
 * the topic is off-domain (LLM returns []) or the output can't be parsed.
 */
export async function synthesizeQueries(cluster: GapCluster): Promise<string[]> {
  const raw = await runDiscoveryLlm(
    SYNTHESIZE_QUERIES_PROMPT,
    cluster.theme,
    "discovery.synthesize-queries"
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((q): q is string => typeof q === "string" && q.trim().length > 0);
}
