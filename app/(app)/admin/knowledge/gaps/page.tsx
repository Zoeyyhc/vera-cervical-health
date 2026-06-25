import { requireAdmin } from "@/lib/auth/require-admin";
import { GAP_LOOKBACK_DAYS } from "@/lib/discovery/constants";
import { listRecentGaps } from "@/lib/discovery/gaps";
import Link from "next/link";
import { RunDiscoveryButton } from "../run-discovery-button";
import { AddGapForm } from "./add-gap-form";
import { GapRow } from "./gap-row";

// Always render fresh — the list changes as gaps are added and addressed.
export const dynamic = "force-dynamic";

export default async function KnowledgeGapsPage() {
  const { supabase } = await requireAdmin();
  const gaps = await listRecentGaps(supabase);

  return (
    <main className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium text-charcoal">Knowledge gaps</h1>
            <p className="mt-1 text-sm text-muted-gray">
              {gaps.length} gap{gaps.length === 1 ? "" : "s"} from the last {GAP_LOOKBACK_DAYS} days
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/knowledge" className="text-sm text-charcoal underline">
              ← Review queue
            </Link>
            <RunDiscoveryButton />
          </div>
        </header>

        <AddGapForm />

        {gaps.length === 0 ? (
          <p className="rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-8 text-center text-sm text-muted-gray">
            No gaps in the last {GAP_LOOKBACK_DAYS} days. Add one above, or wait for user questions
            the knowledge base answers poorly.
          </p>
        ) : (
          <ul className="space-y-3">
            {gaps.map((gap) => (
              <GapRow key={gap.id} gap={gap} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
