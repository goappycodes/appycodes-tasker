export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <div className="rounded-xl border border-border bg-surface p-8">
        <p className="text-xs uppercase tracking-widest text-muted">INTERNAL · APPYCODES</p>
        <h1 className="mt-2 text-3xl font-semibold">Tasker</h1>
        <p className="mt-2 text-sm text-muted">
          Slack is the verb. Web is the noun. Discipline beats features.
        </p>

        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <a
            href="/login"
            className="rounded-md border border-accent bg-accent/10 px-4 py-2 font-medium text-accent hover:bg-accent/20"
          >
            Sign in →
          </a>
          <a
            href="/api/health"
            className="rounded-md border border-border px-4 py-2 text-muted hover:text-ink"
          >
            /api/health
          </a>
        </div>
      </div>
    </main>
  );
}
