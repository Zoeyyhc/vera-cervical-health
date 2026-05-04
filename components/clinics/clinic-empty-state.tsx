import { MapPinOff } from "lucide-react";

export function ClinicEmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-card border bg-background px-6 py-16 text-center"
      style={{ borderColor: "#eceae4" }}
    >
      <MapPinOff className="h-12 w-12" style={{ color: "rgba(28,28,28,0.4)" }} aria-hidden />
      <h2 className="mt-4 text-[20px] font-semibold tracking-tight text-foreground">
        No clinics found near that location
      </h2>
      <p className="mt-2 text-[16px] text-muted-foreground">
        Try a different city or broaden your keyword.
      </p>
    </div>
  );
}
