/**
 * Slack signing-secret verification (Sprint 2 §7.1).
 *
 * Slack signs every webhook with HMAC-SHA256 over `v0:${ts}:${rawBody}`. We
 * recompute and timing-safe-compare. Reject anything older than 5 minutes
 * (replay guard).
 *
 * Uses Web Crypto so it runs unchanged on Node and on the edge.
 */
const REPLAY_WINDOW_SECONDS = 60 * 5;

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Returns `{ ok: true }` only when the signing secret is present, the
 * timestamp is fresh, and the HMAC matches.
 *
 * `rawBody` MUST be the exact body Slack sent (form-encoded for slash
 * commands, JSON for interactions/options). Never re-stringify.
 */
export async function verifySlackRequest(opts: {
  signingSecret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  now?: number; // seconds since epoch — for tests
}): Promise<VerifyResult> {
  const { signingSecret, timestamp, signature, rawBody } = opts;
  if (!signingSecret) return { ok: false, reason: "no_signing_secret_configured" };
  if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad_timestamp" };
  const nowSec = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: "replay_window" };
  }

  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${await hmacSha256Hex(signingSecret, baseString)}`;

  if (!timingSafeEqual(expected, signature)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
