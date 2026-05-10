import { describe, expect, it } from "vitest";
import { computeCostUsd } from "@/lib/ai/pricing";

describe("computeCostUsd", () => {
  it("computes cost for claude-sonnet-4-6 with input/output tokens", () => {
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    expect(cost).toBeCloseTo(18.0, 6);
  });

  it("includes cache read and cache write tokens", () => {
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(4.05, 6);
  });

  it("returns null for unknown model", () => {
    const cost = computeCostUsd("not-a-real-model", {
      input_tokens: 100,
      output_tokens: 100,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    expect(cost).toBeNull();
  });

  it("handles missing cache fields gracefully", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing the null-safety of optional cache fields
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    } as any);
    expect(cost).toBeCloseTo(3.0, 6);
  });
});
