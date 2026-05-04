import { describe, expect, it } from "vitest";
import { clinicResultSchema, clinicSearchQuerySchema } from "./clinic";

describe("clinicSearchQuerySchema", () => {
  it("accepts a location-only query", () => {
    const r = clinicSearchQuerySchema.safeParse({ location: "Sydney" });
    expect(r.success).toBe(true);
  });

  it("accepts location + keyword", () => {
    const r = clinicSearchQuerySchema.safeParse({
      location: "Sydney NSW",
      keyword: "cervical screening",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty location", () => {
    const r = clinicSearchQuerySchema.safeParse({ location: "" });
    expect(r.success).toBe(false);
  });

  it("rejects whitespace-only location after trim", () => {
    const r = clinicSearchQuerySchema.safeParse({ location: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects location over 200 chars", () => {
    const r = clinicSearchQuerySchema.safeParse({ location: "x".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("rejects keyword over 200 chars", () => {
    const r = clinicSearchQuerySchema.safeParse({
      location: "Sydney",
      keyword: "x".repeat(201),
    });
    expect(r.success).toBe(false);
  });
});

describe("clinicResultSchema", () => {
  const validClinic = {
    placeId: "ChIJ_test_01",
    name: "Test Women's Health Centre",
    formattedAddress: "1 Test St, Sydney NSW 2000",
    location: { lat: -33.8688, lng: 151.2093 },
    phone: "+61 2 1234 5678",
    websiteUri: "https://example.org/clinic",
    rating: 4.5,
    userRatingCount: 100,
    openNow: true,
    weekdayDescriptions: ["Monday: 9:00 AM - 5:00 PM"],
    distanceMeters: 1200,
    googleMapsUri: "https://www.google.com/maps/place/?q=place_id:ChIJ_test_01",
  };

  it("accepts a fully populated clinic", () => {
    expect(clinicResultSchema.safeParse(validClinic).success).toBe(true);
  });

  it("accepts a clinic with only required fields", () => {
    const minimal = {
      placeId: validClinic.placeId,
      name: validClinic.name,
      formattedAddress: validClinic.formattedAddress,
      location: validClinic.location,
      googleMapsUri: validClinic.googleMapsUri,
    };
    expect(clinicResultSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects a missing placeId", () => {
    const { placeId: _drop, ...rest } = validClinic;
    expect(clinicResultSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a non-numeric lat/lng", () => {
    const r = clinicSearchQuerySchema.safeParse({
      ...validClinic,
      location: { lat: "north" as unknown as number, lng: 0 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid googleMapsUri", () => {
    const r = clinicResultSchema.safeParse({ ...validClinic, googleMapsUri: "not-a-url" });
    expect(r.success).toBe(false);
  });

  it("rejects a rating above 5", () => {
    const r = clinicResultSchema.safeParse({ ...validClinic, rating: 6 });
    expect(r.success).toBe(false);
  });
});
