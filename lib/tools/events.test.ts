import { server } from "@/test-utils/server";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { findHealthEvents } from "./events";

const SERPAPI_URL = "https://serpapi.com/search";

describe("findHealthEvents", () => {
  it("returns parsed events on success", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: [
            {
              title: "Women's Health Fair",
              date: { when: "May 10, 2026" },
              address: ["Town Hall", "Sydney"],
              link: "https://example.com/1",
              description: "summary",
            },
          ],
        })
      )
    );
    const events = await findHealthEvents({ location: "Sydney" });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("Women's Health Fair");
  });

  it("returns empty array on upstream failure (does not throw)", async () => {
    server.use(http.get(SERPAPI_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(findHealthEvents({ location: "Sydney" })).resolves.toEqual([]);
  });

  it("returns empty array when location missing", async () => {
    await expect(findHealthEvents({ location: "" })).resolves.toEqual([]);
  });

  it("defaults max_results to 5", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: Array.from({ length: 8 }, (_, i) => ({
            title: `E${i}`,
            date: { when: "May 10" },
            address: ["X"],
            link: `https://example.com/${i}`,
            description: null,
          })),
        })
      )
    );
    const events = await findHealthEvents({ location: "Sydney" });
    expect(events).toHaveLength(5);
  });
});
