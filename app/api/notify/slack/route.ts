import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { apiError, fromZod } from "@/lib/errors";
import { notifySlackSchema } from "@/lib/validation";
import { sendSlackNotification } from "@/lib/slack/notify";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/notify/slack
 *
 * Internal endpoint. Only callers with the service token may hit this.
 * Used by:
 *   - the Slack bot itself (out-of-process scenarios after the eventual split)
 *   - any future external automation that wants to fire a Tasker DM
 *
 * In-process callers should use `lib/notify.ts#fireNotify()` directly to skip
 * the HTTP round-trip.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.via !== "service") {
    return apiError("forbidden", "Service token required.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("validation_error", "Invalid JSON body.");
  }

  const parsed = notifySlackSchema.safeParse(body);
  if (!parsed.success) return fromZod(parsed.error);

  try {
    await sendSlackNotification(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "/api/notify/slack send failed");
    return apiError("internal_error", "Could not send Slack notification.");
  }
}
