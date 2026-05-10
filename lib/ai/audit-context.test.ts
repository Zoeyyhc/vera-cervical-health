import { type AuditContext, auditContext } from "@/lib/ai/audit-context";
import { describe, expect, it } from "vitest";

const fakeCtx = {
  // biome-ignore lint/suspicious/noExplicitAny: test fixture, not a real client
  supabaseAdmin: {} as any,
  userId: "u-1",
  sessionId: "s-1",
} satisfies AuditContext;

describe("auditContext", () => {
  it("returns undefined when no run() is active", () => {
    expect(auditContext.get()).toBeUndefined();
  });

  it("returns the active context inside run()", () => {
    const got = auditContext.run(fakeCtx, () => auditContext.get());
    expect(got).toEqual(fakeCtx);
  });

  it("scopes are isolated across run() boundaries", () => {
    auditContext.run(fakeCtx, () => {
      expect(auditContext.get()?.userId).toBe("u-1");
    });
    expect(auditContext.get()).toBeUndefined();
  });

  it("nested run() shadows the outer context", () => {
    auditContext.run(fakeCtx, () => {
      auditContext.run({ ...fakeCtx, userId: "u-2" }, () => {
        expect(auditContext.get()?.userId).toBe("u-2");
      });
      expect(auditContext.get()?.userId).toBe("u-1");
    });
  });
});
