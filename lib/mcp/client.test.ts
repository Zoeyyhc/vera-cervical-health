// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const connect = vi.fn();
const callTool = vi.fn();
const close = vi.fn();

// Both are invoked with `new`, so the mock implementations must be ordinary
// functions rather than arrows.
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn(function MockClient() {
    return { connect, callTool, close };
  }),
}));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn(function MockTransport() {
    return {};
  }),
}));

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  findVictoriaScreeningServicesViaMcp,
  listVictoriaVerifiedEventsViaMcp,
  searchVictoriaHealthInfoViaMcp,
} from "./client";

/**
 * Spec §8: "an unavailable MCP must not block the normal RAG or general-chat
 * route" — acceptance criterion 5. Every failure mode must resolve to null
 * rather than throw.
 */

const VALID_DIRECTORY = {
  directoryLinks: [
    {
      directoryName: "healthdirect Service Finder",
      searchUrl: "https://www.healthdirect.gov.au/australian-health-services",
      coverage: "VIC",
      supports: [],
      verification: "directory_listing",
      reviewedAt: "2026-08-01T00:00:00Z",
      confirmationNotice: "Confirm with the provider.",
    },
  ],
};

describe("MCP client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  test("returns the parsed structured content on success", async () => {
    callTool.mockResolvedValue({ structuredContent: VALID_DIRECTORY });

    const result = await findVictoriaScreeningServicesViaMcp({ location: "Carlton" });

    expect(result).toEqual(VALID_DIRECTORY);
    expect(callTool).toHaveBeenCalledWith(
      { name: "find_victoria_screening_services", arguments: { location: "Carlton" } },
      undefined,
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });

  test("sends the bearer token and never a cookie", () => {
    callTool.mockResolvedValue({ structuredContent: VALID_DIRECTORY });

    return findVictoriaScreeningServicesViaMcp({ location: "Carlton" }).then(() => {
      const opts = vi.mocked(StreamableHTTPClientTransport).mock.calls[0][1];
      const headers = opts?.requestInit?.headers as Record<string, string>;
      expect(headers.authorization).toMatch(/^Bearer .+/);
      expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("cookie");
    });
  });

  test("returns null when connect rejects", async () => {
    connect.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(findVictoriaScreeningServicesViaMcp({ location: "Carlton" })).resolves.toBeNull();
  });

  test("returns null when the call times out", async () => {
    callTool.mockRejectedValue(new Error("Request timed out"));

    await expect(listVictoriaVerifiedEventsViaMcp({})).resolves.toBeNull();
  });

  test("returns null when the tool reports an error", async () => {
    callTool.mockResolvedValue({ isError: true, content: [{ type: "text", text: "boom" }] });

    await expect(searchVictoriaHealthInfoViaMcp({ query: "hpv" })).resolves.toBeNull();
  });

  test("returns null when there is no structured content", async () => {
    callTool.mockResolvedValue({ content: [{ type: "text", text: "{}" }] });

    await expect(searchVictoriaHealthInfoViaMcp({ query: "hpv" })).resolves.toBeNull();
  });

  test("rejects output that does not satisfy the contract", async () => {
    // A directory link with no verification label must not reach the agent
    // layer as if it were governed content.
    callTool.mockResolvedValue({
      structuredContent: {
        directoryLinks: [{ directoryName: "Rogue", searchUrl: "https://rogue.test" }],
      },
    });

    await expect(findVictoriaScreeningServicesViaMcp({ location: "Carlton" })).resolves.toBeNull();
  });

  test("accepts a well-formed empty result", async () => {
    callTool.mockResolvedValue({
      structuredContent: { events: [], noResultReason: "no_upcoming_events" },
    });

    await expect(listVictoriaVerifiedEventsViaMcp({})).resolves.toEqual({
      events: [],
      noResultReason: "no_upcoming_events",
    });
  });

  test("always closes the client, even when the call fails", async () => {
    callTool.mockRejectedValue(new Error("boom"));

    await searchVictoriaHealthInfoViaMcp({ query: "hpv" });

    expect(close).toHaveBeenCalled();
  });

  test("a failure while closing does not turn into a thrown error", async () => {
    callTool.mockResolvedValue({ structuredContent: VALID_DIRECTORY });
    close.mockRejectedValue(new Error("close failed"));

    await expect(findVictoriaScreeningServicesViaMcp({ location: "Carlton" })).resolves.toEqual(
      VALID_DIRECTORY
    );
  });

  // Regression: production had NEXT_PUBLIC_APP_URL set to "". `??` treated the
  // empty string as configured, so the base became "" and `new URL("/api/mcp")`
  // threw out of the client, past the orchestrator, and killed the chat stream
  // with "Invalid URL" instead of degrading to RAG.
  describe("base URL resolution", () => {
    const saved = {
      mcp: process.env.MCP_BASE_URL,
      app: process.env.NEXT_PUBLIC_APP_URL,
    };

    afterEach(() => {
      process.env.MCP_BASE_URL = saved.mcp;
      process.env.NEXT_PUBLIC_APP_URL = saved.app;
    });

    test("falls back to localhost when both vars are blank rather than throwing", async () => {
      process.env.MCP_BASE_URL = "";
      process.env.NEXT_PUBLIC_APP_URL = "";
      callTool.mockResolvedValue({ structuredContent: VALID_DIRECTORY });

      await expect(findVictoriaScreeningServicesViaMcp({ location: "Carlton" })).resolves.toEqual(
        VALID_DIRECTORY
      );
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL("http://localhost:3000/api/mcp"),
        expect.anything()
      );
    });

    test("prefers MCP_BASE_URL over NEXT_PUBLIC_APP_URL", async () => {
      process.env.MCP_BASE_URL = "https://internal.example.com/";
      process.env.NEXT_PUBLIC_APP_URL = "https://public.example.com";
      callTool.mockResolvedValue({ structuredContent: VALID_DIRECTORY });

      await findVictoriaScreeningServicesViaMcp({ location: "Carlton" });

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL("https://internal.example.com/api/mcp"),
        expect.anything()
      );
    });

    test("returns null instead of throwing when the base is not an absolute URL", async () => {
      process.env.MCP_BASE_URL = "cervix-assistant.vercel.app";
      process.env.NEXT_PUBLIC_APP_URL = "";

      await expect(
        findVictoriaScreeningServicesViaMcp({ location: "Carlton" })
      ).resolves.toBeNull();
      expect(StreamableHTTPClientTransport).not.toHaveBeenCalled();
    });
  });
});
