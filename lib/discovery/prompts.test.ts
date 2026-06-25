import { describe, expect, it } from "vitest";
import {
  AUTHORITY_JUDGE_PROMPT,
  CLUSTER_GAPS_PROMPT,
  SUMMARIZE_CANDIDATE_PROMPT,
  SYNTHESIZE_QUERIES_PROMPT,
} from "./prompts";

// Regression: the authority-judge scored guideline-grade women's-health pages
// (CDC normal-discharge guidance, WHO/NIH/ACOG menopause pages) at relevance
// 0.1–0.55 — below RELEVANCE_MIN (0.6) — because the shared domain string read
// as cervical/HPV-only. Every result was dropped before staging, so a run that
// mined real gaps still staged 0 candidates. The domain must explicitly embrace
// broader gynecological / reproductive-health topics so on-topic sources clear
// the relevance floor.
const BROAD_DOMAIN_TERMS = ["discharge", "menopause", "menstru"];

describe("discovery prompt domain coverage", () => {
  const prompts = {
    CLUSTER_GAPS_PROMPT,
    SYNTHESIZE_QUERIES_PROMPT,
    AUTHORITY_JUDGE_PROMPT,
    SUMMARIZE_CANDIDATE_PROMPT,
  };

  for (const [name, prompt] of Object.entries(prompts)) {
    it(`${name} names the broader gynecological / reproductive-health domain`, () => {
      const text = prompt.text.toLowerCase();
      for (const term of BROAD_DOMAIN_TERMS) {
        expect(text, `${name} should mention "${term}"`).toContain(term);
      }
    });
  }
});
