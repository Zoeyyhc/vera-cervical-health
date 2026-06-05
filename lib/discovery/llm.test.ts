// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/ai/logged-anthropic", () => ({
  loggedMessagesCreate: vi.fn(),
}));

import { loggedMessagesCreate } from "@/lib/ai/logged-anthropic";
import { runDiscoveryLlm } from "./llm";
import { CLUSTER_GAPS_PROMPT } from "./prompts";

describe("runDiscoveryLlm", () => {
  beforeEach(() => vi.clearAllMocks());

  test("calls loggedMessagesCreate with the prompt + user content and returns concatenated text", async () => {
    vi.mocked(loggedMessagesCreate).mockResolvedValue({
      content: [
        { type: "text", text: "[" },
        { type: "text", text: "]" },
      ],
    } as never);

    const out = await runDiscoveryLlm(CLUSTER_GAPS_PROMPT, "USER", "discovery.cluster");

    expect(out).toBe("[]");
    const [params, meta] = vi.mocked(loggedMessagesCreate).mock.calls[0];
    expect(params.system).toBe(CLUSTER_GAPS_PROMPT.text);
    expect(params.messages).toEqual([{ role: "user", content: "USER" }]);
    expect(meta).toEqual({ agent: "discovery.cluster", prompt: CLUSTER_GAPS_PROMPT });
  });

  test("ignores non-text content blocks", async () => {
    vi.mocked(loggedMessagesCreate).mockResolvedValue({
      content: [
        { type: "tool_use", id: "x", name: "y", input: {} },
        { type: "text", text: "ok" },
      ],
    } as never);

    expect(await runDiscoveryLlm(CLUSTER_GAPS_PROMPT, "U", "a")).toBe("ok");
  });
});
