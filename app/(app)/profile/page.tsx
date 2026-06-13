// app/(app)/profile/page.tsx
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";
import { ProfileInfoForm } from "./profile-info-form";

export default async function ProfilePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware guarantees an authenticated user before this page renders,
  // so `user` is always present. Narrow for TS and bail defensively.
  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const initialDisplayName = profile?.display_name ?? "";

  return (
    <main className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-xl space-y-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">Vera</p>
          <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px]">
            Profile settings
          </h1>
        </header>

        <ProfileInfoForm email={user.email ?? ""} initialDisplayName={initialDisplayName} />

        <PasswordForm />
      </div>
    </main>
  );
}
