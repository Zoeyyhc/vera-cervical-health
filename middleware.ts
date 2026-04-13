import { decideRedirect, isAdminPath } from "@/lib/auth/route-rules";
import type { Database } from "@/types/supabase";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  // supabaseResponse must be returned so cookie mutations from setAll() reach the browser.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    // biome-ignore lint/style/noNonNullAssertion: env vars are always set in middleware
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // biome-ignore lint/style/noNonNullAssertion: env vars are always set in middleware
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Use getUser() not getSession() — validates the token server-side and rotates it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Only query profiles.role when actually needed (admin gate).
  let isAdmin = false;
  if (user && isAdminPath(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = profile?.role === "admin";
  }

  const decision = decideRedirect({
    pathname,
    isAuthenticated: !!user,
    isAdmin,
  });

  if (decision.type === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = decision.to;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match everything except: Next internals, favicon, static image assets, and /api/webhooks.
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
