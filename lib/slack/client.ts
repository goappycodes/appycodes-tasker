import { logger } from "@/lib/logger";

const SLACK_API = "https://slack.com/api";

/**
 * Thin wrapper around `chat.postMessage`. Returns void; logs on Slack-reported
 * errors. Never throws — Slack failures should not bubble up and break a write.
 */
export async function postChatMessage(opts: {
  channel: string;
  text: string;
  blocks?: unknown[];
  thread_ts?: string;
}): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;

  try {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: opts.channel,
        text: opts.text,
        blocks: opts.blocks,
        thread_ts: opts.thread_ts,
        unfurl_links: false,
        unfurl_media: false,
      }),
      cache: "no-store",
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (!body.ok) {
      logger.warn({ slackError: body.error, channel: opts.channel }, "chat.postMessage failed");
    }
  } catch (err) {
    logger.error({ err, channel: opts.channel }, "chat.postMessage threw");
  }
}

/**
 * Opens a DM channel with a user. Returns the channel ID, or null if Slack
 * rejects the call. Required before posting to a user via DM.
 */
export async function openImChannel(slackUserId: string): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`${SLACK_API}/conversations.open`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ users: slackUserId }),
      cache: "no-store",
    });
    const body = (await res.json()) as {
      ok: boolean;
      error?: string;
      channel?: { id: string };
    };
    if (!body.ok || !body.channel?.id) {
      logger.warn({ slackError: body.error, slackUserId }, "conversations.open failed");
      return null;
    }
    return body.channel.id;
  } catch (err) {
    logger.error({ err, slackUserId }, "conversations.open threw");
    return null;
  }
}

/**
 * Opens a Slack modal. Used by /task add and edit flows.
 */
export async function openView(opts: { trigger_id: string; view: unknown }): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  try {
    const res = await fetch(`${SLACK_API}/views.open`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(opts),
      cache: "no-store",
    });
    const body = (await res.json()) as { ok: boolean; error?: string; response_metadata?: unknown };
    if (!body.ok) {
      logger.warn(
        { slackError: body.error, response_metadata: body.response_metadata },
        "views.open failed",
      );
    }
  } catch (err) {
    logger.error({ err }, "views.open threw");
  }
}

/**
 * Posts an ephemeral message in a channel (only the invoking user sees it).
 */
export async function postEphemeral(opts: {
  channel: string;
  user: string;
  text: string;
  blocks?: unknown[];
}): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  try {
    const res = await fetch(`${SLACK_API}/chat.postEphemeral`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...opts, unfurl_links: false }),
      cache: "no-store",
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (!body.ok) logger.warn({ slackError: body.error }, "chat.postEphemeral failed");
  } catch (err) {
    logger.error({ err }, "chat.postEphemeral threw");
  }
}
