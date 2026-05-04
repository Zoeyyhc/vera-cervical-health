import type { ClinicResult } from "@/types/clinic";
import { ClinicCard } from "./clinic-card";

type Props = {
  results: ClinicResult[];
  selectedPlaceId: string | null;
  expandedPlaceId: string | null;
  onToggle: (placeId: string) => void;
};

export function ClinicList({ results, selectedPlaceId, expandedPlaceId, onToggle }: Props) {
  return (
    <ul className="flex flex-col gap-3">
      {results.map((clinic, idx) => (
        <li key={clinic.placeId}>
          <ClinicCard
            clinic={clinic}
            index={idx}
            isExpanded={expandedPlaceId === clinic.placeId}
            isSelected={selectedPlaceId === clinic.placeId}
            onToggle={onToggle}
          />
        </li>
      ))}
    </ul>
  );
}
