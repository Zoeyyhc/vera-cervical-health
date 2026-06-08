import { ClinicLoadingSkeleton } from "@/components/clinics/clinic-loading-skeleton";

// Shown while the clinics page resolves. Reuses the same list skeleton the page
// uses for its in-page "searching" state so the loading→loaded transition is
// visually continuous.
export default function ClinicsLoading() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true">
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="px-4 py-4 sm:px-6">
          <ClinicLoadingSkeleton />
        </div>
      </div>
    </div>
  );
}
