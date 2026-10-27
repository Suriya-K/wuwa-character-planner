import { type NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isValidCookie } from "@/lib/auth";

// Everything except the login form and its endpoint sits behind the single password (ticket 03)
export function proxy(req: NextRequest) {
  if (isValidCookie(req.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!(?:login|api/login)$|_next/static/|_next/image|favicon\\.ico$).*)"],
};
