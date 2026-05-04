"use client";

import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-[13px] text-muted-gray underline underline-offset-4"
    >
      Sign out
    </button>
  );
}
