// Server-side Zod schema for `POST /api/chat` request bodies. Uses the regular
// `zod` import — not `zod/v3` — because this is server route validation, not a
// React Hook Form resolver.
import { z } from "zod";

export const chatRequestSchema = z.object({
  message: z
    .string()
    .min(1, "message must not be empty")
    .max(4000, "message must be 4000 characters or fewer"),
  sessionId: z.string().uuid("sessionId must be a UUID").optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
