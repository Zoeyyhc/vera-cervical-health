// Shown in the chat message column while a session's page resolves — e.g. when
// clicking a session in the sidebar, which navigates to /chat/[sessionId] and
// re-fetches that session's messages on the server. The sidebar (chat/layout)
// stays put; only this main area swaps to the skeleton.
export default function ChatLoading() {
  return (
    <div className="flex flex-1 flex-col px-6 py-8" aria-busy="true">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {[
          { side: "end", w: "w-1/2" },
          { side: "start", w: "w-3/4" },
          { side: "end", w: "w-2/5" },
          { side: "start", w: "w-2/3" },
        ].map((row, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: stable placeholder rows
            key={i}
            className={`flex ${row.side === "end" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`shimmer rounded-card border ${row.w}`}
              style={{ borderColor: "#eceae4" }}
            >
              <div className="h-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
