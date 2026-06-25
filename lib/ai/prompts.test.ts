import { CLASSIFIER_PROMPT, RESPONSE_DEFAULT_PROMPT, promptHash } from "@/lib/ai/prompts";
import { describe, expect, it } from "vitest";

describe("prompt registry", () => {
  it("CLASSIFIER_PROMPT is a complete record", () => {
    expect(CLASSIFIER_PROMPT.id).toBe("classifier");
    expect(CLASSIFIER_PROMPT.version).toMatch(/^v\d+$/);
    expect(CLASSIFIER_PROMPT.text.length).toBeGreaterThan(0);
  });

  it("RESPONSE_DEFAULT_PROMPT is a complete record", () => {
    expect(RESPONSE_DEFAULT_PROMPT.id).toBe("response.default");
    expect(RESPONSE_DEFAULT_PROMPT.version).toMatch(/^v\d+$/);
    expect(RESPONSE_DEFAULT_PROMPT.text.length).toBeGreaterThan(0);
  });

  it("CLASSIFIER_PROMPT routes vaginal/discharge/menstrual symptom questions to health_question", () => {
    // Regression: "What is considered 'normal' discharge?" was misclassified as
    // general_chat because the health_question description read as cervical-only.
    // It must name the broader gynecological / reproductive-health symptom
    // vocabulary so the classifier covers questions like normal discharge,
    // periods, and bleeding. Without this, RAG never runs and no rag_gap is
    // recorded, so the discovery pipeline never learns about the gap.
    const text = CLASSIFIER_PROMPT.text.toLowerCase();
    expect(text).toContain("discharge");
    expect(text).toContain("menstru");
    expect(text).toContain("gynecological");
  });

  it("promptHash is deterministic 64-char hex", () => {
    const a = promptHash("hello");
    const b = promptHash("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(promptHash("world"));
  });
});
