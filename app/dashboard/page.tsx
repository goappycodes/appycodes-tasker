import Link from "next/link";
import { getSession } from "@/lib/session";
import { db } from "@/lib/supabase";
import type { ProjectRow, TaskRow, UserRow, TaskStatus } from "@/types/db";
import { TaskStatusPill } from "@/components/TaskStatusPill";
import { CreateTaskModalTrigger } from "@/components/CreateTaskModal";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: Array<{ key: "all" | TaskStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "todo", label: "Todo" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { status?: string; project?: string; mine?: string };
}) {
  const session = (await getSession())!;
  const statusFilter = (searchParams.status as TaskStatus | "all" | undefined) ?? "open";
  const projectFilter = searchParams.project ?? "all";
  const mineOnly = searchParams.mine !== "0";

  const supabase = db();

  let query = supabase
    .from("tasks")
    .select(
      "id, project_id, title, status, priority, story_points, assignee_id, creator_id, due_date, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  if (mineOnly) query = query.eq("assignee_id", session.userId);
  if (projectFilter !== "all") query = query.eq("project_id", projectFilter);
  if (statusFilter !== "all" && statusFilter !== "open") {
    query = query.eq("status", statusFilter);
  } else if (statusFilter === "open" || statusFilter === undefined) {
    query = query.in("status", ["todo", "in_progress", "blocked"]);
  }

  const [{ data: tasks, error: tErr }, { data: projects }, { data: users }] = await Promise.all([
    query,
    supabase
      .from("projects")
      .select("id, code, name, slug, status")
      .eq("status", "active")
      .order("name"),
    supabase.from("users").select("id, name").eq("is_active", true).order("name"),
  ]);

  if (tErr) {
    return <ErrorPanel error={tErr.message} />;
  }

  const projectById = new Map(
    (projects ?? []).map((p: Pick<ProjectRow, "id" | "code" | "name" | "slug" | "status">) => [
      p.id,
      p,
    ]),
  );
  const userById = new Map((users ?? []).map((u: Pick<UserRow, "id" | "name">) => [u.id, u]));

  const projectOpts = (projects ?? []).map((p) => ({
    id: p.id as string,
    code: p.code as string,
    name: p.name as string,
    status: p.status as "active" | "paused" | "done",
  }));

  const userOpts = (users ?? []).map((u) => ({
    id: u.id as string,
    name: u.name as string,
  }));

  return (
    <main>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">My tasks</h1>
          <p className="text-sm text-muted">
            {mineOnly ? "Assigned to you" : "All assignees"} · {STATUS_LABEL(statusFilter)} ·{" "}
            {projectFilter === "all"
              ? "All projects"
              : (projectById.get(projectFilter)?.name ?? "?")}
          </p>
        </div>
        <CreateTaskModalTrigger
          projects={projectOpts}
          users={userOpts}
          currentUser={{ id: session.userId }}
          defaultProjectId={projectFilter !== "all" ? projectFilter : undefined}
        />
      </header>

      <Filters
        statusFilter={statusFilter}
        projectFilter={projectFilter}
        mineOnly={mineOnly}
        projects={projects ?? []}
      />

      {tasks && tasks.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">ID</th>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Pri</th>
                <th className="px-4 py-2 font-medium">Pts</th>
                <th className="px-4 py-2 font-medium">Assignee</th>
                <th className="px-4 py-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {(tasks as TaskRow[]).map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-surface/50">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/dashboard/tasks/${t.id}`} className="text-accent hover:underline">
                      {t.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/tasks/${t.id}`} className="hover:underline">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {projectById.get(t.project_id)?.code ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <TaskStatusPill status={t.status} />
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{t.priority}</td>
                  <td className="px-4 py-2 text-xs">{t.story_points}</td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {t.assignee_id ? (userById.get(t.assignee_id)?.name ?? "—") : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{t.due_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
          No tasks match the current filters.
        </div>
      )}
    </main>
  );
}

function STATUS_LABEL(s: string | undefined) {
  if (!s || s === "open") return "Open";
  return STATUS_OPTIONS.find((o) => o.key === s)?.label ?? "All";
}

function Filters({
  statusFilter,
  projectFilter,
  mineOnly,
  projects,
}: {
  statusFilter: string;
  projectFilter: string;
  mineOnly: boolean;
  projects: Array<Pick<ProjectRow, "id" | "name">>;
}) {
  const baseHref = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = {
      status: statusFilter,
      project: projectFilter,
      mine: mineOnly ? "1" : "0",
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) params.set(k, v);
    return `/dashboard?${params.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1.5">
        <Link
          href={baseHref({ status: "open" })}
          className={pillClass(statusFilter === "open" || statusFilter === undefined)}
        >
          Open
        </Link>
        {STATUS_OPTIONS.map((opt) => (
          <Link
            key={opt.key}
            href={baseHref({ status: String(opt.key) })}
            className={pillClass(statusFilter === opt.key)}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      <form className="flex items-center gap-2 text-xs" action="/dashboard">
        <input type="hidden" name="status" value={statusFilter} />
        <input type="hidden" name="mine" value={mineOnly ? "1" : "0"} />
        <select
          name="project"
          defaultValue={projectFilter}
          className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-ink"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-ink"
        >
          Apply
        </button>
      </form>

      <Link
        href={baseHref({ mine: mineOnly ? "0" : "1" })}
        className={pillClass(mineOnly)}
        title="Toggle: only my tasks"
      >
        {mineOnly ? "My tasks" : "All assignees"}
      </Link>
    </div>
  );
}

function pillClass(active: boolean) {
  return [
    "rounded-md border px-2.5 py-1 text-xs",
    active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-ink",
  ].join(" ");
}

function ErrorPanel({ error }: { error: string }) {
  return (
    <div className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
      Failed to load tasks: {error}
    </div>
  );
}
