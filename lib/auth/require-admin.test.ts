// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./require-admin";

function mockClient(opts: { userId: string | null; role?: string }) {
  const single = vi.fn().mockResolvedValue({ data: opts.role ? { role: opts.role } : null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const client = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: opts.userId ? { id: opts.userId } : null } }),
    },
    from: vi.fn().mockReturnValue({ select }),
  };
  vi.mocked(createClient).mockReturnValue(client as never);
  return client;
}

describe("requireAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns the client and user for an admin", async () => {
    const client = mockClient({ userId: "u1", role: "admin" });
    const result = await requireAdmin();
    expect(result.user.id).toBe("u1");
    expect(result.supabase).toBe(client);
  });

  test("redirects to / for a non-admin", async () => {
    mockClient({ userId: "u1", role: "user" });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/");
  });

  test("redirects to /login when not signed in", async () => {
    mockClient({ userId: null });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
  });
});
