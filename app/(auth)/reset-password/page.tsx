// app/(auth)/reset-password/page.tsx
import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Set new password — Vera",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
