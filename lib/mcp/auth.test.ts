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

  test.each(["sec-fetch-mode", "sec-fetch-site"])(
    "rejects a request carrying %s, even with a valid token",
    (header) => {
      const request = req({ authorization: `Bearer ${TOKEN}`, [header]: "cors" });
      expect(authenticateMcpRequest(request, TOKEN)).toBe("browser_origin");
    }
  );

  test("the browser guard is checked before the token, so a browser never probes the token", () => {
    const request = req({ authorization: "Bearer wrong", "sec-fetch-mode": "cors" });
    expect(authenticateMcpRequest(request, TOKEN)).toBe("browser_origin");
  });
});
