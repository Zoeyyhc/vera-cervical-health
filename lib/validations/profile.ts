// lib/validations/profile.ts
// Import from zod/v3 so @hookform/resolvers' zodResolver Zod-v3 overload
// matches correctly, same pattern as lib/validations/auth.ts.
import { z } from "zod/v3";

export const profileInfoSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(60, "Display name must be 60 characters or fewer"),
});

export const passwordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ProfileInfoFormValues = z.infer<typeof profileInfoSchema>;
export type PasswordFormValues = z.infer<typeof passwordSchema>;
