import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME } from "@/lib/session";

// Edge middleware: runs before any /dashboard or /api/* request.
// We do NOT call lib/env here because middleware runs at the edge and
// SESSION_SECRET is the only thing it needs.
const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/health"];

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !SESSION_SECRET) {
    return rejectUnauthorized(req);
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(SESSION_SECRET), {
      algorithms: ["HS256"],
    });
    return NextResponse.next();
  } catch {
    return rejectUnauthorized(req);
  }
}

function rejectUnauthorized(req: NextRequest) {
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  if (isApi) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Authentication required." } },
      { status: 401 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}
