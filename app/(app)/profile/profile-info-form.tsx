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
import { type ProfileInfoFormValues, profileInfoSchema } from "@/lib/validations/profile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { toast } from "sonner";

type Props = {
  email: string;
  initialDisplayName: string;
};

export function ProfileInfoForm({ email, initialDisplayName }: Props) {
  const router = useRouter();

  const form = useForm<ProfileInfoFormValues>({
    resolver: zodResolver(profileInfoSchema),
    defaultValues: {
      displayName: initialDisplayName,
    },
  });

  async function onSubmit(values: ProfileInfoFormValues) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Session expired. Please sign in again.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: values.displayName })
      .eq("id", user.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Profile saved");
    form.reset(values);
    router.refresh();
  }

  const { isDirty, isSubmitting } = form.formState;

  return (
    <section className="rounded-card border border-border bg-cream p-6">
      <h2 className="text-lg font-semibold text-charcoal mb-4">Profile</h2>

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
