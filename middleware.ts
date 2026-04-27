import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME } from "@/lib/session";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

const PUBLIC_API_PREFIXES = [
  "/api/auth/", // OAuth flow
  "/api/health", // healthcheck
  "/api/slack/", // Slack endpoints (commands, interactions, options) — Slack-signature-verified inside the handler
];

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Service-token path: actual validation happens in `requireAuth()` inside
  // the route handler. Middleware just lets the request through if a Bearer
  // header is present so it can be checked there with full DB access.
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return NextResponse.next();
  }

  // Session-cookie path
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
