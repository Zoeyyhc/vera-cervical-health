import type { KnowledgeGap } from "@/lib/discovery/gaps";

/** One row in the admin gaps list. Presentational; no data fetching. */
export function GapRow({ gap }: { gap: KnowledgeGap }) {
  const date = new Date(gap.createdAt).toLocaleDateString();
  const badge = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

  return (
    <li className="rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-charcoal">{gap.question}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`${badge} bg-[#eceae4] text-charcoal`}>
            {gap.source === "manual" ? "Manual" : "User"}
          </span>
          {gap.addressed ? (
            <span className={`${badge} bg-[#e3efe3] text-charcoal`}>Addressed</span>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-gray">
        <span>
          score: <span>{gap.topScore === null ? "—" : gap.topScore.toFixed(2)}</span>
        </span>
        <span>{date}</span>
      </div>
    </li>
  );
}
