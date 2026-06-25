import { requireAdmin } from "@/lib/auth/require-admin";
import { listPendingCandidates } from "@/lib/discovery/candidates";
import Link from "next/link";
import { CandidateCard } from "./candidate-card";
import { RunDiscoveryButton } from "./run-discovery-button";

// Always render fresh — the queue changes as candidates are approved/rejected.
export const dynamic = "force-dynamic";

export default async function KnowledgeReviewPage() {
  const { supabase } = await requireAdmin();
  const candidates = await listPendingCandidates(supabase);

  return (
    <main className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium text-charcoal">Knowledge review</h1>
            <p className="mt-1 text-sm text-muted-gray">
              {candidates.length} pending candidate{candidates.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/knowledge/gaps" className="text-sm text-charcoal underline">
              View gaps →
            </Link>
            <Link href="/admin/knowledge/documents" className="text-sm text-charcoal underline">
              Manage documents →
            </Link>
            <RunDiscoveryButton />
          </div>
        </header>

        {candidates.length === 0 ? (
          <p className="rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-8 text-center text-sm text-muted-gray">
            No candidates awaiting review. Run discovery to surface new sources.
          </p>
        ) : (
          <ul className="space-y-4">
            {candidates.map((c) => (
              <CandidateCard key={c.id} candidate={c} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
