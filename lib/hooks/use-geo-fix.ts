"use client";

import { useCallback, useRef } from "react";

/**
 * On-demand browser position, resolved to a suburb/state/postcode.
 *
 * Deliberately not a `useEffect` that runs on mount. The permission prompt is
 * raised only when the user asks something that needs it ("any events near
 * me?"), so the browser sees a request tied to a user gesture rather than one
 * fired at page load — which is the pattern Chrome and Safari penalise, and
 * which trains users to deny by reflex.
 *
 * The state field is what makes this worth asking for at all: a bare suburb name
 * is shared with another state 457 times over in Victoria alone, so without the
 * state the agent still has to ask.
 */

export type GeoFix = {
  suburb?: string;
  state?: string;
  postcode?: string;
};

/** Cached per tab so one "near me" per session costs one permission prompt. */
const STORAGE_KEY = "cervix:geo-fix";

/** Long enough for a cold GPS fix, short enough not to strand the turn. */
const GEOLOCATION_TIMEOUT_MS = 10_000;

function readCached(): GeoFix | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return undefined;
    return raw === "" ? null : (JSON.parse(raw) as GeoFix);
  } catch {
    return undefined;
  }
}

function writeCached(value: GeoFix | null): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value ? JSON.stringify(value) : "");
  } catch {
    // sessionStorage throws in some private modes and on quota exhaustion. A
    // lost cache costs one extra prompt, so there is nothing to handle.
  }
}

function currentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      // Denied, unavailable, or timed out — all the same to the caller, and all
      // must end as "ask the user to type a suburb", never as "nothing found".
      () => resolve(null),
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 5 * 60_000 }
    );
  });
}

async function reverseGeocode(lat: number, lng: number): Promise<GeoFix | null> {
  try {
    const res = await fetch("/api/geocode/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      suburb?: string | null;
      state?: string | null;
      postcode?: string | null;
    };
    const fix: GeoFix = {
      ...(data.suburb ? { suburb: data.suburb } : {}),
      ...(data.state ? { state: data.state } : {}),
      ...(data.postcode ? { postcode: data.postcode } : {}),
    };
    // A fix with no fields is no fix. Reporting it as one would send the agent
    // down the confirmed-location path with nothing to search on.
    return Object.keys(fix).length > 0 ? fix : null;
  } catch {
    return null;
  }
}

/**
 * Returns a `request()` that resolves to a fix, or `null` when the browser
 * cannot or will not supply one. Never throws and never rejects: every failure
 * mode is the same "we don't know where you are", and the caller's job is to ask.
 */
export function useGeoFix(): { request: () => Promise<GeoFix | null> } {
  // Deduplicates concurrent calls — two quick "near me" turns should not queue
  // two permission prompts.
  const inFlight = useRef<Promise<GeoFix | null> | null>(null);

  const request = useCallback(async (): Promise<GeoFix | null> => {
    const cached = readCached();
    if (cached !== undefined) return cached;
    if (inFlight.current) return inFlight.current;

    const run = (async () => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        writeCached(null);
        return null;
      }
      const position = await currentPosition();
      if (!position) {
        writeCached(null);
        return null;
      }
      const fix = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      writeCached(fix);
      return fix;
    })();

    inFlight.current = run;
    try {
      return await run;
    } finally {
      inFlight.current = null;
    }
  }, []);

  return { request };
}
