import { NextResponse, type NextRequest } from "next/server";

// Gate every page behind the staff session when a passcode is configured.
// (Signature is verified server-side in lib/session.ts; this only redirects anonymous visitors.)
export function middleware(req: NextRequest) {
  if (!process.env.WORKSPACE_PASSCODE) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();
  if (!req.cookies.get("hunscout_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon.ico|api/health).*)"] };
