export function ClinicLoadingSkeleton() {
  return (
    <ul className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholder rows
          key={i}
          className="shimmer rounded-card border bg-background p-4"
          style={{ borderColor: "#eceae4" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="h-4 w-2/3 rounded" style={{ backgroundColor: "rgba(28,28,28,0.06)" }} />
            <div className="h-4 w-12 rounded" style={{ backgroundColor: "rgba(28,28,28,0.06)" }} />
          </div>
          <div
            className="mt-3 h-3 w-5/6 rounded"
            style={{ backgroundColor: "rgba(28,28,28,0.06)" }}
          />
          <div className="mt-3 flex gap-3">
            <div className="h-3 w-16 rounded" style={{ backgroundColor: "rgba(28,28,28,0.06)" }} />
            <div className="h-3 w-24 rounded" style={{ backgroundColor: "rgba(28,28,28,0.06)" }} />
            <div className="h-3 w-16 rounded" style={{ backgroundColor: "rgba(28,28,28,0.06)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
