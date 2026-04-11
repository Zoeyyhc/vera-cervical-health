import { createClient } from "@/lib/supabase/server";
// app/api/auth/callback/route.ts
import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/chat";

  if (tokenHash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return Response.redirect(`${origin}${next}`);
    }
  }

  return Response.redirect(`${origin}/login?error=link-expired`);
}
