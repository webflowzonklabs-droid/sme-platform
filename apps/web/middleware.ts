import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware for auth redirects.
 * - Unauthenticated users accessing protected routes → redirect to /login
 * - Authenticated users accessing auth pages → redirect to /select-tenant
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get("session_token")?.value;

  // Auth pages — redirect to select-tenant if already logged in
  const authPages = ["/login", "/register"];
  if (authPages.includes(pathname) && sessionToken) {
    return NextResponse.redirect(new URL("/select-tenant", request.url));
  }

  // Protected routes — redirect to login if not authenticated
  const isProtectedRoute =
    pathname.startsWith("/select-tenant") ||
    pathname.startsWith("/create-tenant") ||
    // Any route that matches /[slug] pattern (tenant routes)
    (!pathname.startsWith("/api") &&
      !pathname.startsWith("/_next") &&
      !pathname.startsWith("/login") &&
      !pathname.startsWith("/register") &&
      pathname !== "/");

  if (isProtectedRoute && !sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - _next static files
     * - _next images
     * - favicon
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
