import Link from "next/link";
import { getSession } from "@/lib/session";
import { db } from "@/lib/supabase";
import { can, isManagerOrAbove } from "@/lib/permissions";
import type { ProjectRow, UserRow, ProjectStatus } from "@/types/db";
import { CreateProjectModalTrigger } from "@/components/CreateProjectModal";
import { ProjectActionsMenu } from "@/components/ProjectActionsMenu";

export const dynamic = "force-dynamic";

const STATUS_TABS: Array<{ key: "all" | ProjectStatus; label: string; color: string }> = [
  { key: "all", label: "All", color: "" },
  { key: "active", label: "Active", color: "border-success/40 bg-success/10 text-success" },
  { key: "paused", label: "Paused", color: "border-warn/40 bg-warn/10 text-warn" },
  { key: "done", label: "Archived", color: "border-border text-muted" },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const session = (await getSession())!;
  const status = (searchParams.status as ProjectStatus | "all" | undefined) ?? "all";
  const q = searchParams.q?.trim() ?? "";

  const supabase = db();

  let query = supabase
    .from("projects")
    .select(
      "id, code, slug, name, description, client_name, slack_channel_id, lead_user_id, status, created_at",
    )
    .order("name", { ascending: true });

  if (status !== "all") query = query.eq("status", status);
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%,client_name.ilike.%${q}%`);

  const [{ data: projects }, { data: counts }, { data: users }] = await Promise.all([
    query,
    supabase.from("tasks").select("project_id, status"),
    supabase.from("users").select("id, name, role").eq("is_active", true).order("name"),
  ]);

  const userById = new Map(
    (users ?? []).map((u: Pick<UserRow, "id" | "name" | "role">) => [u.id, u]),
  );

  // Aggregate task counts per project (open vs done)
  const tasksByProject = new Map<string, { open: number; done: number }>();
  for (const row of (counts ?? []) as Array<{ project_id: string; status: string }>) {
    const r = tasksByProject.get(row.project_id) ?? { open: 0, done: 0 };
    if (row.status === "done") r.done += 1;
    else r.open += 1;
    tasksByProject.set(row.project_id, r);
  }

  const summary = (() => {
    const all = (projects ?? []) as ProjectRow[];
    return {
      active: all.filter((p) => p.status === "active").length,
      paused: all.filter((p) => p.status === "paused").length,
      done: all.filter((p) => p.status === "done").length,
    };
  })();

  const canCreate = can(session.role, "project:create");
  const canEdit = can(session.role, "project:edit");
  const canArchive = isManagerOrAbove(session.role) && session.role === "admin";

  const userOptions = (users ?? []).map((u: Pick<UserRow, "id" | "name" | "role">) => ({
    id: u.id,
    name: u.name,
    role: u.role,
  }));

  return (
    <main>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-muted">
            {summary.active} active · {summary.paused} paused · {summary.done} archived
          </p>
        </div>
        {canCreate && <CreateProjectModalTrigger users={userOptions} />}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form className="flex items-center gap-2" action="/dashboard/projects">
          <input type="hidden" name="status" value={status} />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by code, name, or client"
            className="w-64 rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-ink"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (t.key !== "all") params.set("status", t.key);
            const href = `/dashboard/projects${params.toString() ? `?${params}` : ""}`;
            const active = status === t.key || (status === undefined && t.key === "all");
            return (
              <Link
                key={t.key}
                href={href}
                className={`rounded-md border px-2.5 py-1 text-xs ${active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-ink"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Tasks</th>
              <th className="px-4 py-2 font-medium">Lead</th>
              <th className="px-4 py-2 font-medium">Slack</th>
              <th className="w-12 px-2 py-2 font-medium" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {(projects ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">
                  No projects match the current filters.
                </td>
              </tr>
            )}
            {((projects ?? []) as ProjectRow[]).map((p) => {
              const counts = tasksByProject.get(p.id) ?? { open: 0, done: 0 };
              const lead = p.lead_user_id ? userById.get(p.lead_user_id) : null;
              const statusStyle = STATUS_TABS.find((t) => t.key === p.status)?.color ?? "";
              return (
                <tr key={p.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-4 py-2">
                    <span className="rounded bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent">
                      {p.code}
                    </span>
                  </td>
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2 text-xs text-muted">{p.client_name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${statusStyle}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {counts.open} open · {counts.done} done
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{lead?.name ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-muted">
                    {p.slack_channel_id ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <ProjectActionsMenu
                      projectId={p.id}
                      status={p.status}
                      slackChannelId={p.slack_channel_id}
                      canEdit={canEdit}
                      canArchive={canArchive}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
