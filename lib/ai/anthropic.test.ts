// @vitest-environment node
// The Anthropic SDK refuses to instantiate under a browser-like global
// (jsdom — the default Vitest environment) to keep secrets out of bundles.
// Server-only modules under lib/ai/ run under the Node environment in tests.

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { CLAUDE_FAST_MODEL, CLAUDE_MODEL, getAnthropicClient } from "./anthropic";

describe("CLAUDE_MODEL", () => {
  it("is hard-coded to claude-sonnet-4-6", () => {
    // Per CLAUDE.md: model string is hard-coded, never from env. The
    // user-facing response agent stays on Sonnet for answer quality.
    expect(CLAUDE_MODEL).toBe("claude-sonnet-4-6");
  });
});

describe("CLAUDE_FAST_MODEL", () => {
  it("is hard-coded to claude-haiku-4-5", () => {
    // Cheap model for non-user-facing calls (classifier, discovery).
    expect(CLAUDE_FAST_MODEL).toBe("claude-haiku-4-5");
  });
});

describe("getAnthropicClient", () => {
  it("returns an Anthropic SDK instance", () => {
    const client = getAnthropicClient();
    expect(client).toBeInstanceOf(Anthropic);
  });

  it("exposes the messages namespace", () => {
    const client = getAnthropicClient();
    expect(typeof client.messages.create).toBe("function");
  });
});
