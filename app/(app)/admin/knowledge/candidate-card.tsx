"use client";

import { Button } from "@/components/ui/button";
import type { PendingCandidate } from "@/lib/discovery/candidates";
import { approveCandidate, rejectCandidate } from "@/lib/discovery/review-actions";
import { useState } from "react";
import { toast } from "sonner";

function pct(score: number | null): string {
  return score === null ? "—" : `${Math.round(score * 100)}%`;
}

export function CandidateCard({ candidate }: { candidate: PendingCandidate }) {
  const [pending, setPending] = useState(false);
  const gapCount = Array.isArray(candidate.gap_refs) ? candidate.gap_refs.length : 0;
  const preview = candidate.raw_content.slice(0, 300);

  async function run(action: (id: string) => Promise<void>, doneLabel: string) {
    setPending(true);
    try {
      await action(candidate.id);
      toast.success(doneLabel);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-medium text-charcoal">
            {candidate.title ?? candidate.source_url}
          </h2>
          <a
            href={candidate.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm text-muted-gray underline"
          >
            {candidate.source_url}
          </a>
        </div>
        <div className="flex shrink-0 gap-2 text-xs text-muted-gray">
          <span className="rounded border border-[#eceae4] px-2 py-1">
            authority {pct(candidate.authority_score)}
          </span>
          <span className="rounded border border-[#eceae4] px-2 py-1">
            relevance {pct(candidate.relevance_score)}
          </span>
        </div>
      </div>

      {candidate.summary ? (
        <p className="mt-3 text-sm text-charcoal/82">{candidate.summary}</p>
      ) : null}

      <p className="mt-2 text-xs text-muted-gray">
        Addresses {gapCount} gap question{gapCount === 1 ? "" : "s"}
        {candidate.domain_tags.length > 0 ? ` · ${candidate.domain_tags.join(", ")}` : ""}
      </p>

      <p className="mt-3 line-clamp-3 text-sm text-charcoal/82">{preview}…</p>

      <div className="mt-4 flex gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() => run(approveCandidate, "Approved and added to the knowledge base.")}
        >
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => run(rejectCandidate, "Rejected.")}
        >
          Reject
        </Button>
      </div>
    </li>
  );
}
