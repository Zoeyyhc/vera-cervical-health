import { randomUUID } from "node:crypto";
import { logMcpCall } from "@/lib/mcp/audit";
import {
  MCP_TOOL_NAMES,
  type McpToolName,
  findScreeningServicesInput,
  listVerifiedEventsInput,
  searchHealthInfoInput,
} from "@/lib/mcp/schemas";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

/**
 * Audit for calls the tool schema rejects.
 *
 * The MCP SDK validates `tools/call` arguments before a handler runs, so a
 * malformed call — a URL smuggled into `location`, an unknown key, an
 * out-of-range query — never reaches the audited path in lib/mcp/server.ts.
 * Spec §8 wants every call logged, so the route runs this preflight first and
 * records an `invalid_input` row. The request still proceeds: the SDK produces
 * the proper JSON-RPC validation error, and this only observes.
 *
 * Nothing here rejects, transforms, or otherwise influences the request.
 */

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous Zod object schemas keyed by tool name
const INPUT_SCHEMAS: Record<McpToolName, z.ZodType<any>> = {
  search_victoria_health_info: searchHealthInfoInput,
  find_victoria_screening_services: findScreeningServicesInput,
  list_victoria_verified_events: listVerifiedEventsInput,
};

function isToolName(value: unknown): value is McpToolName {
  return typeof value === "string" && (MCP_TOOL_NAMES as readonly string[]).includes(value);
}

/**
 * Inspect an already-parsed JSON-RPC body and log an `invalid_input` row for any
 * `tools/call` whose arguments fail validation. Handles both a single message
 * and a batch. Never throws.
 */
export async function auditInvalidToolInput(
  supabase: SupabaseClient<Database>,
  body: unknown
): Promise<void> {
  const messages = Array.isArray(body) ? body : [body];

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as Record<string, unknown>;
    if (record.method !== "tools/call") continue;

    const params = record.params;
    if (!params || typeof params !== "object") continue;
    const { name, arguments: args } = params as Record<string, unknown>;
    if (!isToolName(name)) continue;

    if (INPUT_SCHEMAS[name].safeParse(args ?? {}).success) continue;

    await logMcpCall(supabase, {
      correlationId: randomUUID(),
      toolName: name,
      // The rejected arguments are NOT recorded — a malformed input is exactly
      // the case where the payload is most likely to be hostile or to contain
      // something we promised not to store.
      inputSummary: { rejected: true },
      resultIds: [],
      sourceIds: [],
      outcome: "invalid_input",
      latencyMs: 0,
    });
  }
}
