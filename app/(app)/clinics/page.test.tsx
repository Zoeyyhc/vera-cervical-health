import { MOCK_CLINICS } from "@/lib/clinics/mock-data";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ClinicsPage from "./page";

describe("ClinicsPage (mock data)", () => {
  it("renders all five mock clinic names in the idle state", () => {
    render(<ClinicsPage />);
    for (const clinic of MOCK_CLINICS) {
      expect(screen.getByRole("heading", { name: clinic.name })).toBeInTheDocument();
    }
  });

  it("renders the search bar with both inputs", () => {
    render(<ClinicsPage />);
    expect(screen.getByPlaceholderText(/cervical screening/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/city, suburb, or postcode/i)).toBeInTheDocument();
  });

  it("renders the map preview placeholder caption", () => {
    render(<ClinicsPage />);
    expect(screen.getByText(/Map preview/i)).toBeInTheDocument();
  });

  it("renders the idle-state intro card", () => {
    render(<ClinicsPage />);
    expect(screen.getByRole("heading", { name: /find a clinic near you/i })).toBeInTheDocument();
  });
});
