import { logger } from "@/lib/logger";
import { sendSlackNotification } from "@/lib/slack/notify";
import type { z } from "zod";
import type { notifySlackSchema } from "@/lib/validation";

export type NotifyPayload = z.infer<typeof notifySlackSchema>;

/**
 * Fire-and-forget helper used by API routes when a side-effect Slack DM/post
 * should follow a write (task_assigned, task_blocked, task_completed,
 * task_reassigned).
 *
 * In-process call rather than an HTTP round-trip: the notify endpoint and
 * route handlers both run in the same Next.js deployment, so going over the
 * network here would just add latency. The HTTP `/api/notify/slack` endpoint
 * still exists for the future case where the bot becomes a separate service.
 */
export async function fireNotify(payload: NotifyPayload): Promise<void> {
  try {
    await sendSlackNotification(payload);
  } catch (err) {
    logger.error({ err, payload }, "fireNotify failed");
  }
}
