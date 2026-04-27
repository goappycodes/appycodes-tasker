import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard");

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm font-semibold tracking-wide">
              Tasker
            </Link>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted">
              Sprint 2
            </span>
            <nav className="flex items-center gap-3 text-xs">
              <Link href="/dashboard" className="text-muted hover:text-ink">
                Tasks
              </Link>
              <Link href="/dashboard/projects" className="text-muted hover:text-ink">
                Projects
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>
              {session.name} <span className="text-muted/70">· {session.role}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-4 rounded-md border border-warn/40 bg-warn/10 px-4 py-2 text-xs text-warn">
          Sprint 2 — task creation, project management, Slack bot. My Day, Manager Heatmap, Project
          Health land in Sprint 3.
        </div>
        {children}
      </div>
    </div>
  );
}
