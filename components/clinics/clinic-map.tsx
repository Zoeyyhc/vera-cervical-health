"use client";

import type { ClinicResult } from "@/types/clinic";
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

type Props = {
  results: ClinicResult[];
  selectedPlaceId: string | null;
  onSelect?: (placeId: string) => void;
  loading?: boolean;
};

// DEMO_MAP_ID is Google's well-known map style for unauthenticated dev use
// and is required for AdvancedMarker to render. To use a custom-styled map in
// production, create a Map ID in Google Cloud Console and set it via env.
const DEFAULT_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
// Sydney CBD - shown when no results yet.
const DEFAULT_CENTER = { lat: -33.8688, lng: 151.2093 };
const DEFAULT_ZOOM = 11;

function FitToResults({ results }: { results: ClinicResult[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || results.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const r of results) {
      bounds.extend({ lat: r.location.lat, lng: r.location.lng });
    }
    map.fitBounds(bounds, 64);
  }, [map, results]);
  return null;
}

export function ClinicMap({ results, selectedPlaceId, onSelect, loading }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  if (!apiKey) {
    return (
      <div
        className="flex h-full w-full items-center justify-center rounded-card border bg-secondary text-[14px] text-muted-foreground"
        style={{ borderColor: "#eceae4" }}
      >
        Map disabled - missing NEXT_PUBLIC_GOOGLE_MAPS_KEY
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-card border"
      style={{ borderColor: "#eceae4" }}
    >
      <APIProvider apiKey={apiKey}>
        <GoogleMap
          mapId={DEFAULT_MAP_ID}
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={DEFAULT_ZOOM}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
        >
          <FitToResults results={results} />
          {results.map((clinic) => {
            const isSelected = selectedPlaceId === clinic.placeId;
            return (
              <AdvancedMarker
                key={clinic.placeId}
                position={{ lat: clinic.location.lat, lng: clinic.location.lng }}
                title={clinic.name}
                onClick={() => onSelect?.(clinic.placeId)}
              >
                <Pin
                  background={isSelected ? "#1c1c1c" : "#5f5f5d"}
                  borderColor="#fcfbf8"
                  glyphColor="#fcfbf8"
                  scale={isSelected ? 1.2 : 1}
                />
              </AdvancedMarker>
            );
          })}
        </GoogleMap>
      </APIProvider>

      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
          <Loader2 className="h-5 w-5 animate-spin text-foreground" aria-hidden />
        </div>
      )}
    </div>
  );
}
