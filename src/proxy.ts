import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// /welcome checks the session itself: a failed verification link lands
// there without one and is sent on to the login page with an explanation
const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/welcome",
];

/**
 * Optimistic check: only looks for the session cookie so logged-out users go
 * straight to the login page with a way back. Pages and the API verify the
 * session for real.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || getSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // everything except the API (it answers 401 itself), Next internals and
  // files served from /public
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
