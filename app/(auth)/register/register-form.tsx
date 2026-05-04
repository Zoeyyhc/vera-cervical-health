// app/(auth)/register/register-form.tsx
"use client";

import { GoogleIcon } from "@/components/icons/google";
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
import { PasswordInput } from "@/components/ui/password-input";
import { createClient } from "@/lib/supabase/browser";
import { type RegisterFormValues, registerSchema } from "@/lib/validations/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export function RegisterForm() {
  const [emailSent, setEmailSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: RegisterFormValues) {
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setEmailSent(true);
  }

  async function onGoogleSignIn() {
    setGoogleLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=/chat` },
    });
    if (error) {
      toast.error(error.message);
      setGoogleLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div className="space-y-4">
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">
          Cervix Health
        </p>
        <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px]">
          Check your email
        </h1>
        <p className="text-sm text-muted-gray">
          We sent a confirmation link to your inbox. Click it to activate your account.
        </p>
        <p className="text-[13px] text-muted-gray">
          Already confirmed?{" "}
          <Link href="/login" className="text-charcoal underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">Cervix Health</p>
      <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px] mb-1.5">
        Create account
      </h1>
      <p className="text-sm text-muted-gray mb-8">Start your health journey</p>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onGoogleSignIn}
        disabled={googleLoading || form.formState.isSubmitting}
      >
        <GoogleIcon className="mr-2 h-4 w-4" />
        {googleLoading ? "Redirecting..." : "Continue with Google"}
      </Button>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-cream px-3 text-[11px] uppercase tracking-[0.08em] text-muted-gray">
            or
          </span>
        </div>
      </div>

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
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <PasswordInput placeholder="Min. 8 characters" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <PasswordInput placeholder="Re-enter your password" {...field} />
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
            {form.formState.isSubmitting ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </Form>

      <p className="mt-5 text-center text-[13px] text-muted-gray">
        Already have an account?{" "}
        <Link href="/login" className="text-charcoal underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
