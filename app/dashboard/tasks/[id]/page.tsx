import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/supabase";
import { canEditTask } from "@/lib/permissions";
import type { ProjectRow, TaskEventRow, TaskRow, UserRow } from "@/types/db";
import { TaskStatusPill } from "@/components/TaskStatusPill";
import { TaskDetailEditor } from "@/components/TaskDetailEditor";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const session = (await getSession())!;
  const supabase = db();

  const { data: task, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task) notFound();
  const t = task as TaskRow;

  const [{ data: project }, { data: events }, { data: projects }, { data: users }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, code, name, slack_channel_id, lead_user_id")
        .eq("id", t.project_id)
        .maybeSingle(),
      supabase
        .from("task_events")
        .select("id, event_type, from_value, to_value, metadata, actor_id, created_at")
        .eq("task_id", t.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("projects")
        .select("id, code, name, status")
        .eq("status", "active")
        .order("name"),
      supabase.from("users").select("id, name").eq("is_active", true).order("name"),
    ]);

  const eventList = (events ?? []) as TaskEventRow[];
  const actorIds = Array.from(new Set(eventList.map((e) => e.actor_id)));
  const { data: actors } = actorIds.length
    ? await supabase.from("users").select("id, name").in("id", actorIds)
    : { data: [] as Array<Pick<UserRow, "id" | "name">> };
  const actorById = new Map((actors ?? []).map((a) => [a.id, a]));

  const editAllowed = canEditTask({
    user: { id: session.userId, role: session.role },
    task: { creator_id: t.creator_id, assignee_id: t.assignee_id },
    projectLeadId: (project as { lead_user_id?: string } | null)?.lead_user_id ?? null,
  });

  return (
    <main>
      <div className="mb-3 text-xs text-muted">
        <Link href="/dashboard" className="hover:text-ink">
          ← Back to dashboard
        </Link>
      </div>

      <header className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-muted">{t.id}</p>
            <h1 className="mt-1 break-words text-xl font-semibold">{t.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {(project as Pick<ProjectRow, "code" | "name"> | null)
                ? `${(project as { code: string }).code} · ${(project as { name: string }).name}`
                : "(no project)"}
            </p>
          </div>
          <TaskStatusPill status={t.status} />
        </div>

        {!editAllowed && (
          <div className="mt-4 rounded-md border border-border bg-bg/40 px-3 py-2 text-[11px] text-muted">
            Read-only — only the assignee, creator, project lead, or a manager can edit this task.
          </div>
        )}
      </header>

      <section className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-border bg-surface p-5">
          <TaskDetailEditor
            task={{
              id: t.id,
              title: t.title,
              description: t.description,
              status: t.status,
              priority: t.priority,
              story_points: t.story_points,
              assignee_id: t.assignee_id,
              project_id: t.project_id,
              due_date: t.due_date,
              blocker_reason: t.blocker_reason,
            }}
            projects={(projects ?? []).map((p) => ({
              id: p.id as string,
              code: p.code as string,
              name: p.name as string,
            }))}
            users={(users ?? []).map((u) => ({ id: u.id as string, name: u.name as string }))}
            canEdit={editAllowed}
          />
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-2 text-xs uppercase tracking-wider text-muted">
              Recent activity
            </div>
            <ul className="divide-y divide-border text-sm">
              {eventList.length === 0 && <li className="px-4 py-3 text-muted">No events yet.</li>}
              {eventList.slice(0, 8).map((e) => (
                <li key={e.id} className="px-4 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[11px] text-accent">{e.event_type}</span>
                    <span className="text-[10px] text-muted">
                      {new Date(e.created_at).toUTCString().slice(5, 22)}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted">
                    by {actorById.get(e.actor_id)?.name ?? e.actor_id.slice(0, 8)}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {(project as Pick<ProjectRow, "slack_channel_id"> | null)?.slack_channel_id && (
            <a
              href={`slack://channel?team=&id=${(project as { slack_channel_id: string }).slack_channel_id}`}
              className="block rounded-lg border border-border bg-bg/60 p-4 text-xs text-muted hover:text-ink"
            >
              <div className="text-[10px] uppercase tracking-wider">Discussion in Slack</div>
              <div className="mt-1 font-mono text-[11px] text-accent">
                #{(project as { slack_channel_id: string }).slack_channel_id}
              </div>
            </a>
          )}
        </aside>
      </section>
    </main>
  );
}
