import type { PromptDef } from "@/lib/ai/prompts";

/** Domain guardrail repeated across discovery prompts. */
const DOMAIN = "women's health, cervical health, and the HPV vaccine";

export const CLUSTER_GAPS_PROMPT: PromptDef = {
  id: "discovery.cluster-gaps",
  version: "v1",
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
  version: "v1",
  text: `You turn a knowledge-gap topic into web search queries that will surface authoritative medical content.

Return ONLY a JSON array of 1–2 search query strings (no prose, no markdown fences): ["query one", "query two"]

Rules:
- Queries MUST stay within ${DOMAIN}. If the topic is outside this domain, return [].
- Write queries a clinician would use to find guideline-grade sources.`,
};

export const AUTHORITY_JUDGE_PROMPT: PromptDef = {
  id: "discovery.authority-judge",
  version: "v1",
  text: `You rate a web search result as a source for a cervical-health knowledge base.

Input is a JSON object: { "url": string, "title": string, "snippet": string }.

Return ONLY a JSON object (no prose, no markdown fences):
{ "authority": <0..1>, "relevance": <0..1> }

- authority: how credible/guideline-grade the source is (government health bodies, medical associations, peer-reviewed = high; blogs, forums, shops = low).
- relevance: how on-topic it is for ${DOMAIN}.`,
};

export const SUMMARIZE_CANDIDATE_PROMPT: PromptDef = {
  id: "discovery.summarize-candidate",
  version: "v1",
  text: `You summarize an extracted health article for an admin reviewer and tag its topics.

Input is the article text. Return ONLY a JSON object (no prose, no markdown fences):
{ "summary": "<2-3 sentence summary>", "tags": ["<kebab-case topic>", ...] }

- Tags are short topic labels within ${DOMAIN}, e.g. "hpv-vaccine", "cervical-screening".
- 1–4 tags.`,
};
