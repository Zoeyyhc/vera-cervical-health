// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/mcp/audit", () => ({ logMcpCall: vi.fn() }));
vi.mock("@/lib/mcp/health-info", () => ({ searchVictoriaHealthInfo: vi.fn() }));
vi.mock("@/lib/mcp/directory", () => ({ findVictoriaScreeningServices: vi.fn() }));
vi.mock("@/lib/mcp/events", () => ({ listVictoriaVerifiedEvents: vi.fn() }));

import { logMcpCall } from "@/lib/mcp/audit";
import { findVictoriaScreeningServices } from "@/lib/mcp/directory";
import { listVictoriaVerifiedEvents } from "@/lib/mcp/events";
import { searchVictoriaHealthInfo } from "@/lib/mcp/health-info";
import { createVeraMcpServer } from "./server";

/**
 * Tool-handler behaviour: what gets audited, what the caller sees when a query
 * fails, and that the sanitisation promised in spec §8 actually holds.
 */

// biome-ignore lint/suspicious/noExplicitAny: the query layer is mocked
const supabase = {} as any;

/** Invoke a registered tool's callback directly. */
async function invoke(name: string, args: unknown) {
  const server = createVeraMcpServer(supabase);
  // biome-ignore lint/suspicious/noExplicitAny: intentional access to the private registry
  const tool = (server as any)._registeredTools[name];
  return tool.handler(args, { requestId: 1 });
}

function lastAudit() {
  const calls = vi.mocked(logMcpCall).mock.calls;
  return calls[calls.length - 1][1];
}

describe("MCP tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  test("a successful search is audited as ok with its result and source ids", async () => {
    vi.mocked(searchVictoriaHealthInfo).mockResolvedValue({
      items: [
        {
          id: "c1",
          title: "t",
          excerpt: "e",
          sourceName: "Dept",
          sourceUrl: "https://health.gov.au/x",
          jurisdiction: "AU",
          verification: "official_source",
          reviewedAt: "2026-08-01T00:00:00Z",
        },
      ],
      sourceIds: ["src-doh"],
    });

    const result = await invoke("search_victoria_health_info", { query: "screening test" });

    expect(result.structuredContent.items).toHaveLength(1);
    expect(lastAudit()).toMatchObject({
      toolName: "search_victoria_health_info",
      outcome: "ok",
      resultIds: ["c1"],
      sourceIds: ["src-doh"],
    });
  });

  test("the audit summary carries the query length, never the query text", async () => {
    vi.mocked(searchVictoriaHealthInfo).mockResolvedValue({
      items: [],
      noResultReason: "no_approved_match",
      sourceIds: [],
    });

    await invoke("search_victoria_health_info", { query: "am I pregnant and bleeding" });

    const entry = lastAudit();
    expect(entry.inputSummary).toEqual({ queryLength: 26 });
    expect(JSON.stringify(entry)).not.toContain("bleeding");
  });

  test("the audit summary carries the resolved scope, never the raw location", async () => {
    vi.mocked(findVictoriaScreeningServices).mockResolvedValue({
      directoryLinks: [],
      noResultReason: "no_approved_directory",
      sourceIds: [],
    });

    await invoke("find_victoria_screening_services", { location: "Kangaroo Ground VIC" });

    const entry = lastAudit();
    expect(entry.inputSummary).toEqual({
      hasLocation: true,
      inVictoria: true,
      scopeKind: "suburb",
    });
    expect(JSON.stringify(entry)).not.toContain("Kangaroo");
  });

  test("an out-of-Victoria non-result is audited as out_of_scope", async () => {
    vi.mocked(findVictoriaScreeningServices).mockResolvedValue({
      directoryLinks: [],
      noResultReason: "outside_victoria",
      sourceIds: [],
    });

    await invoke("find_victoria_screening_services", { location: "Sydney" });

    expect(lastAudit()).toMatchObject({ outcome: "out_of_scope" });
  });

  test("an empty-but-in-scope result is audited as no_result", async () => {
    vi.mocked(listVictoriaVerifiedEvents).mockResolvedValue({
      events: [],
      noResultReason: "no_upcoming_events",
      sourceIds: [],
    });

    await invoke("list_victoria_verified_events", {});

    expect(lastAudit()).toMatchObject({ outcome: "no_result" });
  });

  test("a failing query becomes a tool error, not a thrown exception", async () => {
    vi.mocked(listVictoriaVerifiedEvents).mockRejectedValue(new Error("db down"));

    const result = await invoke("list_victoria_verified_events", {});

    expect(result.isError).toBe(true);
    expect(lastAudit()).toMatchObject({ outcome: "error" });
  });

  test("a tool error message leaks no internal detail", async () => {
    vi.mocked(listVictoriaVerifiedEvents).mockRejectedValue(
      new Error('relation "verified_events" does not exist at character 42')
    );

    const result = await invoke("list_victoria_verified_events", {});

    // The tool name itself is fine; the underlying error text is not.
    expect(result.content[0].text).not.toContain("does not exist");
    expect(result.content[0].text).not.toContain("relation");
    expect(result.content[0].text).toBe(
      "list_victoria_verified_events is temporarily unavailable."
    );
  });

  test("each call gets its own correlation id", async () => {
    vi.mocked(listVictoriaVerifiedEvents).mockResolvedValue({
      events: [],
      noResultReason: "no_upcoming_events",
      sourceIds: [],
    });

    await invoke("list_victoria_verified_events", {});
    await invoke("list_victoria_verified_events", {});

    const [first, second] = vi.mocked(logMcpCall).mock.calls.map((c) => c[1].correlationId);
    expect(first).not.toBe(second);
  });

  test("events audit records only bounded flags for optional inputs", async () => {
    vi.mocked(listVictoriaVerifiedEvents).mockResolvedValue({
      events: [],
      noResultReason: "no_upcoming_events",
      sourceIds: [],
    });

    await invoke("list_victoria_verified_events", {
      location: "3053",
      topic: "hpv_vaccination",
      fromDate: "2026-09-01",
    });

    expect(lastAudit().inputSummary).toEqual({
      hasLocation: true,
      inVictoria: true,
      scopeKind: "postcode",
      topic: "hpv_vaccination",
      hasFromDate: true,
    });
  });
});
