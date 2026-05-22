"use client";

import { useEffect, useState } from "react";

// Cached per-tab so we don't re-prompt geolocation on every chat navigation
// inside one session. Empty string is the "denied / failed / nothing back"
// sentinel — distinguishes "we already asked once" from "never asked".
const STORAGE_KEY = "cervix:user-city";

function readCached(): string | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return undefined;
    return raw === "" ? null : raw;
  } catch {
    return undefined;
  }
}

function writeCached(value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value ?? "");
  } catch {
    // sessionStorage can throw in private modes / quota exhaustion — ignore.
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch("/api/geocode/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { city?: string | null };
    return data.city ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves the user's city via browser geolocation + reverse geocoding.
 * Returns `null` until resolution completes, or permanently `null` if the
 * user denies or geolocation isn't available — the events agent will then
 * fall back to its "Which city are you in?" prompt.
 */
export function useUserCity(): string | null {
  const [city, setCity] = useState<string | null>(null);

  useEffect(() => {
    const cached = readCached();
    if (cached !== undefined) {
      setCity(cached);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      writeCached(null);
      return;
    }

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const resolved = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (cancelled) return;
        writeCached(resolved);
        setCity(resolved);
      },
      () => {
        if (cancelled) return;
        writeCached(null);
      },
      { timeout: 10_000, maximumAge: 5 * 60_000 }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return city;
}
