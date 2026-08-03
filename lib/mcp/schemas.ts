import { z } from "zod";

/**
 * Zod contracts for the three Victoria Trusted Health MCP tools.
 * Spec: docs/trusted-health-mcp-v0.1.md §5.
 *
 * Every input is bounded and closed. None of them accepts a URL, host name,
 * raw HTTP option, or an arbitrary source selector — a user cannot steer the
 * MCP at a source the registry has not approved. `.strict()` makes an unknown
 * key a validation failure rather than something silently ignored.
 */

export const HEALTH_TOPICS = [
  "screening",
  "hpv",
  "vaccination",
  "self_collection",
  "support",
] as const;

export const EVENT_TOPICS = ["cervical_screening", "hpv_vaccination", "womens_health"] as const;

export const EVENT_FORMATS = ["in_person", "online", "hybrid"] as const;

/**
 * A Victorian suburb or postcode. Letters (including accented), digits, spaces,
 * and light punctuation only — which is what rules out a URL, a host name, or an
 * injected instruction arriving through this field.
 *
 * Spelled out as an explicit character range rather than `\p{L}` because the
 * project's tsconfig has no `target`, so the `u` flag is unavailable.
 */
const LOCATION_CHAR = "a-zA-Z0-9\\u00c0-\\u024f";
const locationSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(
    new RegExp(`^[${LOCATION_CHAR}][${LOCATION_CHAR}\\s'./-]*$`),
    "location must be a suburb name or postcode"
  );

// ───── search_victoria_health_info ───────────────────────────────────────────

export const searchHealthInfoInput = z
  .object({
    query: z.string().trim().min(2).max(300),
    topic: z.enum(HEALTH_TOPICS).optional(),
  })
  .strict();

export type SearchHealthInfoInput = z.infer<typeof searchHealthInfoInput>;

export const healthInfoItem = z.object({
  id: z.string(),
  title: z.string(),
  excerpt: z.string(),
  sourceName: z.string(),
  sourceUrl: z.string(),
  jurisdiction: z.enum(["AU", "VIC"]),
  verification: z.enum(["official_source", "clinical_nonprofit"]),
  publishedAt: z.string().optional(),
  reviewedAt: z.string(),
});

export const searchHealthInfoOutput = z.object({
  items: z.array(healthInfoItem),
  noResultReason: z.enum(["no_approved_match"]).optional(),
});

export type HealthInfoItem = z.infer<typeof healthInfoItem>;
export type SearchHealthInfoOutput = z.infer<typeof searchHealthInfoOutput>;

// ───── find_victoria_screening_services ──────────────────────────────────────

export const findScreeningServicesInput = z
  .object({
    location: locationSchema,
    preferences: z
      .object({
        selfCollection: z.boolean().optional(),
        accessibility: z.boolean().optional(),
        language: z.string().trim().min(2).max(50).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type FindScreeningServicesInput = z.infer<typeof findScreeningServicesInput>;

export const directoryLink = z.object({
  directoryName: z.string(),
  searchUrl: z.string(),
  coverage: z.literal("VIC"),
  supports: z.array(z.string()),
  verification: z.literal("directory_listing"),
  reviewedAt: z.string(),
  confirmationNotice: z.string(),
});

export const findScreeningServicesOutput = z.object({
  directoryLinks: z.array(directoryLink),
  noResultReason: z.enum(["outside_victoria", "no_approved_directory"]).optional(),
});

export type DirectoryLink = z.infer<typeof directoryLink>;
export type FindScreeningServicesOutput = z.infer<typeof findScreeningServicesOutput>;

// ───── list_victoria_verified_events ─────────────────────────────────────────

export const listVerifiedEventsInput = z
  .object({
    location: locationSchema.optional(),
    fromDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "fromDate must be an ISO-8601 date (YYYY-MM-DD)")
      .optional(),
    topic: z.enum(EVENT_TOPICS).optional(),
  })
  .strict();

export type ListVerifiedEventsInput = z.infer<typeof listVerifiedEventsInput>;

export const verifiedEvent = z.object({
  id: z.string(),
  name: z.string(),
  startsAt: z.string(),
  endsAt: z.string().optional(),
  locationLabel: z.string(),
  format: z.enum(EVENT_FORMATS),
  organiser: z.string(),
  registrationUrl: z.string(),
  sourceUrl: z.string(),
  verification: z.literal("manually_curated"),
  reviewedAt: z.string(),
  expiresAt: z.string(),
});

export const listVerifiedEventsOutput = z.object({
  events: z.array(verifiedEvent),
  noResultReason: z.enum(["outside_victoria", "no_upcoming_events"]).optional(),
});

export type VerifiedEvent = z.infer<typeof verifiedEvent>;
export type ListVerifiedEventsOutput = z.infer<typeof listVerifiedEventsOutput>;

// ───── shared ────────────────────────────────────────────────────────────────

/** Every tool caps its result set at five (spec §5). */
export const MAX_RESULTS = 5;

export const MCP_TOOL_NAMES = [
  "search_victoria_health_info",
  "find_victoria_screening_services",
  "list_victoria_verified_events",
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];
