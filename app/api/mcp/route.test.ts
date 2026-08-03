// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { mcpAuthToken: "test-token" } }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn(() => ({})) }));
vi.mock("@/lib/mcp/preflight", () => ({ auditInvalidToolInput: vi.fn() }));

const handleRequest = vi.fn();
const connect = vi.fn();
const close = vi.fn();

vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => ({
  WebStandardStreamableHTTPServerTransport: vi.fn(function MockTransport() {
    return { handleRequest };
  }),
}));
vi.mock("@/lib/mcp/server", () => ({ createVeraMcpServer: vi.fn(() => ({ connect, close })) }));

import { auditInvalidToolInput } from "@/lib/mcp/preflight";
import { createVeraMcpServer } from "@/lib/mcp/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { POST } from "./route";

const BODY = { jsonrpc: "2.0", id: 1, method: "tools/list" };

function req(headers: Record<string, string> = {}, body: unknown = BODY) {
  return new Request("https://vera.test/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const AUTH = { authorization: "Bearer test-token" };

describe("POST /api/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
    handleRequest.mockResolvedValue(Response.json({ ok: true }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  test("serves an authenticated server-to-server request", async () => {
    const res = await POST(req(AUTH));

    expect(res.status).toBe(200);
    expect(createVeraMcpServer).toHaveBeenCalled();
    expect(handleRequest).toHaveBeenCalled();
  });

  test("rejects a request with no token, without constructing a server", async () => {
    const res = await POST(req());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(createVeraMcpServer).not.toHaveBeenCalled();
  });

  test("rejects a wrong token", async () => {
    const res = await POST(req({ authorization: "Bearer nope" }));

    expect(res.status).toBe(401);
    expect(createVeraMcpServer).not.toHaveBeenCalled();
  });

  test("rejects a browser request even when it carries a valid token", async () => {
    // `sec-fetch-site` rather than `sec-fetch-mode`: Node's own HTTP stack
    // sends the latter, so it never marked a browser. See lib/mcp/auth.ts.
    const res = await POST(req({ ...AUTH, "sec-fetch-site": "cross-site" }));

    expect(res.status).toBe(401);
    expect(createVeraMcpServer).not.toHaveBeenCalled();
  });

  test("gives the same opaque error for every rejection reason", async () => {
    const bodies = await Promise.all(
      [
        req(),
        req({ authorization: "Bearer nope" }),
        req({ ...AUTH, "sec-fetch-site": "same-origin" }),
      ].map(async (r) => (await POST(r)).json())
    );

    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  test("there is no session-cookie path into the route", async () => {
    const res = await POST(req({ cookie: "sb-access-token=admin-session" }));

    expect(res.status).toBe(401);
  });

  test("rejects a malformed JSON body", async () => {
    const res = await POST(
      new Request("https://vera.test/api/mcp", {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: "{not json",
      })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });

  test("runs the invalid-input audit and passes the parsed body to the transport", async () => {
    await POST(req(AUTH));

    expect(auditInvalidToolInput).toHaveBeenCalledWith(expect.anything(), BODY);
    expect(handleRequest).toHaveBeenCalledWith(expect.anything(), { parsedBody: BODY });
  });

  test("runs statelessly — no session id generator", async () => {
    await POST(req(AUTH));

    const opts = vi.mocked(WebStandardStreamableHTTPServerTransport).mock.calls[0][0];
    expect(opts?.sessionIdGenerator).toBeUndefined();
    expect(opts?.enableJsonResponse).toBe(true);
  });

  test("returns 503 rather than throwing when the transport fails", async () => {
    handleRequest.mockRejectedValue(new Error("transport exploded"));

    const res = await POST(req(AUTH));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "mcp_unavailable" });
  });

  test("tears the per-request server down either way", async () => {
    await POST(req(AUTH));
    expect(close).toHaveBeenCalledTimes(1);

    handleRequest.mockRejectedValue(new Error("boom"));
    await POST(req(AUTH));
    expect(close).toHaveBeenCalledTimes(2);
  });
});
