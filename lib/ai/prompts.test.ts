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

  it("promptHash is deterministic 64-char hex", () => {
    const a = promptHash("hello");
    const b = promptHash("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(promptHash("world"));
  });
});
