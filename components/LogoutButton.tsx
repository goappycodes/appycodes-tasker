"use client";

export function LogoutButton() {
  async function handle() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button
      type="button"
      onClick={handle}
      className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-ink"
    >
      Sign out
    </button>
  );
}
