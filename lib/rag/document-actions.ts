"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteKnowledgeDocument } from "@/lib/rag/documents";
import { ingestDocument } from "@/lib/rag/store";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const DOCUMENTS_PATH = "/admin/knowledge/documents";
const MAX_CONTENT_BYTES = 512_000; // 500KB — matches /api/embeddings/ingest

const addDocumentSchema = z.object({
  name: z.string().trim().min(1, "name must not be empty").max(500),
  content: z
    .string()
    .trim()
    .min(1, "content must not be empty")
    .refine((c) => Buffer.byteLength(c, "utf8") <= MAX_CONTENT_BYTES, "content too large"),
});

const sourceSchema = z.string().nullable();

/**
 * Manually add a document to the knowledge base. Validates first, then chunks +
 * embeds + inserts via the shared ingest pipeline. `source` is the typed name;
 * metadata records the title and a `manual` origin. Admin-only.
 */
export async function addDocument(input: {
  name: string;
  content: string;
}): Promise<{ chunksCreated: number }> {
  const { name, content } = addDocumentSchema.parse(input);
  const { supabase } = await requireAdmin();

  const { chunkIds } = await ingestDocument(supabase, {
    source: name,
    content,
    metadata: { title: name, origin: "manual" },
  });

  revalidatePath(DOCUMENTS_PATH);
  return { chunksCreated: chunkIds.length };
}

/**
 * Delete a document (all chunks for a `source`; `null` = the unsourced group).
 * Hard delete. Admin-only.
 */
export async function deleteDocument(source: string | null): Promise<void> {
  const validSource = sourceSchema.parse(source);
  const { supabase } = await requireAdmin();
  await deleteKnowledgeDocument(supabase, validSource);
  revalidatePath(DOCUMENTS_PATH);
}
