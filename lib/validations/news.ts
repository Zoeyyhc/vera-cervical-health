import { z } from "zod";

export const newsQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  max: z.coerce.number().int().min(1).max(10).optional().default(5),
});

export type NewsQuery = z.infer<typeof newsQuerySchema>;

export const newsArticleSchema = z.object({
  title: z.string(),
  source: z.string(),
  url: z.string().url(),
  published_at: z.string(),
  description: z.string().nullable(),
});

export type NewsArticle = z.infer<typeof newsArticleSchema>;
