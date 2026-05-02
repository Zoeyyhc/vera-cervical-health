// @vitest-environment node
// The OpenAI SDK refuses to instantiate under a browser-like global (jsdom —
// the default Vitest environment) to keep secrets out of bundles. Server-only
// modules under lib/ai/ run under the Node environment in tests.

import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { EMBEDDING_MODEL, getOpenAIClient } from "./openai";

describe("EMBEDDING_MODEL", () => {
  it("is hard-coded to text-embedding-3-small", () => {
    // Per CLAUDE.md: model strings are hard-coded, never from env.
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
  });
});

describe("getOpenAIClient", () => {
  it("returns an OpenAI SDK instance", () => {
    const client = getOpenAIClient();
    expect(client).toBeInstanceOf(OpenAI);
  });

  it("exposes the embeddings namespace", () => {
    const client = getOpenAIClient();
    expect(typeof client.embeddings.create).toBe("function");
  });
});
