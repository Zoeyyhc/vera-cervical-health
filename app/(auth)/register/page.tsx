// app/(auth)/register/page.tsx
import type { Metadata } from "next";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create account — Vera",
};

export default function RegisterPage() {
  return <RegisterForm />;
}
