// app/(auth)/login/login-form.tsx
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
import { type LoginFormValues, loginSchema } from "@/lib/validations/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  const showResetSuccess = searchParams.get("reset") === "success";
  const showLinkExpired = searchParams.get("error") === "link-expired";

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setServerError(error.message);
      return;
    }
    router.push("/chat");
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">Cervix Health</p>
      <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px] mb-1.5">
        Welcome back
      </h1>
      <p className="text-sm text-muted-gray mb-8">Sign in to your account</p>

      {showResetSuccess && (
        <output className="block mb-4 rounded-standard border border-green-300/30 bg-green-50/50 px-3 py-2.5 text-sm text-green-700">
          Password updated — sign in below
        </output>
      )}
      {showLinkExpired && (
        <div
          role="alert"
          className="mb-4 rounded-standard border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          Reset link has expired — request a new one
        </div>
      )}
      {serverError && (
        <div
          role="alert"
          className="mb-4 rounded-standard border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

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
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-baseline justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-charcoal underline underline-offset-2"
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <Input type="password" placeholder="••••••••" {...field} />
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
            {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Form>

      <p className="mt-5 text-center text-[13px] text-muted-gray">
        {"Don't have an account?"}{" "}
        <Link href="/register" className="text-charcoal underline underline-offset-2">
          Create one
        </Link>
      </p>
    </div>
  );
}
