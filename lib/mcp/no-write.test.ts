import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES } from "./schemas";
import { createVeraMcpServer } from "./server";

/**
 * Acceptance criterion 6: "No tool can write data, make a booking, send a
 * message, or access personal health records."
 *
 * Two complementary guards:
 *
 *  - a structural scan of the modules the tool handlers actually reach, so a
 *    future edit that adds a write shows up as a failing test rather than as a
 *    capability nobody noticed; and
 *  - an assertion that the registered tool surface is exactly the three
 *    read-only tools in the spec, all annotated read-only.
 *
 * `audit.ts` is the one deliberate exception: it inserts the call log, is not
 * reachable from tool input, and is asserted separately below.
 */

/** Modules a tool handler can reach. `audit.ts` is excluded — see above. */
const READ_PATH_FILES = [
  "health-info.ts",
  "directory.ts",
  "events.ts",
  "sources.ts",
  "victoria.ts",
  "vic-localities.generated.ts",
  "schemas.ts",
  "client.ts",
  "auth.ts",
];

/** PostgREST and Supabase mutation verbs. */
const WRITE_CALL_RE = /\.(insert|upsert|update|delete|rpc)\s*\(/;

function read(file: string): string {
  return readFileSync(join(__dirname, file), "utf8");
}

describe("MCP read path", () => {
  it.each(READ_PATH_FILES)("%s performs no database write", (file) => {
    const source = read(file);
    const offenders = source
      .split("\n")
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => WRITE_CALL_RE.test(line));

    expect(
      offenders.map(([n, line]) => `${file}:${n} ${line.trim()}`),
      "A mutation appeared in the MCP read path. Every MCP tool must be read-only (spec §3, acceptance criterion 6)."
    ).toEqual([]);
  });

  it("only audit.ts writes, and only to mcp_call_logs", () => {
    const source = read("audit.ts");
    const tables = (source.match(/\.from\("[^"]+"\)/g) ?? []).map((m) =>
      m.slice('.from("'.length, -'")'.length)
    );
    expect(tables).toEqual(["mcp_call_logs"]);
  });

  it("the tool handlers in server.ts never call a mutation directly", () => {
    const source = read("server.ts");
    // logMcpCall is the audit helper, allowed. Nothing else may mutate.
    const withoutAudit = source.replace(/logMcpCall\([\s\S]*?\}\);/g, "");
    expect(WRITE_CALL_RE.test(withoutAudit)).toBe(false);
  });

  it("no MCP module reads a table holding personal or health-record data", () => {
    const forbidden = ["profiles", "chat_messages", "chat_sessions", "abuse_events", "llm_calls"];
    for (const file of [...READ_PATH_FILES, "server.ts", "preflight.ts"]) {
      const source = read(file);
      for (const table of forbidden) {
        expect(source, `${file} must not touch ${table}`).not.toContain(`.from("${table}")`);
      }
    }
  });

  it("no MCP module fetches an external URL", () => {
    // Spec §3: "User chat requests must not perform arbitrary web searches or
    // scrape public websites in real time." client.ts is exempt: it dials our
    // own MCP endpoint, not a third-party site.
    for (const file of READ_PATH_FILES.filter((f) => f !== "client.ts")) {
      const source = read(file);
      expect(source, `${file} must not call fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${file} must not import cheerio`).not.toContain("cheerio");
    }
  });

  it("the generated gazetteer is inert data, not code", () => {
    // It is machine-written and 3300 lines long, so nobody will read a diff of
    // it closely. Pin its shape instead: exported const Sets and a number, no
    // imports, no functions, nothing that could run.
    const source = read("vic-localities.generated.ts");
    expect(source).not.toMatch(/\bimport\b|\brequire\s*\(|\bfunction\b|=>/);
    const exports = (source.match(/^export const (\w+)/gm) ?? []).map((m) =>
      m.replace("export const ", "")
    );
    expect(exports.sort()).toEqual([
      "CROSS_STATE_LOCALITIES",
      "MAX_LOCALITY_WORDS",
      "NON_VIC_LOCALITIES",
      "VIC_LOCALITIES",
    ]);
  });

  it("every lib/mcp module is covered by one of the lists above", () => {
    // Keeps the scan honest: a new module has to be classified deliberately.
    const known = new Set([
      ...READ_PATH_FILES,
      "audit.ts",
      "server.ts",
      "preflight.ts",
      "admin.ts",
      "admin-actions.ts",
    ]);
    const actual = readdirSync(__dirname).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts")
    );
    expect(actual.filter((f) => !known.has(f))).toEqual([]);
  });
});

describe("registered tool surface", () => {
  // biome-ignore lint/suspicious/noExplicitAny: no query runs during registration
  const server = createVeraMcpServer({} as any);
  // The registry is private; reading it is the only way to assert the surface.
  // biome-ignore lint/suspicious/noExplicitAny: intentional access to _registeredTools
  const tools = (server as any)._registeredTools as Record<
    string,
    { annotations?: Record<string, unknown> }
  >;

  it("exposes exactly the three tools in the spec", () => {
    expect(Object.keys(tools).sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });

  it.each(MCP_TOOL_NAMES)("%s is annotated read-only and non-destructive", (name) => {
    expect(tools[name].annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });
});
