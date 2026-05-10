// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { type AuditContext, auditContext } from "@/lib/ai/audit-context";
import { CLASSIFIER_PROMPT, promptHash } from "@/lib/ai/prompts";

vi.mock("@/lib/ai/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic")>();
  return { ...actual, getAnthropicClient: vi.fn() };
});

import { getAnthropicClient } from "@/lib/ai/anthropic";
import { loggedMessagesCreate } from "@/lib/ai/logged-anthropic";

function fakeCtx(insert: ReturnType<typeof vi.fn>): AuditContext {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: minimal supabase shape for assertions
    supabaseAdmin: { from: vi.fn(() => ({ insert })) } as any,
    userId: "u-1",
    sessionId: "s-1",
  };
}

describe("loggedMessagesCreate", () => {
  afterEach(() => vi.clearAllMocks());

  it("inserts an audit row on success", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "hi" }],
      usage: {
        input_tokens: 10,
        output_tokens: 3,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { create },
      // biome-ignore lint/suspicious/noExplicitAny: partial Anthropic surface
    } as any);

    await auditContext.run(fakeCtx(insert), async () => {
      await loggedMessagesCreate(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 16,
          temperature: 0,
          system: CLASSIFIER_PROMPT.text,
          messages: [{ role: "user", content: "hello" }],
        },
        { agent: "classifier", prompt: CLASSIFIER_PROMPT },
      );
    });

    await new Promise((r) => setImmediate(r));

    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: "u-1",
      session_id: "s-1",
      agent: "classifier",
      prompt_id: "classifier",
      prompt_version: "v1",
      prompt_hash: promptHash(CLASSIFIER_PROMPT.text),
      model: "claude-sonnet-4-6",
      temperature: 0,
      max_tokens: 16,
      streamed: false,
      input_tokens: 10,
      output_tokens: 3,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      status: "ok",
    });
    expect(row.duration_ms).toBeGreaterThanOrEqual(0);
    expect(row.cost_usd).toBeGreaterThan(0);
    expect(row.error_message).toBeNull();
  });

  it("inserts an error row and rethrows when the SDK throws", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const create = vi.fn().mockRejectedValue(new Error("boom"));
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { create },
      // biome-ignore lint/suspicious/noExplicitAny: partial Anthropic surface
    } as any);

    await expect(
      auditContext.run(fakeCtx(insert), () =>
        loggedMessagesCreate(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 16,
            system: "x",
            messages: [{ role: "user", content: "hi" }],
          },
          { agent: "classifier", prompt: CLASSIFIER_PROMPT },
        ),
      ),
    ).rejects.toThrow("boom");

    await new Promise((r) => setImmediate(r));
    const row = insert.mock.calls[0][0];
    expect(row.status).toBe("error");
    expect(row.error_message).toBe("boom");
    expect(row.input_tokens).toBe(0);
  });

  it("skips the insert when no audit context is active", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const create = vi.fn().mockResolvedValue({
      content: [],
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { create },
      // biome-ignore lint/suspicious/noExplicitAny: partial Anthropic surface
    } as any);

    await loggedMessagesCreate(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 8,
        system: "x",
        messages: [{ role: "user", content: "hi" }],
      },
      { agent: "classifier", prompt: CLASSIFIER_PROMPT },
    );

    await new Promise((r) => setImmediate(r));
    expect(insert).not.toHaveBeenCalled();
  });

  it("never throws when supabase insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "db down" } });
    const create = vi.fn().mockResolvedValue({
      content: [],
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { create },
      // biome-ignore lint/suspicious/noExplicitAny: partial Anthropic surface
    } as any);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      auditContext.run(fakeCtx(insert), () =>
        loggedMessagesCreate(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 8,
            system: "x",
            messages: [{ role: "user", content: "hi" }],
          },
          { agent: "classifier", prompt: CLASSIFIER_PROMPT },
        ),
      ),
    ).resolves.toBeDefined();

    await new Promise((r) => setImmediate(r));
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
