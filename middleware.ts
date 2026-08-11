import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * `/` → static landing (public/landing.html)
 * Меню «landing | play» больше не показывается.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/landing.html", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
