import type { ClinicResult } from "@/types/clinic";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClinicMap } from "./clinic-map";

// Minimal smoke test per EPIC5-06 AC: the third-party canvas renderer is not
// exercisable in JSDOM. We only assert that the component mounts without
// throwing in three shapes (no results, with results, loading overlay).
const fake: ClinicResult = {
  placeId: "ChIJ_smoke_01",
  name: "Smoke Test Clinic",
  formattedAddress: "1 Smoke St, Sydney NSW 2000",
  location: { lat: -33.87, lng: 151.21 },
  googleMapsUri: "https://www.google.com/maps/place/?q=place_id:ChIJ_smoke_01",
};

describe("ClinicMap", () => {
  it("renders with no results without crashing", () => {
    expect(() => render(<ClinicMap results={[]} selectedPlaceId={null} />)).not.toThrow();
  });

  it("renders with results without crashing", () => {
    expect(() => render(<ClinicMap results={[fake]} selectedPlaceId={null} />)).not.toThrow();
  });

  it("renders a loading overlay without crashing", () => {
    expect(() => render(<ClinicMap results={[]} selectedPlaceId={null} loading />)).not.toThrow();
  });

  it("falls back to a missing-key message when the API key is absent", () => {
    const original = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "";
    const { getByText } = render(<ClinicMap results={[]} selectedPlaceId={null} />);
    expect(getByText(/missing NEXT_PUBLIC_GOOGLE_MAPS_KEY/i)).toBeInTheDocument();
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = original;
  });
});
