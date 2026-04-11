import { http, HttpResponse } from "msw";

/**
 * Default MSW handlers shared across all tests.
 * Tests can override these per-test with server.use().
 * Add common mocks here as the test suite grows.
 */
export const handlers = [
  // Supabase auth session check — returns no session by default
  http.get("http://127.0.0.1:54321/auth/v1/session", () => {
    return HttpResponse.json({ data: { session: null }, error: null });
  }),
];
