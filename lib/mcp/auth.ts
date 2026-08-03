import { timingSafeEqual } from "node:crypto";

/**
 * Service-to-service auth for the private MCP endpoint (spec §8: "The MCP
 * endpoint is authenticated service-to-service and is not exposed to browsers").
 *
 * Two independent guards, both of which must pass:
 *
 * 1. A bearer token that only the server has. `MCP_AUTH_TOKEN` is a non-public
 *    env var, so it is never bundled into client JavaScript — a browser has no
 *    way to obtain it. This is the real gate.
 * 2. A rejection of any request carrying browser-only fetch metadata. This is
 *    defence in depth against a future mistake that leaks the token into the
 *    client bundle, and it makes the "never callable from the browser" property
 *    observable rather than merely intended.
 *
 * On (2), the discriminating headers matter and an earlier version got them
 * wrong: it also rejected `Sec-Fetch-Mode`, on the assumption that only
 * browsers send Sec-Fetch-* at all. Node's built-in undici HTTP stack — which
 * the MCP SDK transport uses — sends `Sec-Fetch-Mode: cors` on every request, so
 * that guard rejected 100% of our own agent-layer calls with `browser_origin`
 * while both unit suites stayed green. See lib/mcp/auth.transport.test.ts,
 * which pins these header facts against the real transport.
 *
 * `Sec-Fetch-Site` and `Sec-Fetch-Dest` are the browser-only pair: every
 * modern browser attaches both to every request, and undici sends neither.
 * `Origin` is the same kind of signal for the cross-origin POST a leaked-token
 * browser call would have to make.
 */

export type McpAuthFailure = "missing_token" | "invalid_token" | "browser_origin";

/** Sent by every browser on every request; not sent by Node's fetch. */
const BROWSER_ONLY_HEADERS = ["sec-fetch-site", "sec-fetch-dest", "origin"] as const;

/** Constant-time comparison that tolerates length mismatch without leaking it. */
function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still burn a comparison so the reject path costs the same either way.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Returns null when the request may proceed, or the reason it may not.
 * `expectedToken` is passed in rather than read from env so this stays a pure,
 * directly testable function.
 */
export function authenticateMcpRequest(
  request: Request,
  expectedToken: string
): McpAuthFailure | null {
  // A browser cannot suppress fetch metadata, so its presence is conclusive.
  // Deliberately NOT `sec-fetch-mode`: Node's own fetch sends that too.
  for (const header of BROWSER_ONLY_HEADERS) {
    if (request.headers.has(header)) return "browser_origin";
  }

  const header = request.headers.get("authorization");
  if (!header) return "missing_token";

  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return "missing_token";

  const token = rest.join(" ").trim();
  if (token.length === 0) return "missing_token";

  return tokensMatch(token, expectedToken) ? null : "invalid_token";
}
