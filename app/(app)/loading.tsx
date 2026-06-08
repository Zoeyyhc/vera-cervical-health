// Baseline Suspense fallback for the whole (app) segment. Shown the instant a
// nav link is clicked while the destination's layout/page resolves on the
// server — most notably the chat layout's session-list fetch, which lives in
// chat/layout.tsx and so isn't covered by chat/loading.tsx (that only wraps the
// page). Without a loading boundary, App Router navigation is blocking: the old
// page stays frozen until the server responds, which reads as click lag.
export default function AppLoading() {
  return (
    <div className="container-cervix flex flex-1 flex-col gap-4 py-8" aria-busy="true">
      <div
        className="shimmer h-7 w-48 rounded"
        style={{ backgroundColor: "rgba(28,28,28,0.06)" }}
      />
      <div
        className="shimmer h-4 w-full max-w-2xl rounded"
        style={{ backgroundColor: "rgba(28,28,28,0.06)" }}
      />
      <div
        className="shimmer h-4 w-5/6 max-w-2xl rounded"
        style={{ backgroundColor: "rgba(28,28,28,0.06)" }}
      />
      <div className="shimmer rounded-card border" style={{ borderColor: "#eceae4" }}>
        <div className="h-64 w-full" />
      </div>
    </div>
  );
}
