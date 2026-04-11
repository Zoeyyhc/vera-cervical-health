// app/(auth)/forgot-password/page.tsx
import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password — Cervix Health Assistant",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
