import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Lightweight Edge middleware — do NOT import next-auth / prisma / bcrypt here
 * or the bundle exceeds Vercel Hobby's 1 MB Edge limit.
 * Real role checks happen in admin/nurse layouts via requireRole().
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

const hasSession = (req: NextRequest) =>
  SESSION_COOKIES.some((name) => Boolean(req.cookies.get(name)?.value));

export const middleware = (req: NextRequest) => {
  const { pathname } = req.nextUrl;
  const loggedIn = hasSession(req);

  if (pathname.startsWith("/login")) {
    if (loggedIn) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/nurse")) {
    if (!loggedIn) {
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
