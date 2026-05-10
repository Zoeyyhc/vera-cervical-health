import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) yield full;
  }
}

describe("agent guardrails", () => {
  it("no agent file calls anthropic.messages.create or .stream directly", () => {
    const offenders: string[] = [];
    for (const file of walk(join(__dirname, "."))) {
      const src = readFileSync(file, "utf8");
      if (/\bmessages\.create\b/.test(src) || /\bmessages\.stream\b/.test(src)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      "Direct Anthropic SDK calls found in lib/agents/. " +
        "Use loggedMessagesCreate / loggedMessagesStream from @/lib/ai/logged-anthropic instead.\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
