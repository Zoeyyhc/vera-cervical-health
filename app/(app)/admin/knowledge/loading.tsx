// Shown while the admin knowledge pages resolve (force-dynamic, so they always
// hit the server). Covers /admin/knowledge and /admin/knowledge/documents,
// since the latter has no loading.tsx of its own.
export default function AdminKnowledgeLoading() {
  return (
    <div className="container-cervix py-8" aria-busy="true">
      <div
        className="shimmer mb-6 h-8 w-64 rounded"
        style={{ backgroundColor: "rgba(28,28,28,0.06)" }}
      />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholder rows
            key={i}
            className="shimmer rounded-card border p-4"
            style={{ borderColor: "#eceae4" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className="h-4 w-1/2 rounded"
                style={{ backgroundColor: "rgba(28,28,28,0.06)" }}
              />
              <div
                className="h-4 w-16 rounded"
                style={{ backgroundColor: "rgba(28,28,28,0.06)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
