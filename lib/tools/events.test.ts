import { server } from "@/test-utils/server";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { findHealthEvents } from "./events";

const SERPAPI_URL = "https://serpapi.com/search";

describe("findHealthEvents", () => {
  it("returns ok with parsed events on success", async () => {
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
    const result = await findHealthEvents({ location: "Sydney" });
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].name).toBe("Women's Health Fair");
  });

  it("returns upstream_unavailable on upstream failure (does not throw)", async () => {
    server.use(http.get(SERPAPI_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(findHealthEvents({ location: "Sydney" })).resolves.toEqual({
      status: "upstream_unavailable",
    });
  });

  it("returns no_results when location missing", async () => {
    await expect(findHealthEvents({ location: "" })).resolves.toEqual({ status: "no_results" });
  });

  it("defaults max_results to 5", async () => {
    server.use(
      http.get(SERPAPI_URL, () =>
        HttpResponse.json({
          events_results: Array.from({ length: 8 }, (_, i) => ({
            title: `Cervical Screening Event ${i}`,
            date: { when: "May 10" },
            address: ["X"],
            link: `https://example.com/${i}`,
            description: null,
          })),
        })
      )
    );
    const result = await findHealthEvents({ location: "Sydney" });
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    expect(result.events).toHaveLength(5);
  });
});
