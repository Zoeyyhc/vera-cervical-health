// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/mcp/audit", () => ({ logMcpCall: vi.fn() }));

import { logMcpCall } from "@/lib/mcp/audit";
import { auditInvalidToolInput } from "./preflight";

/**
 * The SDK rejects malformed tool arguments before a handler runs, so without
 * this preflight a rejected call would leave no audit trace at all (spec §8
 * wants every call logged).
 */

// biome-ignore lint/suspicious/noExplicitAny: the audit sink is mocked
const supabase = {} as any;

function call(name: string, args: unknown) {
  return { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
}

describe("auditInvalidToolInput", () => {
  beforeEach(() => vi.clearAllMocks());

  test("logs invalid_input for a URL smuggled into location", async () => {
    await auditInvalidToolInput(
      supabase,
      call("find_victoria_screening_services", { location: "https://attacker.example.com" })
    );

    expect(logMcpCall).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logMcpCall).mock.calls[0][1]).toMatchObject({
      toolName: "find_victoria_screening_services",
      outcome: "invalid_input",
    });
  });

  test("does not record the rejected arguments", async () => {
    await auditInvalidToolInput(
      supabase,
      call("search_victoria_health_info", { query: "x", sourceUrl: "https://attacker.test" })
    );

    const entry = vi.mocked(logMcpCall).mock.calls[0][1];
    expect(entry.inputSummary).toEqual({ rejected: true });
    expect(JSON.stringify(entry)).not.toContain("attacker.test");
  });

  test("stays silent for a valid call — the handler audits that one", async () => {
    await auditInvalidToolInput(
      supabase,
      call("find_victoria_screening_services", {
        location: "Carlton",
      })
    );

    expect(logMcpCall).not.toHaveBeenCalled();
  });

  test("ignores non-tools/call messages", async () => {
    await auditInvalidToolInput(supabase, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    await auditInvalidToolInput(supabase, { jsonrpc: "2.0", id: 1, method: "initialize" });

    expect(logMcpCall).not.toHaveBeenCalled();
  });

  test("ignores an unknown tool name", async () => {
    await auditInvalidToolInput(supabase, call("delete_everything", { yes: true }));

    expect(logMcpCall).not.toHaveBeenCalled();
  });

  test("handles a batch, logging one row per invalid call", async () => {
    await auditInvalidToolInput(supabase, [
      call("find_victoria_screening_services", { location: "Carlton" }),
      call("find_victoria_screening_services", { location: "https://evil.test" }),
      call("list_victoria_verified_events", { fromDate: "not-a-date" }),
    ]);

    expect(logMcpCall).toHaveBeenCalledTimes(2);
  });

  test("treats missing arguments as an empty object", async () => {
    // list_victoria_verified_events takes no required field, so this is valid…
    await auditInvalidToolInput(supabase, call("list_victoria_verified_events", undefined));
    expect(logMcpCall).not.toHaveBeenCalled();

    // …whereas find_victoria_screening_services requires a location.
    await auditInvalidToolInput(supabase, call("find_victoria_screening_services", undefined));
    expect(logMcpCall).toHaveBeenCalledTimes(1);
  });

  test.each([null, "string", 42, { params: null }, { method: "tools/call" }])(
    "tolerates the malformed body %s without throwing",
    async (body) => {
      await expect(auditInvalidToolInput(supabase, body)).resolves.toBeUndefined();
    }
  );
});
