"use client";

import { ClinicEmptyState } from "@/components/clinics/clinic-empty-state";
import { ClinicErrorState } from "@/components/clinics/clinic-error-state";
import { ClinicList } from "@/components/clinics/clinic-list";
import { ClinicLoadingSkeleton } from "@/components/clinics/clinic-loading-skeleton";
import { ClinicSearchBar } from "@/components/clinics/clinic-search-bar";
import { type LatLng, haversineMeters } from "@/lib/utils/geo";
import type { ClinicResult } from "@/types/clinic";
import { List as ListIcon, Map as MapIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// The Google Maps stack (@vis.gl/react-google-maps + Google's JS API) is heavy
// and the page defaults to the list view, so load the map only when it renders.
const ClinicMap = dynamic(
  () => import("@/components/clinics/clinic-map").then((m) => m.ClinicMap),
  { ssr: false, loading: () => <ClinicLoadingSkeleton /> }
);

type Status = "idle" | "loading" | "ok" | "empty" | "error";

export default function ClinicsPage() {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<ClinicResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [expandedPlaceId, setExpandedPlaceId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  // Coords from a granted Geolocation permission. Used to compute Haversine
  // distance per result. Held in a ref so handleSearch always reads the
  // freshest value even when invoked from the search-bar's setTimeout(0).
  const userCoordsRef = useRef<LatLng | null>(null);

  // Scroll the matching list card into view whenever the selected pin changes.
  // block: "nearest" makes this a no-op when the card is already visible,
  // so it doesn't fight the user when they click a card themselves.
  useEffect(() => {
    if (!selectedPlaceId) return;
    const el = document.getElementById(`clinic-card-${selectedPlaceId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedPlaceId]);

  const handleSearch = async () => {
    if (!location.trim()) return;
    setStatus("loading");
    setResults([]);
    setExpandedPlaceId(null);
    setSelectedPlaceId(null);
    const params = new URLSearchParams({ location });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    try {
      const res = await fetch(`/api/clinics/search?${params.toString()}`);
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = (await res.json()) as { clinics?: ClinicResult[] };
      const raw = data.clinics ?? [];
      const userCoords = userCoordsRef.current;
      const clinics: ClinicResult[] = userCoords
        ? raw.map((c) =>
            c.distanceMeters != null
              ? c
              : { ...c, distanceMeters: Math.round(haversineMeters(userCoords, c.location)) }
          )
        : raw;
      if (clinics.length === 0) {
        setStatus("empty");
      } else {
        setResults(clinics);
        setStatus("ok");
      }
    } catch (err) {
      console.error("[clinics] search failed:", err instanceof Error ? err.message : err);
      setStatus("error");
    }
  };

  const handleLocationDetected = (coords: LatLng) => {
    userCoordsRef.current = coords;
  };

  const handleToggle = (placeId: string) => {
    setExpandedPlaceId((curr) => (curr === placeId ? null : placeId));
    setSelectedPlaceId(placeId);
  };

  const handleMapSelect = (placeId: string) => {
    setSelectedPlaceId(placeId);
    setExpandedPlaceId(placeId);
    if (mobileView === "map") setMobileView("list");
  };

  const renderListColumn = () => {
    if (status === "loading") return <ClinicLoadingSkeleton />;
    if (status === "error") return <ClinicErrorState onRetry={handleSearch} />;
    if (status === "empty") return <ClinicEmptyState />;
    if (status === "idle") {
      return (
        <div className="flex flex-col gap-3">
          <div className="rounded-card border bg-background p-5" style={{ borderColor: "#eceae4" }}>
            <h2 className="text-[20px] font-semibold tracking-tight text-foreground">
              Find a clinic near you
            </h2>
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              Enter a city or use your current location to see clinics offering cervical health
              services.
            </p>
          </div>
          <ClinicList
            results={results}
            selectedPlaceId={selectedPlaceId}
            expandedPlaceId={expandedPlaceId}
            onToggle={handleToggle}
          />
        </div>
      );
    }
    return (
      <ClinicList
        results={results}
        selectedPlaceId={selectedPlaceId}
        expandedPlaceId={expandedPlaceId}
        onToggle={handleToggle}
      />
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="flex items-center justify-between px-4 py-3 lg:hidden sm:px-6">
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
            Clinic finder
          </h1>
          <button
            type="button"
            onClick={() => setMobileView((v) => (v === "list" ? "map" : "list"))}
            className="focus-ring inline-flex items-center gap-1.5 rounded-standard border bg-transparent px-3 py-1.5 text-[13px] text-foreground transition-colors duration-150 hover:bg-[rgba(28,28,28,0.04)]"
            style={{ borderColor: "rgba(28,28,28,0.4)" }}
          >
            {mobileView === "list" ? (
              <>
                <MapIcon className="h-3.5 w-3.5" aria-hidden /> Show map
              </>
            ) : (
              <>
                <ListIcon className="h-3.5 w-3.5" aria-hidden /> Back to list
              </>
            )}
          </button>
        </div>

        <div className="lg:grid lg:grid-cols-[60%_40%]">
          <section
            className={`${mobileView === "map" ? "hidden" : "block"} lg:block`}
            aria-label="Clinic results"
          >
            {/* top-16 = below the 64px AppNav so the search bar docks under it */}
            <div className="sticky top-16 z-10 bg-background">
              <ClinicSearchBar
                keyword={keyword}
                location={location}
                onKeywordChange={setKeyword}
                onLocationChange={setLocation}
                onSearch={handleSearch}
                onLocationDetected={handleLocationDetected}
                isSearching={status === "loading"}
              />
            </div>
            <div className="px-4 py-4 sm:px-6">{renderListColumn()}</div>
          </section>

          <section
            className={`${mobileView === "list" ? "hidden" : "block"} lg:block`}
            aria-label="Map preview"
          >
            {/* top-16 / 4rem aligns under the AppNav; calc subtracts nav height */}
            <div className="sticky top-16 h-[calc(100vh-4rem)] p-4 sm:p-6">
              <ClinicMap
                results={results}
                selectedPlaceId={selectedPlaceId}
                onSelect={handleMapSelect}
                loading={status === "loading"}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
