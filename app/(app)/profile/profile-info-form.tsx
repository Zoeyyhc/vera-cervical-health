// app/(app)/profile/profile-info-form.tsx
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
import { cn } from "@/lib/utils";
import {
  LOCALES,
  type Locale,
  type ProfileInfoFormValues,
  profileInfoSchema,
} from "@/lib/validations/profile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

type Props = {
  email: string;
  initialDisplayName: string;
  initialLocale: Locale;
};

// Native-script label for each locale. Written via \u escapes to keep
// this source file ASCII-clean (project crashacter policy).
const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  zh: "\u4e2d\u6587",
};

export function ProfileInfoForm({ email, initialDisplayName, initialLocale }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const form = useForm<ProfileInfoFormValues>({
    resolver: zodResolver(profileInfoSchema),
    defaultValues: {
      displayName: initialDisplayName,
      locale: initialLocale,
    },
  });

  async function onSubmit(values: ProfileInfoFormValues) {
    setServerError(null);
    setSuccessMessage(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setServerError("Session expired. Please sign in again.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: values.displayName,
        locale: values.locale,
      })
      .eq("id", user.id);

    if (error) {
      setServerError(error.message);
      return;
    }

    setSuccessMessage("Profile saved");
    form.reset(values);
    router.refresh();
  }

  const { isDirty, isSubmitting } = form.formState;

  return (
    <section className="rounded-card border border-border bg-cream p-6">
      <h2 className="text-lg font-semibold text-charcoal mb-4">Profile</h2>

      {successMessage && (
        <output className="block mb-4 rounded-standard border border-green-300/30 bg-green-50/50 px-3 py-2.5 text-sm text-green-700">
          {successMessage}
        </output>
      )}
      {serverError && (
        <div
          role="alert"
          className="mb-4 rounded-standard border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

      <div className="mb-4">
        <p className="text-sm font-medium text-charcoal mb-1">Email</p>
        <p className="text-sm text-muted-gray">{email}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display name</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    autoComplete="name"
                    maxLength={60}
                    placeholder="How you'd like to be addressed"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="locale"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Language</FormLabel>
                <FormControl>
                  {/* fieldset is the semantic container for a button group */}
                  <fieldset className="inline-flex rounded-standard border border-border bg-cream p-1 m-0 min-w-0">
                    {LOCALES.map((code) => (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={field.value === code}
                        onClick={() => field.onChange(code)}
                        className={cn(
                          "px-4 py-1.5 text-sm rounded-standard transition-colors",
                          field.value === code
                            ? "bg-charcoal text-off-white"
                            : "text-muted-gray hover:text-charcoal"
                        )}
                      >
                        {LOCALE_LABEL[code]}
                      </button>
                    ))}
                  </fieldset>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            variant="default"
            className="mt-2"
            disabled={!isDirty || isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </form>
      </Form>
    </section>
  );
}
