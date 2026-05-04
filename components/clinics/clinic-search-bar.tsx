"use client";

import { Check, Loader2, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Props = {
  keyword: string;
  location: string;
  onKeywordChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onSearch: () => void;
  // Fired with the granted browser coordinates so the parent can compute
  // per-result distances (Haversine) once the search returns.
  onLocationDetected?: (coords: { lat: number; lng: number }) => void;
  isSearching?: boolean;
};

type GeoState = "idle" | "requesting" | "granted" | "denied" | "unavailable";

export function ClinicSearchBar({
  keyword,
  location,
  onKeywordChange,
  onLocationChange,
  onSearch,
  onLocationDetected,
  isSearching,
}: Props) {
  const [geoState, setGeoState] = useState<GeoState>("idle");
  // Track location length to clear the denied message when the user types.
  const prevLocationRef = useRef(location);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("unavailable");
    }
  }, []);

  useEffect(() => {
    if (geoState === "denied" && location !== prevLocationRef.current && location.length > 0) {
      setGeoState("idle");
    }
    prevLocationRef.current = location;
  }, [location, geoState]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGeoState("unavailable");
      return;
    }
    setGeoState("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        onLocationChange(`${lat.toFixed(4)},${lng.toFixed(4)}`);
        onLocationDetected?.({ lat, lng });
        setGeoState("granted");
        // Trigger search on next tick so parent state has the new location.
        setTimeout(() => onSearch(), 0);
      },
      (err) => {
        if (err.code === 1) {
          setGeoState("denied");
        } else {
          setGeoState("idle");
          toast("Couldn't get your location - please try again.");
        }
      }
    );
  };

  const renderGeoButton = () => {
    if (geoState === "unavailable") return null;

    const isRequesting = geoState === "requesting";
    const isGranted = geoState === "granted";

    return (
      <button
        type="button"
        onClick={requestLocation}
        disabled={isRequesting}
        className="focus-ring inline-flex items-center gap-1.5 rounded-standard border bg-transparent px-3 py-2.5 text-[14px] text-foreground transition-colors duration-150 hover:bg-[rgba(28,28,28,0.04)] disabled:opacity-70"
        style={{ borderColor: "rgba(28,28,28,0.4)" }}
        aria-label={
          isRequesting
            ? "Locating your position"
            : isGranted
              ? "Using your location - click to refresh"
              : "Use my location"
        }
      >
        {isRequesting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : isGranted ? (
          <Check className="h-4 w-4" aria-hidden style={{ color: "#3a6e4a" }} />
        ) : (
          <MapPin className="h-4 w-4" aria-hidden />
        )}
        <span>
          {isRequesting ? "Locating..." : isGranted ? "Using your location" : "Use my location"}
        </span>
      </button>
    );
  };

  return (
    <div className="bg-background border-b border-border px-4 sm:px-6 py-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 flex flex-col sm:flex-row gap-3">
            <label className="flex-1">
              <span className="sr-only">Keyword</span>
              <input
                type="text"
                value={keyword}
                onChange={(e) => onKeywordChange(e.target.value)}
                placeholder="Cervical screening, Pap test, women's health..."
                className="focus-ring w-full rounded-standard border bg-background px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground"
                style={{ borderColor: "rgba(28,28,28,0.18)" }}
              />
            </label>
            <label className="flex-1">
              <span className="sr-only">Location</span>
              <input
                type="text"
                value={location}
                onChange={(e) => onLocationChange(e.target.value)}
                placeholder="City, suburb, or postcode"
                required
                className="focus-ring w-full rounded-standard border bg-background px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground"
                style={{ borderColor: "rgba(28,28,28,0.18)" }}
              />
            </label>
          </div>
          <div className="flex gap-2">
            {renderGeoButton()}
            <button
              type="submit"
              disabled={isSearching}
              className="focus-ring inline-flex items-center gap-1.5 rounded-standard bg-foreground px-4 py-2.5 text-[14px] text-[#fcfbf8] transition-colors duration-150 hover:bg-[#2a2a2a] disabled:opacity-60"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
            >
              <Search className="h-4 w-4" aria-hidden />
              <span>Search</span>
            </button>
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Results powered by Google Places. Always confirm details with the clinic before visiting.
        </p>
        {geoState === "denied" && (
          <p className="text-[13px]" style={{ color: "#8a4a3a" }}>
            Location permission was denied. You can still search by city or postcode above, or
            update your browser permissions and try again.
          </p>
        )}
      </form>
    </div>
  );
}
