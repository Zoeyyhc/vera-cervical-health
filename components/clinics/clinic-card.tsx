"use client";

import type { ClinicResult } from "@/types/clinic";
import { Check, ChevronDown, Copy, ExternalLink, Phone, Star } from "lucide-react";
import { useState } from "react";

type Props = {
  clinic: ClinicResult;
  index: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: (placeId: string) => void;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDistance(m?: number) {
  if (m == null) return null;
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function ClinicCard({ clinic, isExpanded, isSelected, onToggle }: Props) {
  const [copied, setCopied] = useState(false);
  const todayIdx = new Date().getDay();
  // weekdayDescriptions array order: Monday..Sunday
  const todayInArray = todayIdx === 0 ? 6 : todayIdx - 1;
  const todayName = DAY_NAMES[todayIdx];

  const copyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(clinic.formattedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      id={`clinic-card-${clinic.placeId}`}
      // biome-ignore lint/a11y/useSemanticElements: card contains a nested button and link; a real <button> would nest interactive elements (invalid HTML)
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={() => onToggle(clinic.placeId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(clinic.placeId);
        }
      }}
      className="focus-ring group cursor-pointer rounded-card border bg-background p-4 transition-colors duration-150"
      style={{
        borderColor: isSelected || isExpanded ? "rgba(28,28,28,0.4)" : "#eceae4",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[16px] font-semibold leading-tight tracking-tight text-foreground">
              {clinic.name}
            </h3>
            {clinic.distanceMeters != null && (
              <span className="shrink-0 text-[14px] text-muted-foreground">
                {formatDistance(clinic.distanceMeters)}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[14px]" style={{ color: "rgba(28,28,28,0.82)" }}>
            {clinic.formattedAddress}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {clinic.openNow != null && (
              <span
                className="inline-flex items-center rounded-micro px-1.5 py-0.5 text-[12px]"
                style={{
                  backgroundColor: clinic.openNow ? "rgba(58,110,74,0.12)" : "rgba(138,74,58,0.12)",
                  color: clinic.openNow ? "#3a6e4a" : "#8a4a3a",
                }}
              >
                {clinic.openNow ? "Open now" : "Closed"}
              </span>
            )}
            {clinic.phone && (
              <span className="inline-flex items-center gap-1 text-[14px] text-muted-foreground">
                <Phone className="h-3 w-3" aria-hidden />
                {clinic.phone}
              </span>
            )}
            {clinic.rating != null && (
              <span className="inline-flex items-center gap-1 text-[14px] text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                {clinic.rating.toFixed(1)}
                {clinic.userRatingCount != null && ` (${clinic.userRatingCount})`}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          aria-hidden
          className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-150"
          style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </div>

      {isExpanded && (
        <div
          className="mt-4 space-y-4 border-t pt-4"
          style={{ borderColor: "#eceae4" }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[14px] text-foreground">{clinic.formattedAddress}</p>
            <button
              type="button"
              onClick={copyAddress}
              aria-label="Copy address"
              className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-[rgba(28,28,28,0.06)]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          {clinic.phone && (
            <a
              href={`tel:${clinic.phone.replace(/\s+/g, "")}`}
              className="focus-ring inline-flex items-center gap-2 text-[16px] text-foreground hover:underline"
            >
              <Phone className="h-4 w-4" aria-hidden />
              {clinic.phone}
            </a>
          )}

          {clinic.weekdayDescriptions && clinic.weekdayDescriptions.length > 0 && (
            <div>
              <h4 className="mb-2 text-[14px] font-semibold text-foreground">Opening hours</h4>
              <ul
                className="overflow-hidden rounded-comfortable border"
                style={{ borderColor: "#eceae4" }}
              >
                {clinic.weekdayDescriptions.map((line, i) => {
                  const [day, ...rest] = line.split(":");
                  const hours = rest.join(":").trim();
                  const isToday = day.trim() === todayName || i === todayInArray;
                  return (
                    <li
                      key={line}
                      className="flex items-center justify-between px-3 py-1.5 text-[14px]"
                      style={{
                        backgroundColor: isToday ? "rgba(28,28,28,0.04)" : "transparent",
                      }}
                    >
                      <span
                        className={
                          isToday ? "font-semibold text-foreground" : "text-muted-foreground"
                        }
                      >
                        {day}
                      </span>
                      <span
                        className={isToday ? "font-semibold text-foreground" : "text-foreground"}
                      >
                        {hours}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <a
            href={clinic.googleMapsUri}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-standard border bg-transparent px-4 py-2.5 text-[14px] text-foreground transition-colors duration-150 hover:bg-[rgba(28,28,28,0.04)] sm:w-auto"
            style={{ borderColor: "rgba(28,28,28,0.4)" }}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open in Google Maps
          </a>
        </div>
      )}
    </div>
  );
}
