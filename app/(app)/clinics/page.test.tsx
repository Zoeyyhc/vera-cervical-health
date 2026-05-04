import { server } from "@/test-utils/server";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import ClinicsPage from "./page";

const SEARCH_URL = "http://localhost:3000/api/clinics/search";

const fakeClinic = {
  placeId: "ChIJ_fake_01",
  name: "Fake Test Clinic",
  formattedAddress: "1 Fake St, Sydney NSW 2000",
  location: { lat: -33.87, lng: 151.21 },
  googleMapsUri: "https://www.google.com/maps/place/?q=place_id:ChIJ_fake_01",
};

function submitSearch(location: string) {
  fireEvent.change(screen.getByPlaceholderText(/city, suburb, or postcode/i), {
    target: { value: location },
  });
  fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
}

describe("ClinicsPage", () => {
  describe("idle state", () => {
    it("renders the intro card and search bar", () => {
      render(<ClinicsPage />);
      expect(screen.getByRole("heading", { name: /find a clinic near you/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/cervical screening/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/city, suburb, or postcode/i)).toBeInTheDocument();
    });

    it("renders no clinic cards before any search", () => {
      render(<ClinicsPage />);
      // ClinicCard uses <h3> for the clinic name; idle state has none.
      expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    });

    it("renders the map preview placeholder caption", () => {
      render(<ClinicsPage />);
      expect(screen.getByText(/map preview/i)).toBeInTheDocument();
    });
  });

  describe("ok state", () => {
    it("renders results from the API after submit", async () => {
      server.use(http.get(SEARCH_URL, () => HttpResponse.json({ clinics: [fakeClinic] })));
      render(<ClinicsPage />);
      submitSearch("Sydney");
      expect(await screen.findByRole("heading", { name: fakeClinic.name })).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("renders the empty state when API returns 0 clinics", async () => {
      server.use(http.get(SEARCH_URL, () => HttpResponse.json({ clinics: [] })));
      render(<ClinicsPage />);
      submitSearch("Nowhere");
      expect(await screen.findByText(/no clinics found/i)).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("renders the error state on upstream 502", async () => {
      server.use(
        http.get(
          SEARCH_URL,
          () => new HttpResponse(JSON.stringify({ error: "upstream_unavailable" }), { status: 502 })
        )
      );
      render(<ClinicsPage />);
      submitSearch("Sydney");
      expect(
        await screen.findByText(/couldn't reach the clinic search service/i)
      ).toBeInTheDocument();
    });

    it("renders the error state when the network fetch throws", async () => {
      server.use(http.get(SEARCH_URL, () => HttpResponse.error()));
      render(<ClinicsPage />);
      submitSearch("Sydney");
      expect(
        await screen.findByText(/couldn't reach the clinic search service/i)
      ).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows the skeleton between submit and response", async () => {
      // Block the response so the loading state is observable.
      const gate: { resolve: (() => void) | null } = { resolve: null };
      const blocked = new Promise<void>((r) => {
        gate.resolve = r;
      });
      server.use(
        http.get(SEARCH_URL, async () => {
          await blocked;
          return HttpResponse.json({ clinics: [fakeClinic] });
        })
      );
      const { container } = render(<ClinicsPage />);
      submitSearch("Sydney");
      // Skeleton has the .shimmer utility class.
      await waitFor(() => {
        expect(container.querySelector(".shimmer")).not.toBeNull();
      });
      gate.resolve?.();
      // Ensure we eventually transition out of loading.
      expect(await screen.findByRole("heading", { name: fakeClinic.name })).toBeInTheDocument();
    });
  });

  describe("query forwarding", () => {
    it("includes location and keyword in the request URL", async () => {
      const captured: { url: string | null } = { url: null };
      server.use(
        http.get(SEARCH_URL, ({ request }) => {
          captured.url = request.url;
          return HttpResponse.json({ clinics: [] });
        })
      );
      render(<ClinicsPage />);
      fireEvent.change(screen.getByPlaceholderText(/cervical screening/i), {
        target: { value: "pap test" },
      });
      submitSearch("Sydney NSW");
      await waitFor(() => {
        expect(captured.url).not.toBeNull();
      });
      expect(captured.url).toContain("location=Sydney+NSW");
      expect(captured.url).toContain("keyword=pap+test");
    });
  });
});
