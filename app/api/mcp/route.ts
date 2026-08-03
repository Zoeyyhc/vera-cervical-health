import { env } from "@/lib/env";
import { authenticateMcpRequest } from "@/lib/mcp/auth";
import { auditInvalidToolInput } from "@/lib/mcp/preflight";
import { createVeraMcpServer } from "@/lib/mcp/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

/**
 * Private Streamable HTTP MCP endpoint for the Victoria Trusted Health MCP.
 *
 * Callable ONLY by Vera's own server-side agent layer, over a bearer token that
 * never reaches the browser (see lib/mcp/auth.ts). There is no cookie/session
 * path into this route by design — being signed in, even as an admin, does not
 * grant access.
 *
 * Stateless: a fresh server + transport per request, so nothing carries between
 * callers. `enableJsonResponse` keeps responses as plain JSON rather than SSE,
 * which suits our request/response tool calls and Vercel's function model.
 *
 * The service-role client is used because trusted_sources / directory_links /
 * verified_events are admin-only by RLS. That is safe here precisely because the
 * route is unreachable without the server-only token, and because every tool
 * handler is read-only — see lib/mcp/server.ts.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const failure = authenticateMcpRequest(request, env.mcpAuthToken);
  if (failure) {
    console.warn(`[/api/mcp] rejected: ${failure}`);
    // Deliberately uniform: never tell a caller which guard it tripped.
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const supabase = createServiceRoleClient();
  const server = createVeraMcpServer(supabase);

  // Read the body once here and hand it to the transport as `parsedBody`, so the
  // invalid-input preflight can observe it without consuming the stream.
  let parsedBody: unknown;
  if (request.method === "POST") {
    try {
      parsedBody = await request.json();
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    await auditInvalidToolInput(supabase, parsedBody);
  }

  try {
    await server.connect(transport);
    return await transport.handleRequest(
      request,
      parsedBody === undefined ? undefined : { parsedBody }
    );
  } catch (err) {
    console.error("[/api/mcp] transport error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "mcp_unavailable" }, { status: 503 });
  } finally {
    // Stateless mode: tear the per-request instances down either way.
    await server.close().catch(() => {});
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
