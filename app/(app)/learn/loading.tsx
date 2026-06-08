// Shown while the learn hub resolves. A card-grid skeleton that echoes the
// topic cards the page renders.
export default function LearnLoading() {
  return (
    <div className="container-cervix py-8" aria-busy="true">
      <div
        className="shimmer mb-6 h-8 w-56 rounded"
        style={{ backgroundColor: "rgba(28,28,28,0.06)" }}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholder cards
            key={i}
            className="shimmer rounded-card border p-5"
            style={{ borderColor: "#eceae4" }}
          >
            <div className="h-4 w-2/3 rounded" style={{ backgroundColor: "rgba(28,28,28,0.06)" }} />
            <div
              className="mt-3 h-3 w-full rounded"
              style={{ backgroundColor: "rgba(28,28,28,0.06)" }}
            />
            <div
              className="mt-2 h-3 w-5/6 rounded"
              style={{ backgroundColor: "rgba(28,28,28,0.06)" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
