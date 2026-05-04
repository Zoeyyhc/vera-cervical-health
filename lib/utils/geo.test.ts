import { describe, expect, it } from "vitest";
import { haversineMeters } from "./geo";

const SYDNEY = { lat: -33.8688, lng: 151.2093 };
const MELBOURNE = { lat: -37.8136, lng: 144.9631 };
const LONDON = { lat: 51.5074, lng: -0.1278 };

describe("haversineMeters", () => {
  it("returns 0 for the same point", () => {
    expect(haversineMeters(SYDNEY, SYDNEY)).toBeCloseTo(0, 5);
  });

  it("computes Sydney <-> Melbourne within 1% of the known great-circle 713 km", () => {
    const m = haversineMeters(SYDNEY, MELBOURNE);
    const km = m / 1000;
    expect(km).toBeGreaterThan(706);
    expect(km).toBeLessThan(720);
  });

  it("computes Sydney <-> London within 1% of the known great-circle ~16,990 km", () => {
    const m = haversineMeters(SYDNEY, LONDON);
    const km = m / 1000;
    expect(km).toBeGreaterThan(16830);
    expect(km).toBeLessThan(17150);
  });

  it("is symmetric", () => {
    const ab = haversineMeters(SYDNEY, MELBOURNE);
    const ba = haversineMeters(MELBOURNE, SYDNEY);
    expect(ab).toBeCloseTo(ba, 5);
  });

  it("handles antipodal points without NaN", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 180 };
    const m = haversineMeters(a, b);
    // Half the Earth's circumference is ~20,015 km
    expect(m / 1000).toBeGreaterThan(19_900);
    expect(m / 1000).toBeLessThan(20_100);
    expect(Number.isNaN(m)).toBe(false);
  });
});
