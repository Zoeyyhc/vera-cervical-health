"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { EVENT_FORMATS, EVENT_TOPICS } from "@/lib/mcp/schemas";
import { resolveVictoriaScope } from "@/lib/mcp/victoria";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Admin approval actions for the Victoria Trusted Health MCP.
 *
 * Spec §6: nothing becomes visible to the MCP without an administrator
 * approving it, and every event needs a named approved organiser, an official
 * URL, a date, and a publication review before it becomes visible. These
 * actions are the only way to move a row into `approved`.
 *
 * All of them go through `requireAdmin()`, so they run under the admin's
 * RLS-bound client — never the service-role client.
 */

const ADMIN_PATH = "/admin/trusted-health";

const uuid = z.string().uuid();

/** Registration and source links must be first-party https URLs. */
const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((value) => value.startsWith("https://"), "must be an https URL");

// ───── sources ───────────────────────────────────────────────────────────────

const sourceStatusSchema = z.object({
  id: uuid,
  status: z.enum(["approved", "revoked"]),
});

/**
 * Approve or revoke a registry source. Revoking takes effect immediately for
 * every dependent row: the MCP queries inner-join `trusted_sources` on
 * `status = 'approved'`, so a revoked source's content, directory links, and
 * events all stop being returned without any further cleanup.
 */
export async function setSourceStatus(input: { id: string; status: "approved" | "revoked" }) {
  const { id, status } = sourceStatusSchema.parse(input);
  const { supabase, user } = await requireAdmin();

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("trusted_sources")
    .update(
      status === "approved"
        ? { status, approved_by: user.id, approved_at: now, reviewed_at: now }
        : { status, reviewed_at: now }
    )
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(ADMIN_PATH);
}

// ───── events ────────────────────────────────────────────────────────────────

const createEventSchema = z
  .object({
    sourceId: uuid,
    name: z.string().trim().min(3).max(200),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).optional().or(z.literal("")),
    locationLabel: z.string().trim().min(2).max(200),
    format: z.enum(EVENT_FORMATS),
    topic: z.enum(EVENT_TOPICS).optional().or(z.literal("")),
    registrationUrl: httpsUrl,
    sourceUrl: httpsUrl,
  })
  .refine(
    (v) => !v.endsAt || new Date(v.endsAt) >= new Date(v.startsAt),
    "the end time must not be before the start time"
  )
  .refine(
    // In-person events must be somewhere in Victoria — the MCP is Victoria-only,
    // and an event that fails this check would be created but never returned.
    (v) => v.format === "online" || resolveVictoriaScope(v.locationLabel).inVictoria,
    "an in-person or hybrid event must have a Victorian suburb or postcode in its location"
  );

export type CreateEventInput = z.input<typeof createEventSchema>;

/**
 * Create an event candidate. Always lands as `pending` — this action cannot
 * publish, no matter what the caller sends. Approval is a separate, explicit
 * step (spec §6, events lifecycle).
 */
export async function createVerifiedEvent(input: CreateEventInput): Promise<void> {
  const parsed = createEventSchema.parse(input);
  const { supabase, user } = await requireAdmin();

  // The organiser must be an approved source permitted for events.
  const { data: source, error: sourceErr } = await supabase
    .from("trusted_sources")
    .select("id, status, permitted_content")
    .eq("id", parsed.sourceId)
    .single();
  if (sourceErr || !source) throw new Error(sourceErr?.message ?? "organiser not found");
  if (source.status !== "approved" || !source.permitted_content.includes("events")) {
    throw new Error("that organiser is not approved for events");
  }

  const { error } = await supabase.from("verified_events").insert({
    source_id: parsed.sourceId,
    name: parsed.name,
    starts_at: parsed.startsAt,
    ends_at: parsed.endsAt ? parsed.endsAt : null,
    location_label: parsed.locationLabel,
    format: parsed.format,
    topic: parsed.topic ? parsed.topic : null,
    registration_url: parsed.registrationUrl,
    source_url: parsed.sourceUrl,
    status: "pending",
    created_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(ADMIN_PATH);
}

const eventStatusSchema = z.object({
  id: uuid,
  status: z.enum(["approved", "rejected"]),
});

/**
 * Approve or reject an event. Approval stamps `reviewed_at`, which the MCP
 * requires on every returned event — an event with no reviewer attestation is
 * skipped even if its status somehow said otherwise.
 */
export async function setEventStatus(input: { id: string; status: "approved" | "rejected" }) {
  const { id, status } = eventStatusSchema.parse(input);
  const { supabase, user } = await requireAdmin();

  const { error } = await supabase
    .from("verified_events")
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(ADMIN_PATH);
}

// ───── directory links ───────────────────────────────────────────────────────

const directoryStatusSchema = z.object({
  id: uuid,
  status: z.enum(["approved", "retired"]),
});

/** Approve or retire a directory link, stamping the 3-month review date. */
export async function setDirectoryLinkStatus(input: {
  id: string;
  status: "approved" | "retired";
}) {
  const { id, status } = directoryStatusSchema.parse(input);
  const { supabase } = await requireAdmin();

  const nextReview = new Date();
  nextReview.setMonth(nextReview.getMonth() + 3);

  const { error } = await supabase
    .from("directory_links")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      next_review_at: nextReview.toISOString().slice(0, 10),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(ADMIN_PATH);
}
