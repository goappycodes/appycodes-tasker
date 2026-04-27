import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/session";
import { getSession } from "@/lib/session";
import { db } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import type { UserRow } from "@/types/db";

// Re-export the role/permission helpers so existing import sites (`@/lib/auth`)
// don't break. New code should import from `@/lib/permissions` directly.
export {
  isAdmin,
  isLeadOrAbove,
  isManagerOrAbove,
  isAtLeast,
  can,
  canEditTask,
} from "@/lib/permissions";
export type { Role } from "@/types/db";

/**
 * Authenticated context returned to API route handlers. Mirrors `SessionPayload`
 * so existing code keeps working, but adds `via` so handlers know whether the
 * request came from a logged-in browser or the Slack bot's service token.
 */
export interface AuthContext extends SessionPayload {
  via: "session" | "service";
}

/**
 * Cookie-only path. Use this when you specifically want to reject the Slack
 * bot — almost never the right call; prefer `requireAuth()`.
 */
export async function requireSession(): Promise<SessionPayload | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Authentication required." } },
      { status: 401 },
    );
  }
  return session;
}

/**
 * Accepts either:
 *   1. A signed session cookie (logged-in user via Slack OAuth), OR
 *   2. `Authorization: Bearer ${TASKER_SERVICE_TOKEN}` + `X-Slack-User-Id`
 *      header (the Slack bot calling on behalf of a real user).
 *
 * In both cases the returned context has the human user's `role`/`userId`
 * — service-token requests don't bypass permissions, they just authenticate
 * the bot and attribute the action to the human who triggered it.
 */
export async function requireAuth(req: Request): Promise<AuthContext | NextResponse> {
  // 1. Service token path
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    const expected = process.env.TASKER_SERVICE_TOKEN;
    if (expected && timingSafeEqualString(token, expected)) {
      const slackUserId = req.headers.get("x-slack-user-id");
      if (!slackUserId) {
        return NextResponse.json(
          {
            error: {
              code: "unauthorized",
              message: "Service token requires X-Slack-User-Id header.",
            },
          },
          { status: 401 },
        );
      }
      const { data, error } = await db()
        .from("users")
        .select("id, email, name, role, is_active")
        .eq("slack_user_id", slackUserId)
        .maybeSingle();
      if (error) {
        logger.error({ err: error.message }, "service auth: user lookup failed");
        return NextResponse.json(
          { error: { code: "internal_error", message: error.message } },
          { status: 500 },
        );
      }
      if (!data || !data.is_active) {
        return NextResponse.json(
          {
            error: {
              code: "forbidden",
              message: "Acting Slack user is not a Tasker user (or is inactive).",
            },
          },
          { status: 403 },
        );
      }
      const user = data as Pick<UserRow, "id" | "email" | "name" | "role" | "is_active">;
      return {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        via: "service",
      };
    }
    // Bearer present but doesn't match — fall through to session check (could
    // be a stale token; the cookie might still be valid). If neither works,
    // we 401 below.
  }

  // 2. Session cookie path
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Authentication required." } },
      { status: 401 },
    );
  }
  return { ...session, via: "session" };
}

/** Constant-time string compare to avoid leaking the service token via timing. */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
