// Server-side Zod schema for `POST /api/embeddings/ingest`. Uses regular
// `zod` import — not `zod/v3` — because this is server route validation,
// not a React Hook Form resolver. Same pattern as `lib/validations/chat.ts`.
import { z } from "zod";

export const ingestRequestSchema = z.object({
  source: z
    .string()
    .min(1, "source must not be empty")
    .max(500, "source must be 500 characters or fewer"),
  content: z.string().min(1, "content must not be empty"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;
