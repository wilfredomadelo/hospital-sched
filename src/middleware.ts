import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Lightweight Edge middleware — do NOT import next-auth / prisma / bcrypt here.
 * Role checks happen in layouts via requireRole().
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

const hasSession = (req: NextRequest) =>
  SESSION_COOKIES.some((name) => Boolean(req.cookies.get(name)?.value));

export const middleware = (req: NextRequest) => {
  const { pathname } = req.nextUrl;

  // Always allow login — stale JWTs must not trap users away from sign-in
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/nurse")) {
    if (!hasSession(req)) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
};

export const config = {
  matcher: ["/admin/:path*", "/nurse/:path*", "/login"],
};
