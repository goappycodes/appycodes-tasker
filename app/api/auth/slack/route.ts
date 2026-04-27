import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "tasker_oauth_state";
const STATE_TTL_SECONDS = 600; // 10 minutes

/**
 * Initiates the Slack OpenID Connect "Sign in with Slack" flow.
 *
 *   GET /api/auth/slack[?next=/dashboard/foo]
 *     → 302 Slack authorize URL
 *
 * Sprint-1 scopes are intentionally minimal: openid, email, profile.
 * Sprint-2 will add chat:write, commands, im:write, channels:read on the bot
 * token via a separate flow — see the risks section of SPRINT_1.md.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/dashboard";

  const state = randomToken();
  const nonce = randomToken();

  cookies().set(STATE_COOKIE, JSON.stringify({ state, nonce, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  const e = env();
  const authorize = new URL("https://slack.com/openid/connect/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "openid email profile");
  authorize.searchParams.set("client_id", e.SLACK_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", e.SLACK_REDIRECT_URI);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);

  return NextResponse.redirect(authorize.toString());
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
