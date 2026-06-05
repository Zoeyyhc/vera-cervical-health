// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { cronSecret: "secret" } }));
vi.mock("@/lib/discovery/run", () => ({ runDiscovery: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn(() => ({})) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/audit-context", () => ({
  auditContext: { run: vi.fn((_ctx, fn) => fn()) },
}));

import { runDiscovery } from "@/lib/discovery/run";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/embeddings/discover", { headers });
}

/** Build a server-client mock whose getUser + profiles.role resolve as given. */
function mockServerClient(opts: { userId: string | null; role?: string }) {
  const single = vi.fn().mockResolvedValue({ data: opts.role ? { role: opts.role } : null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: opts.userId ? { id: opts.userId } : null } }),
    },
    from: vi.fn().mockReturnValue({ select }),
  } as never);
}

describe("GET /api/embeddings/discover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runDiscovery).mockResolvedValue({
      runId: "r1",
      gapsProcessed: 2,
      candidatesStaged: 3,
    });
  });

  test("cron bearer token → runs with trigger 'cron'", async () => {
    const res = await GET(req({ authorization: "Bearer secret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gapsProcessed: 2, candidatesStaged: 3 });
    expect(runDiscovery).toHaveBeenCalledWith(expect.anything(), { trigger: "cron" });
  });

  test("admin session → runs with trigger 'manual'", async () => {
    mockServerClient({ userId: "u1", role: "admin" });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(runDiscovery).toHaveBeenCalledWith(expect.anything(), { trigger: "manual" });
  });

  test("no token + no user → 401", async () => {
    mockServerClient({ userId: null });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(runDiscovery).not.toHaveBeenCalled();
  });

  test("non-admin user → 403", async () => {
    mockServerClient({ userId: "u1", role: "user" });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(runDiscovery).not.toHaveBeenCalled();
  });

  test("wrong bearer token falls through to session check → 401 when no user", async () => {
    mockServerClient({ userId: null });
    const res = await GET(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });
});
