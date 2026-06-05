// Stubs for server-side env vars validated eagerly in `lib/env.ts`.
// `||=` only sets them when missing, so local-dev runs with a real `.env.local`
// keep their actual values. CI / clean shells get the stubs and `lib/env.ts`
// loads cleanly without throwing.
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-supabase-service-role-key";
process.env.ANTHROPIC_API_KEY ||= "test-anthropic-key";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.RESEND_API_KEY ||= "test-resend-key";
process.env.NEWS_API_KEY ||= "test-news-api-key";
process.env.SERPAPI_KEY ||= "test-serpapi-key";
process.env.CRON_SECRET ||= "test-cron-secret";
process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||= "test-google-maps-key";
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./test-utils/server";

// jsdom doesn't implement these DOM APIs; Radix UI primitives (DropdownMenu,
// Popover, etc.) bail out silently when they're missing, which makes onSelect
// handlers never fire under tests. Stubbing them lets pointer events flow
// through Radix's internals as they would in a real browser.
if (typeof window !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
});

afterEach(() => {
  server.resetHandlers();
  // Tear down any RTL-rendered DOM so tests don't leak into each other.
  cleanup();
});

afterAll(() => {
  server.close();
});
