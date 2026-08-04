// Server-side Zod schema for `POST /api/chat` request bodies. Uses the regular
// `zod` import — not `zod/v3` — because this is server route validation, not a
// React Hook Form resolver.
import { z } from "zod";

/**
 * A reverse-geocoded browser position. Structured rather than a single city
 * string because the state is the load-bearing field: 457 Victorian suburb
 * names are also used by another state, so "Burwood" alone confirms nothing.
 */
export const geoFixSchema = z.object({
  suburb: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(50).optional(),
  postcode: z
    .string()
    .regex(/^\d{4}$/, "postcode must be 4 digits")
    .optional(),
});

export const chatRequestSchema = z.object({
  message: z
    .string()
    .min(1, "message must not be empty")
    .max(4000, "message must be 4000 characters or fewer"),
  sessionId: z.string().uuid("sessionId must be a UUID").optional(),
  geo: geoFixSchema.optional(),
  /**
   * The client tried browser geolocation for this turn and got nothing —
   * denied, timed out, unsupported, or the reverse geocode failed. Lets the
   * orchestrator ask the user to type a suburb instead of asking the browser
   * again, and stops a denied permission being reported as "no events found".
   */
  geolocationAttempted: z.boolean().optional(),
  /**
   * This is the client resending a turn the server asked it to complete with a
   * location. The user message is already persisted from the first attempt, so
   * the route must not write it twice.
   */
  continuation: z.boolean().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
