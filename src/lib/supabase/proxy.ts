import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

export async function updateSession(request: NextRequest, requestHeaders?: Headers) {
  const nextInit = requestHeaders === undefined ? { request } : { request: { headers: requestHeaders } };
  let response = NextResponse.next(nextInit);
  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next(nextInit);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const protectedRoute = request.nextUrl.pathname.startsWith("/dashboard") || request.nextUrl.pathname.startsWith("/studio") || request.nextUrl.pathname.startsWith("/admin");
  const authRoute = request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup";

  if (protectedRoute && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (authRoute && signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/videos";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
