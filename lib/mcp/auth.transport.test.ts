// @vitest-environment node

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, expect, test } from "vitest";
import { authenticateMcpRequest } from "./auth";

/**
 * The seam lib/mcp/auth.test.ts cannot cover: it builds `Request` objects by
 * hand, so it can only assert what we *believe* a real caller sends.
 *
 * This ran in production for a day rejecting every single agent-layer call with
 * `browser_origin`, because the guard assumed "only browsers send Sec-Fetch-*"
 * — and Node's built-in fetch (undici), which the MCP SDK transport uses,
 * always sends `Sec-Fetch-Mode: cors`. Both unit suites passed throughout.
 *
 * So: drive the real StreamableHTTPClientTransport at a real socket, capture
 * the headers it actually put on the wire, and run them through the real guard.
 * If a future undici starts sending another Sec-Fetch-* header, this fails here
 * instead of silently degrading every Victorian turn to the non-MCP path.
 */

const TOKEN = "s3cret-token-value";

let captured: Request | null = null;
let server: ReturnType<typeof createServer>;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    captured = new Request("https://vera.test/api/mcp", {
      method: "POST",
      headers: Object.entries(req.headers).flatMap(([k, v]) =>
        typeof v === "string" ? [[k, v] as [string, string]] : []
      ),
    });
    // Close the turn immediately; we only care about the request headers.
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;

  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/api/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: "vera-agent-layer", version: "0.1.0" });
  // The 401 above makes connect reject; the headers are already captured.
  await client.connect(transport).catch(() => {});
  await client.close().catch(() => {});
});

afterAll(() => {
  server.close();
});

test("the MCP SDK transport reaches the wire at all", () => {
  expect(captured).not.toBeNull();
});

test("Node's fetch sends Sec-Fetch-Mode, so it cannot be a browser signal", () => {
  // Documents the fact that broke production. If this ever stops being true the
  // guard is merely stricter than it needs to be, which is safe.
  expect(captured?.headers.get("sec-fetch-mode")).toBe("cors");
});

test("sends none of the headers the guard treats as browser-only", () => {
  for (const header of ["sec-fetch-site", "sec-fetch-dest", "origin"]) {
    expect(`${header}=${captured?.headers.get(header)}`).toBe(`${header}=null`);
  }
});

test("the guard accepts a real agent-layer call carrying a valid token", () => {
  expect(captured).not.toBeNull();
  expect(authenticateMcpRequest(captured as Request, TOKEN)).toBeNull();
});

test("the guard still rejects that same call when the token is wrong", () => {
  expect(authenticateMcpRequest(captured as Request, "a-different-token")).toBe("invalid_token");
});
