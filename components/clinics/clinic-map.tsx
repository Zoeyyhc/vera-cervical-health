import type { ClinicResult } from "@/types/clinic";
import { Loader2, MapPin } from "lucide-react";

type Props = {
  results: ClinicResult[];
  selectedPlaceId: string | null;
  onSelect?: (placeId: string) => void;
  loading?: boolean;
};

// Fixed pseudo-positions so layout is deterministic until EPIC5-06 wires the real map.
const PIN_POSITIONS = [
  { top: "28%", left: "32%" },
  { top: "44%", left: "58%" },
  { top: "62%", left: "40%" },
  { top: "22%", left: "70%" },
  { top: "72%", left: "70%" },
];

export function ClinicMap({ results, selectedPlaceId, onSelect, loading }: Props) {
  return (
    <div
      className="map-dot-grid relative h-full w-full overflow-hidden rounded-card border"
      style={{ borderColor: "#eceae4" }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}

      {!loading &&
        results.slice(0, 5).map((clinic, idx) => {
          const pos = PIN_POSITIONS[idx];
          const isSelected = selectedPlaceId === clinic.placeId;
          return (
            <button
              key={clinic.placeId}
              type="button"
              onClick={() => onSelect?.(clinic.placeId)}
              aria-label={`Select ${clinic.name}`}
              className="focus-ring absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-150"
              style={{
                top: pos.top,
                left: pos.left,
                transform: `translate(-50%, -50%) scale(${isSelected ? 1.15 : 1})`,
                filter: isSelected ? "drop-shadow(0 4px 12px rgba(0,0,0,0.1))" : "none",
              }}
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground"
                style={{ outline: "2px solid #fcfbf8" }}
              >
                <MapPin className="h-3.5 w-3.5 text-[#fcfbf8]" aria-hidden />
              </div>
              <span
                className="mt-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] text-foreground"
                style={{ backgroundColor: "#fcfbf8", border: "1px solid #eceae4" }}
              >
                {idx + 1}
              </span>
            </button>
          );
        })}

      <div
        className="absolute bottom-3 left-3 rounded-pill px-2.5 py-1 text-[12px] text-muted-foreground"
        style={{ backgroundColor: "#fcfbf8", border: "1px solid #eceae4" }}
      >
        Map preview - interactive map will load here
      </div>
    </div>
  );
}
