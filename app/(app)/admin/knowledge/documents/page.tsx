import { requireAdmin } from "@/lib/auth/require-admin";
import { listKnowledgeDocuments } from "@/lib/rag/documents";
import Link from "next/link";
import { AddDocumentForm } from "./add-document-form";
import { DocumentRow } from "./document-row";

// Always render fresh — the list changes as documents are added/deleted.
export const dynamic = "force-dynamic";

export default async function KnowledgeDocumentsPage() {
  const { supabase } = await requireAdmin();
  const documents = await listKnowledgeDocuments(supabase);

  return (
    <main className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium text-charcoal">Knowledge documents</h1>
            <p className="mt-1 text-sm text-muted-gray">
              {documents.length} document{documents.length === 1 ? "" : "s"} in the knowledge base
            </p>
          </div>
          <Link href="/admin/knowledge" className="text-sm text-charcoal underline">
            ← Review queue
          </Link>
        </header>

        <AddDocumentForm />

        {documents.length === 0 ? (
          <p className="rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-8 text-center text-sm text-muted-gray">
            No documents yet. Add one above, or approve discovered candidates from the review queue.
          </p>
        ) : (
          <ul className="space-y-3">
            {documents.map((doc) => (
              <DocumentRow key={doc.source ?? "__null__"} doc={doc} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
