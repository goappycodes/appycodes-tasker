import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { setSessionCookie } from "@/lib/session";
import { db } from "@/lib/supabase";
import type { UserRow } from "@/types/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "tasker_oauth_state";

/**
 * Slack OpenID callback. Exchanges the code, resolves the Slack user, looks
 * them up in `users` (by slack_user_id, then email), and sets the session.
 *
 * Hard rule (T-004 spec): no silent account creation. A Slack user not in the
 * seed table gets a 403.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const slackError = url.searchParams.get("error");

  if (slackError) {
    logger.warn({ slackError }, "slack oauth: user denied or error");
    return redirectLogin(url, "slack_denied");
  }
  if (!code || !stateParam) {
    return redirectLogin(url, "invalid_request");
  }

  const stateRaw = cookies().get(STATE_COOKIE)?.value;
  cookies().delete(STATE_COOKIE);
  if (!stateRaw) {
    return redirectLogin(url, "state_missing");
  }
  let state: { state: string; nonce: string; next: string };
  try {
    state = JSON.parse(stateRaw);
  } catch {
    return redirectLogin(url, "state_invalid");
  }
  if (state.state !== stateParam) {
    return redirectLogin(url, "state_mismatch");
  }

  // Exchange the code for an access token + id_token via Slack's OpenID endpoint.
  const e = env();
  const tokenRes = await fetch("https://slack.com/api/openid.connect.token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: e.SLACK_CLIENT_ID,
      client_secret: e.SLACK_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: e.SLACK_REDIRECT_URI,
    }),
    cache: "no-store",
  });

  const tokenJson = (await tokenRes.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    id_token?: string;
  };
  if (!tokenJson.ok || !tokenJson.access_token) {
    logger.error({ tokenJson }, "slack oauth: token exchange failed");
    return redirectLogin(url, "token_exchange_failed");
  }

  // Resolve the Slack identity via userinfo.
  const userInfoRes = await fetch("https://slack.com/api/openid.connect.userInfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    cache: "no-store",
  });
  const userInfo = (await userInfoRes.json()) as {
    ok?: boolean;
    error?: string;
    sub?: string;
    email?: string;
    name?: string;
    "https://slack.com/user_id"?: string;
    "https://slack.com/team_id"?: string;
  };
  if (userInfo.ok === false || (!userInfo.email && !userInfo["https://slack.com/user_id"])) {
    logger.error({ userInfo }, "slack oauth: userinfo failed");
    return redirectLogin(url, "userinfo_failed");
  }

  const slackUserId = userInfo["https://slack.com/user_id"] ?? userInfo.sub ?? null;
  const email = userInfo.email?.toLowerCase() ?? null;

  // Lookup: slack_user_id first, email fallback. Active users only.
  const supabase = db();
  let user: UserRow | null = null;

  if (slackUserId) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("slack_user_id", slackUserId)
      .eq("is_active", true)
      .maybeSingle();
    if (data) user = data as UserRow;
  }
  if (!user && email) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle();
    if (data) user = data as UserRow;
  }

  if (!user) {
    logger.warn({ slackUserId, email }, "slack oauth: user not in seed table");
    return redirectLogin(url, "not_seeded");
  }

  // Backfill slack_user_id when an email-match found a user without one yet.
  if (slackUserId && !user.slack_user_id) {
    await supabase.from("users").update({ slack_user_id: slackUserId }).eq("id", user.id);
  }

  await setSessionCookie({
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  const redirectTo = safeNext(state.next);
  return NextResponse.redirect(new URL(redirectTo, e.APP_URL));
}

function redirectLogin(req: URL, reason: string) {
  const dest = new URL("/login", `${req.protocol}//${req.host}`);
  dest.searchParams.set("error", reason);
  return NextResponse.redirect(dest);
}

function safeNext(next: string): string {
  // Prevent open redirects: only allow same-origin paths.
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}
