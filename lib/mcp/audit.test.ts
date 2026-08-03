// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";
import { logMcpCall } from "./audit";

/**
 * Spec §8: log the call, but "Do not log chat text, location beyond the minimum
 * required for audit, or sensitive health information." And an audit failure
 * must never break a successful read.
 */

function mockSupabase(error: { message: string } | null = null) {
  const insert = vi.fn().mockResolvedValue({ error });
  return { supabase: { from: vi.fn(() => ({ insert })) }, insert };
}

const ENTRY = {
  correlationId: "11111111-1111-4111-8111-111111111111",
  toolName: "search_victoria_health_info" as const,
  inputSummary: { queryLength: 40, topic: "screening" },
  resultIds: ["c1", "c2"],
  sourceIds: ["src-doh"],
  outcome: "ok" as const,
  latencyMs: 123,
};

describe("logMcpCall", () => {
  beforeEach(() => vi.clearAllMocks());

  test("writes the audit row to mcp_call_logs", async () => {
    const { supabase, insert } = mockSupabase();

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    await logMcpCall(supabase as any, ENTRY);

    expect(supabase.from).toHaveBeenCalledWith("mcp_call_logs");
    expect(insert).toHaveBeenCalledWith({
      correlation_id: ENTRY.correlationId,
      tool_name: "search_victoria_health_info",
      input_summary: { queryLength: 40, topic: "screening" },
      result_ids: ["c1", "c2"],
      source_ids: ["src-doh"],
      outcome: "ok",
      latency_ms: 123,
    });
  });

  test("records no user id or session id — the MCP is never given them", async () => {
    const { supabase, insert } = mockSupabase();

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    await logMcpCall(supabase as any, ENTRY);

    const row = insert.mock.calls[0][0];
    expect(row).not.toHaveProperty("user_id");
    expect(row).not.toHaveProperty("session_id");
  });

  test("swallows an insert error rather than failing the tool call", async () => {
    const { supabase } = mockSupabase({ message: "insert failed" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    await expect(logMcpCall(supabase as any, ENTRY)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test("swallows a thrown client error too", async () => {
    const supabase = {
      from: () => ({
        insert: () => {
          throw new Error("connection reset");
        },
      }),
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    await expect(logMcpCall(supabase as any, ENTRY)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
