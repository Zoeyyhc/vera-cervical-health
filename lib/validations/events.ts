import { z } from "zod";

export const eventsQuerySchema = z.object({
  location: z.string().trim().min(1, "location is required").max(200),
  q: z.string().trim().max(200).optional().default(""),
  max: z.coerce.number().int().min(1).max(10).optional().default(5),
});

export type EventsQuery = z.infer<typeof eventsQuerySchema>;

export const healthEventSchema = z.object({
  name: z.string(),
  date: z.string(),
  location: z.string(),
  url: z.string().url(),
  description: z.string().nullable(),
});

export type HealthEvent = z.infer<typeof healthEventSchema>;
