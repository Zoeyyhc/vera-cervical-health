// app/(auth)/forgot-password/forgot-password-form.tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import { type ForgotPasswordFormValues, forgotPasswordSchema } from "@/lib/validations/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    });
    // Always show success regardless of whether email exists (prevents enumeration)
    setSubmittedEmail(values.email);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">Vera</p>
        <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px] mb-1.5">
          Check your inbox
        </h1>
        <p className="text-sm text-muted-gray mb-8">
          We sent a reset link to <span className="text-charcoal">{submittedEmail}</span>
        </p>
        <output className="block rounded-standard border border-green-300/30 bg-green-50/50 px-3 py-2.5 text-sm text-green-700">
          Reset link sent — check your email and follow the link to set a new password.
        </output>
        <p className="mt-6 text-center text-[13px] text-muted-gray">
          <Link href="/login" className="text-charcoal underline underline-offset-2">
            Back to login
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">Vera</p>
      <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px] mb-1.5">
        Reset password
      </h1>
      <p className="text-sm text-muted-gray mb-8">
        Enter your email and we&apos;ll send a reset link
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            variant="default"
            className="w-full mt-2"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      </Form>

      <p className="mt-5 text-center text-[13px] text-muted-gray">
        <Link href="/login" className="text-charcoal underline underline-offset-2">
          Back to login
        </Link>
      </p>
    </div>
  );
}
