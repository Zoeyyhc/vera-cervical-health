import { AlertCircle } from "lucide-react";

type Props = { onRetry: () => void };

export function ClinicErrorState({ onRetry }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-card border bg-background px-6 py-16 text-center"
      style={{ borderColor: "#eceae4" }}
    >
      <AlertCircle className="h-12 w-12" style={{ color: "rgba(28,28,28,0.4)" }} aria-hidden />
      <h2 className="mt-4 text-[20px] font-semibold tracking-tight text-foreground">
        We couldn&apos;t reach the clinic search service
      </h2>
      <p className="mt-2 text-[16px] text-muted-foreground">Please try again in a moment.</p>
      <button
        type="button"
        onClick={onRetry}
        className="focus-ring mt-5 inline-flex items-center gap-1.5 rounded-standard bg-foreground px-4 py-2.5 text-[14px] text-[#fcfbf8] transition-colors duration-150 hover:bg-[#2a2a2a]"
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
      >
        Retry
      </button>
    </div>
  );
}
