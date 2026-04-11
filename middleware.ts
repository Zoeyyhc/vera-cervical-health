import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// URL paths for app/(app)/* — route group parentheses don't appear in the URL.
const PROTECTED_PATHS = ["/chat", "/clinics", "/learn", "/profile", "/admin"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  // supabaseResponse must be returned so cookie mutations from setAll() reach the browser.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
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

  if (!user && isProtected(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
