import type { PromptDef } from "@/lib/ai/prompts";

/**
 * Domain guardrail repeated across discovery prompts. Intentionally broad:
 * women's health overall, NOT cervical/HPV only. The authority judge was scoring
 * guideline-grade discharge/menopause pages below the relevance floor because an
 * earlier, narrower string read as cervical-specific — so spell out the wider
 * gynecological / reproductive-health scope explicitly.
 */
const DOMAIN =
  "women's gynecological and reproductive health — including cervical health and the HPV vaccine, and also vaginal discharge, menstrual periods and bleeding, menopause and perimenopause, pelvic and vaginal symptoms, and related screening and care";

export const CLUSTER_GAPS_PROMPT: PromptDef = {
  id: "discovery.cluster-gaps",
  version: "v2",
  text: `You group user questions that our knowledge base answered poorly into a few distinct topic clusters.

Input is a JSON array of objects: { "id": string, "question": string }.

Return ONLY a JSON array (no prose, no markdown fences) of clusters:
[{ "theme": "<short topic label>", "gapEventIds": ["<id>", ...] }]

Rules:
- Merge questions about the same underlying topic into one cluster.
- Drop any question NOT about ${DOMAIN}.
- Use each id at most once. Omit ids you drop.
- Prefer fewer, well-separated clusters.`,
};

export const SYNTHESIZE_QUERIES_PROMPT: PromptDef = {
  id: "discovery.synthesize-queries",
  version: "v2",
  text: `You turn a knowledge-gap topic into web search queries that will surface authoritative medical content.

Return ONLY a JSON array of 1–2 search query strings (no prose, no markdown fences): ["query one", "query two"]

Rules:
- Queries MUST stay within ${DOMAIN}. If the topic is outside this domain, return [].
- Write queries a clinician would use to find guideline-grade sources.`,
};

export const AUTHORITY_JUDGE_PROMPT: PromptDef = {
  id: "discovery.authority-judge",
  version: "v2",
  text: `You rate a web search result as a source for a women's-health knowledge base.

Input is a JSON object: { "url": string, "title": string, "snippet": string }.

Return ONLY a JSON object (no prose, no markdown fences):
{ "authority": <0..1>, "relevance": <0..1> }

- authority: how credible/guideline-grade the source is (government health bodies, medical associations, peer-reviewed = high; blogs, forums, shops = low).
- relevance: how on-topic it is for ${DOMAIN}. Judge against this WHOLE domain — a guideline-grade page about vaginal discharge, menopause, periods, or other gynecological topics is highly relevant even if it never mentions cervical cancer or HPV. Do NOT penalise relevance just because a page is not specifically about the cervix.`,
};

export const SUMMARIZE_CANDIDATE_PROMPT: PromptDef = {
  id: "discovery.summarize-candidate",
  version: "v2",
  text: `You summarize an extracted health article for an admin reviewer and tag its topics.

Input is the article text. Return ONLY a JSON object (no prose, no markdown fences):
{ "summary": "<2-3 sentence summary>", "tags": ["<kebab-case topic>", ...] }

- Tags are short topic labels within ${DOMAIN}, e.g. "hpv-vaccine", "cervical-screening".
- 1–4 tags.`,
};
