import { z } from "zod";

/**
 * What the assistant is waiting for the user to supply, carried on the assistant
 * message that asked for it (`chat_messages.metadata`).
 *
 * This replaces matching the previous assistant turn against a set of known
 * fallback strings. That worked only while every prompt was a fixed constant,
 * and it broke the moment one needed to name the suburb it was asking about —
 * "Richmond is in five states, which one?" cannot be a member of a Set. It also
 * silently lost the retry path whenever anyone edited the copy.
 */

export const pendingActionSchema = z.object({
  kind: z.enum(["find_events", "find_services"]),
  /** The only thing we currently block on. Widening this is a schema change. */
  awaiting: z.literal("location"),
  /** Events only: the scope to resume with once a location arrives. */
  scope: z.enum(["statewide", "nearby", "specified_location"]).optional(),
  /**
   * The suburb whose state we asked about, when the block was an ambiguous
   * name. Carried so a reply of "Victoria" rejoins it as "Burwood, Victoria"
   * rather than being read as a request to search the whole state — the user is
   * answering *which Burwood*, not widening the search.
   */
  locality: z.string().optional(),
  /**
   * True when the client should offer a browser geolocation prompt before
   * falling back to asking the user to type a suburb.
   */
  geolocation: z.boolean().optional(),
});

export type PendingAction = z.infer<typeof pendingActionSchema>;

const messageMetadataSchema = z.object({
  pendingAction: pendingActionSchema.optional(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

/**
 * Read a pending action off a `chat_messages.metadata` value.
 *
 * The column is `jsonb` with no shape guarantee, and rows predate this feature,
 * so anything unparseable is simply "no pending action" — a dropped retry is a
 * mildly worse conversation, where a throw here would fail the whole turn.
 */
export function readPendingAction(metadata: unknown): PendingAction | null {
  if (metadata === null || metadata === undefined) return null;
  const parsed = messageMetadataSchema.safeParse(metadata);
  if (!parsed.success) return null;
  return parsed.data.pendingAction ?? null;
}
