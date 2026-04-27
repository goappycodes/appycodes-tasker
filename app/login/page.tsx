import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  not_seeded:
    "Your Slack account isn't in the Tasker seed list yet. Ask an admin to add you, then try again.",
  state_missing: "Login session expired. Please try again.",
  state_invalid: "Invalid login state. Please try again.",
  state_mismatch: "Invalid login state (mismatch). Please try again.",
  invalid_request: "Slack returned an invalid response. Please try again.",
  slack_denied: "You declined the Slack permission request.",
  token_exchange_failed: "Could not complete Slack sign-in. Please try again.",
  userinfo_failed: "Could not read your Slack profile. Please try again.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const errorCode = searchParams.error;
  const errorMsg = errorCode && ERROR_MESSAGES[errorCode];
  const status = errorCode === "not_seeded" ? 403 : 200;

  const slackHref =
    "/api/auth/slack" + (searchParams.next ? `?next=${encodeURIComponent(searchParams.next)}` : "");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="rounded-xl border border-border bg-surface p-8">
        <p className="text-xs uppercase tracking-widest text-muted">INTERNAL · APPYCODES</p>
        <h1 className="mt-2 text-2xl font-semibold">Tasker</h1>
        <p className="mt-1 text-sm text-muted">Sign in to continue.</p>

        {errorMsg && (
          <div
            role="alert"
            data-status={status}
            className="mt-6 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
          >
            {errorMsg}
          </div>
        )}

        <Link
          href={slackHref}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 font-medium text-white hover:bg-accent/90"
        >
          <SlackMark />
          Sign in with Slack
        </Link>

        <p className="mt-4 text-xs text-muted">
          Only seeded AppyCodes accounts can sign in. New hires must be added by an admin first.
        </p>
      </div>

      <p className="mt-4 text-center text-xs text-muted">Tasker · Sprint 1 · v0.1</p>
    </main>
  );
}

function SlackMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5 15a2 2 0 11-2-2h2v2zm1 0a2 2 0 114 0v5a2 2 0 11-4 0v-5zM9 5a2 2 0 11-2 2h2V5zm0 1a2 2 0 014 0v5a2 2 0 11-4 0V6zm10 4a2 2 0 110 4h-2v-2a2 2 0 012-2zm-1-1V4a2 2 0 114 0v5a2 2 0 11-4 0zm-4 9a2 2 0 110 4v-4zm-1-1a2 2 0 11-4 0v-5a2 2 0 014 0v5z" />
    </svg>
  );
}
