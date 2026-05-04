"use client";

import { ClinicEmptyState } from "@/components/clinics/clinic-empty-state";
import { ClinicErrorState } from "@/components/clinics/clinic-error-state";
import { ClinicList } from "@/components/clinics/clinic-list";
import { ClinicLoadingSkeleton } from "@/components/clinics/clinic-loading-skeleton";
import { ClinicMap } from "@/components/clinics/clinic-map";
import { ClinicSearchBar } from "@/components/clinics/clinic-search-bar";
import { MOCK_CLINICS } from "@/lib/clinics/mock-data";
import type { ClinicResult } from "@/types/clinic";
import { List as ListIcon, Map as MapIcon } from "lucide-react";
import { useState } from "react";

type Status = "idle" | "loading" | "ok" | "empty" | "error";

export default function ClinicsPage() {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<ClinicResult[]>(MOCK_CLINICS);
  const [status, setStatus] = useState<Status>("idle");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [expandedPlaceId, setExpandedPlaceId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

  // Mock search until EPIC5-05 wires /api/clinics/search.
  const handleSearch = () => {
    if (!location.trim()) return;
    setStatus("loading");
    setResults([]);
    setExpandedPlaceId(null);
    setSelectedPlaceId(null);
    setTimeout(() => {
      const kw = keyword.trim().toLowerCase();
      const filtered = kw
        ? MOCK_CLINICS.filter(
            (c) =>
              c.name.toLowerCase().includes(kw) || c.formattedAddress.toLowerCase().includes(kw)
          )
        : MOCK_CLINICS;
      if (filtered.length === 0) {
        setResults([]);
        setStatus("empty");
      } else {
        setResults(filtered);
        setStatus("ok");
      }
    }, 700);
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
            <div className="sticky top-0 z-10 bg-background">
              <ClinicSearchBar
                keyword={keyword}
                location={location}
                onKeywordChange={setKeyword}
                onLocationChange={setLocation}
                onSearch={handleSearch}
                isSearching={status === "loading"}
              />
            </div>
            <div className="px-4 py-4 sm:px-6">{renderListColumn()}</div>
          </section>

          <section
            className={`${mobileView === "list" ? "hidden" : "block"} lg:block`}
            aria-label="Map preview"
          >
            <div className="sticky top-0 h-screen p-4 sm:p-6">
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
