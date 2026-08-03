// @vitest-environment node

import { describe, expect, test } from "vitest";
import { authenticateMcpRequest } from "./auth";

/**
 * Spec §8: "The MCP endpoint is authenticated service-to-service and is not
 * exposed to browsers."
 */

const TOKEN = "s3cret-token-value";

function req(headers: Record<string, string> = {}) {
  return new Request("https://vera.test/api/mcp", { method: "POST", headers });
}

describe("authenticateMcpRequest", () => {
  test("accepts the correct bearer token", () => {
    expect(authenticateMcpRequest(req({ authorization: `Bearer ${TOKEN}` }), TOKEN)).toBeNull();
  });

  test("is case-insensitive on the scheme", () => {
    expect(authenticateMcpRequest(req({ authorization: `bearer ${TOKEN}` }), TOKEN)).toBeNull();
  });

  test("rejects a missing header", () => {
    expect(authenticateMcpRequest(req(), TOKEN)).toBe("missing_token");
  });

  test("rejects a non-bearer scheme", () => {
    expect(authenticateMcpRequest(req({ authorization: `Basic ${TOKEN}` }), TOKEN)).toBe(
      "missing_token"
    );
  });

  test("rejects an empty bearer value", () => {
    expect(authenticateMcpRequest(req({ authorization: "Bearer " }), TOKEN)).toBe("missing_token");
  });

  test.each([
    ["a wrong token", "wrong-token-value!!"],
    ["a token prefix", TOKEN.slice(0, -1)],
    ["a token with extra characters", `${TOKEN}x`],
  ])("rejects %s", (_label, value) => {
    expect(authenticateMcpRequest(req({ authorization: `Bearer ${value}` }), TOKEN)).toBe(
      "invalid_token"
    );
  });

  test.each([
    ["sec-fetch-site", "cross-site"],
    ["sec-fetch-dest", "empty"],
    ["origin", "https://vera.test"],
  ])("rejects a request carrying %s, even with a valid token", (header, value) => {
    const request = req({ authorization: `Bearer ${TOKEN}`, [header]: value });
    expect(authenticateMcpRequest(request, TOKEN)).toBe("browser_origin");
  });

  test("does not treat sec-fetch-mode as a browser signal — Node's own fetch sends it", () => {
    // The bug this suite used to assert as correct: undici puts
    // `Sec-Fetch-Mode: cors` on every request, so rejecting it rejected every
    // agent-layer call. lib/mcp/auth.transport.test.ts pins that against the
    // real transport; here we just pin the guard's half of the contract.
    const request = req({ authorization: `Bearer ${TOKEN}`, "sec-fetch-mode": "cors" });
    expect(authenticateMcpRequest(request, TOKEN)).toBeNull();
  });

  test("the browser guard is checked before the token, so a browser never probes the token", () => {
    const request = req({ authorization: "Bearer wrong", "sec-fetch-site": "cross-site" });
    expect(authenticateMcpRequest(request, TOKEN)).toBe("browser_origin");
  });
});
