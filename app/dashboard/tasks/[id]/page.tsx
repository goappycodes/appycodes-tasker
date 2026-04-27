import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";
import type { ProjectRow, TaskEventRow, TaskRow, UserRow } from "@/types/db";
import { TaskStatusPill } from "@/components/TaskStatusPill";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const supabase = db();

  const { data: task, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task) notFound();
  const t = task as TaskRow;

  const [{ data: project }, { data: events }, { data: assignee }, { data: creator }] =
    await Promise.all([
      supabase.from("projects").select("id, name, slug").eq("id", t.project_id).maybeSingle(),
      supabase
        .from("task_events")
        .select("id, event_type, from_value, to_value, metadata, actor_id, created_at")
        .eq("task_id", t.id)
        .order("created_at", { ascending: false })
        .limit(50),
      t.assignee_id
        ? supabase.from("users").select("id, name, email").eq("id", t.assignee_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("users").select("id, name, email").eq("id", t.creator_id).maybeSingle(),
    ]);

  const eventList = (events ?? []) as TaskEventRow[];
  const actorIds = Array.from(new Set(eventList.map((e) => e.actor_id)));
  const { data: actors } = actorIds.length
    ? await supabase.from("users").select("id, name").in("id", actorIds)
    : { data: [] as Array<Pick<UserRow, "id" | "name">> };
  const actorById = new Map((actors ?? []).map((a) => [a.id, a]));

  return (
    <main>
      <div className="mb-3 text-xs text-muted">
        <Link href="/dashboard" className="hover:text-ink">
          ← Back to dashboard
        </Link>
      </div>

      <header className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-mono text-xs text-muted">{t.id}</p>
            <h1 className="mt-1 text-xl font-semibold">{t.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {(project as Pick<ProjectRow, "name"> | null)?.name ?? "(no project)"}
            </p>
          </div>
          <TaskStatusPill status={t.status} />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
          <Field label="Priority" value={t.priority} />
          <Field label="Points" value={String(t.story_points)} />
          <Field label="Due" value={t.due_date ?? "—"} />
          <Field label="Updated" value={new Date(t.updated_at).toISOString().slice(0, 10)} />
          <Field label="Creator" value={creator?.name ?? "—"} />
          <Field label="Assignee" value={(assignee as { name?: string } | null)?.name ?? "—"} />
          <Field label="Created" value={new Date(t.created_at).toISOString().slice(0, 10)} />
          <Field label="Project ID" value={t.project_id} mono />
        </dl>

        {t.description && (
          <div className="mt-4 whitespace-pre-wrap rounded-md border border-border bg-bg p-3 text-sm text-ink">
            {t.description}
          </div>
        )}
      </header>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-2 text-xs uppercase tracking-wider text-muted">
            Raw API response
          </div>
          <pre className="overflow-x-auto px-4 py-3 text-[11px] leading-relaxed text-muted">
            {JSON.stringify(t, null, 2)}
          </pre>
        </div>

        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-2 text-xs uppercase tracking-wider text-muted">
            Recent task_events
          </div>
          <ul className="divide-y divide-border text-sm">
            {eventList.length === 0 && <li className="px-4 py-3 text-muted">No events yet.</li>}
            {eventList.map((e) => (
              <li key={e.id} className="px-4 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs text-accent">{e.event_type}</span>
                  <span className="text-[10px] text-muted">
                    {new Date(e.created_at).toISOString().replace("T", " ").slice(0, 19)}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  by {actorById.get(e.actor_id)?.name ?? e.actor_id.slice(0, 8)}
                </div>
                <pre className="mt-1 overflow-x-auto rounded bg-bg/60 px-2 py-1 text-[11px] text-muted">
                  {JSON.stringify({ from: e.from_value, to: e.to_value }, null, 0)}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className={`mt-0.5 text-ink ${mono ? "font-mono text-[11px]" : ""}`}>{value}</dd>
    </div>
  );
}
