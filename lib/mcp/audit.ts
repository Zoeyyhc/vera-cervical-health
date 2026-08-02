import type { McpToolName } from "@/lib/mcp/schemas";
import type { Database, Json } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * MCP call audit. Spec §8: log tool name, sanitised input summary, result ids,
 * source ids, latency, outcome, and a correlation id — and do NOT log chat text,
 * location beyond the minimum required for audit, or health information.
 *
 * What that means concretely: the raw `query` string, the raw `location` string,
 * and any preference detail never reach this table. Only bounded scalars do —
 * whether a location was supplied, whether it resolved to Victoria, and the
 * enum-valued `topic`. There is no user id and no session id on the row either,
 * because the MCP server is never given them.
 */

export type McpOutcome = "ok" | "no_result" | "out_of_scope" | "invalid_input" | "error";

export type McpAuditEntry = {
  correlationId: string;
  toolName: McpToolName;
  /** Bounded scalars only — see the sanitisation note above. */
  inputSummary: Record<string, string | number | boolean>;
  resultIds: string[];
  sourceIds: string[];
  outcome: McpOutcome;
  latencyMs: number;
};

/**
 * Insert one audit row. Never throws: an audit failure must not turn a
 * successful read into a tool error for the user. Failures are logged
 * server-side instead.
 */
export async function logMcpCall(
  supabase: SupabaseClient<Database>,
  entry: McpAuditEntry
): Promise<void> {
  try {
    const { error } = await supabase.from("mcp_call_logs").insert({
      correlation_id: entry.correlationId,
      tool_name: entry.toolName,
      input_summary: entry.inputSummary as Json,
      result_ids: entry.resultIds,
      source_ids: entry.sourceIds,
      outcome: entry.outcome,
      latency_ms: entry.latencyMs,
    });
    if (error) {
      console.error("[mcp/audit] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[mcp/audit] insert threw:", err instanceof Error ? err.message : err);
  }
}
