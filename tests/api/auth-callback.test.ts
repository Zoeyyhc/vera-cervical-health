// tests/api/auth-callback.test.ts
// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { GET } from "@/app/api/auth/callback/route";
import { createClient } from "@/lib/supabase/server";

type MockedClient = {
  auth: {
    exchangeCodeForSession: ReturnType<typeof vi.fn>;
    verifyOtp: ReturnType<typeof vi.fn>;
  };
};

function mockClient(overrides: Partial<MockedClient["auth"]> = {}): MockedClient {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    },
  };
}

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("with valid ?code= exchanges for session and redirects to next", async () => {
    const client = mockClient();
    vi.mocked(createClient).mockReturnValue(client as never);

    const req = new NextRequest(
      "http://localhost:3000/api/auth/callback?code=abc123&next=/reset-password"
    );
    const res = await GET(req);

    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password");
  });

  test("with ?code= but exchange error redirects to /login?error=link-expired", async () => {
    const client = mockClient({
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: new Error("bad code") }),
    });
    vi.mocked(createClient).mockReturnValue(client as never);

    const req = new NextRequest("http://localhost:3000/api/auth/callback?code=bad");
    const res = await GET(req);

    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=link-expired");
  });

  test("with ?token_hash= and ?type= still works (existing behavior)", async () => {
    const client = mockClient();
    vi.mocked(createClient).mockReturnValue(client as never);

    const req = new NextRequest(
      "http://localhost:3000/api/auth/callback?token_hash=hash123&type=recovery&next=/reset-password"
    );
    const res = await GET(req);

    expect(client.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash123",
      type: "recovery",
    });
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password");
  });

  test("with no params redirects to /login?error=link-expired", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/callback");
    const res = await GET(req);

    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=link-expired");
  });
});
