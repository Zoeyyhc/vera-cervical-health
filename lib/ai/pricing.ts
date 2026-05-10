import type Anthropic from "@anthropic-ai/sdk";

type ModelPrices = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
};

const PRICES: Record<string, ModelPrices> = {
  "claude-sonnet-4-6": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
};

type UsageLike = Pick<Anthropic.Usage, "input_tokens" | "output_tokens"> & {
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function computeCostUsd(model: string, usage: UsageLike): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (
    (usage.input_tokens * p.inputPerMillion +
      usage.output_tokens * p.outputPerMillion +
      cacheRead * p.cacheReadPerMillion +
      cacheWrite * p.cacheWritePerMillion) /
    1_000_000
  );
}
