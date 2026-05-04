import { z } from "zod";

export const clinicSearchQuerySchema = z.object({
  location: z.string().trim().min(1).max(200),
  keyword: z.string().trim().max(200).optional(),
});

export type ClinicSearchQuery = z.infer<typeof clinicSearchQuerySchema>;

export const clinicResultSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
  formattedAddress: z.string().min(1),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  phone: z.string().optional(),
  websiteUri: z.string().url().optional(),
  rating: z.number().min(0).max(5).optional(),
  userRatingCount: z.number().int().nonnegative().optional(),
  openNow: z.boolean().optional(),
  weekdayDescriptions: z.array(z.string()).optional(),
  distanceMeters: z.number().nonnegative().optional(),
  googleMapsUri: z.string().url(),
});

export type ClinicResultParsed = z.infer<typeof clinicResultSchema>;
