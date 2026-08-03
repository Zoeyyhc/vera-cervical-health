import { env } from "@/lib/env";
import {
  type FindScreeningServicesInput,
  type FindScreeningServicesOutput,
  type ListVerifiedEventsInput,
  type ListVerifiedEventsOutput,
  type SearchHealthInfoInput,
  type SearchHealthInfoOutput,
  findScreeningServicesOutput,
  listVerifiedEventsOutput,
  searchHealthInfoOutput,
} from "@/lib/mcp/schemas";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Server-side MCP client for the Victoria Trusted Health MCP.
 *
 * Every call is best-effort. Spec §8: "Use timeouts and graceful empty results;
 * an unavailable MCP must not block the normal RAG or general-chat route." So
 * this module never throws — a timeout, a transport failure, a tool error, or an
 * output that does not match the contract all resolve to `null`, and callers
 * treat `null` as "no MCP contribution this turn".
 *
 * Only Vera's server-side agent layer imports this. The bearer token comes from
 * a non-public env var and is never sent to the browser.
 */

/** Wall-clock budget for one tool call, including connect. */
const CALL_TIMEOUT_MS = 5_000;

function baseUrl(): string {
  // `??` is not enough here: a var that exists but holds an empty string — the
  // shape a blank value in the Vercel dashboard takes — would pass the nullish
  // check and leave us building `new URL("/api/mcp")`, which throws. Treat
  // blank as unset so the default still applies.
  const configured = process.env.MCP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configured || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Open a client, call one tool, close. A fresh connection per call: the server
 * is stateless, calls are infrequent (at most one per chat turn), and a pooled
 * long-lived client would add reconnect handling for no measurable gain.
 */
async function callTool(name: string, args: Record<string, unknown>): Promise<unknown | null> {
  // Built inside its own guard, not as an argument further down: `new URL` on a
  // misconfigured base throws synchronously, and a throw here would escape the
  // "never throws" contract below and abort the whole chat turn rather than
  // degrading to RAG.
  let endpoint: URL;
  try {
    endpoint = new URL(`${baseUrl()}/api/mcp`);
  } catch {
    console.warn(
      `[mcp/client] ${name} skipped: MCP_BASE_URL / NEXT_PUBLIC_APP_URL is not a valid absolute URL`
    );
    return null;
  }

  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers: { authorization: `Bearer ${env.mcpAuthToken}` },
    },
  });
  const client = new Client({ name: "vera-agent-layer", version: "0.1.0" });

  try {
    await client.connect(transport);
    const result = await client.callTool({ name, arguments: args }, undefined, {
      timeout: CALL_TIMEOUT_MS,
    });

    if (result.isError) {
      console.warn(`[mcp/client] ${name} returned a tool error`);
      return null;
    }
    return result.structuredContent ?? null;
  } catch (err) {
    // Degrade quietly — the orchestrator carries on without the MCP.
    console.warn(`[mcp/client] ${name} unavailable:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    await client.close().catch(() => {});
  }
}

export async function searchVictoriaHealthInfoViaMcp(
  input: SearchHealthInfoInput
): Promise<SearchHealthInfoOutput | null> {
  const raw = await callTool("search_victoria_health_info", input);
  return parseOrNull(searchHealthInfoOutput, raw, "search_victoria_health_info");
}

export async function findVictoriaScreeningServicesViaMcp(
  input: FindScreeningServicesInput
): Promise<FindScreeningServicesOutput | null> {
  const raw = await callTool("find_victoria_screening_services", input);
  return parseOrNull(findScreeningServicesOutput, raw, "find_victoria_screening_services");
}

export async function listVictoriaVerifiedEventsViaMcp(
  input: ListVerifiedEventsInput
): Promise<ListVerifiedEventsOutput | null> {
  const raw = await callTool("list_victoria_verified_events", input);
  return parseOrNull(listVerifiedEventsOutput, raw, "list_victoria_verified_events");
}

/**
 * Validate the tool output against the same contract the server promised. The
 * client re-checks rather than trusting the wire: an output that drifts from the
 * schema (a missing `verification`, an absent `sourceUrl`) must not reach the
 * Response Agent as if it were governed content.
 */
function parseOrNull<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  raw: unknown,
  toolName: string
): T | null {
  if (raw === null) return null;
  const parsed = schema.safeParse(raw);
  if (!parsed.success || !parsed.data) {
    console.warn(`[mcp/client] ${toolName} returned output failing the contract; ignoring`);
    return null;
  }
  return parsed.data;
}
