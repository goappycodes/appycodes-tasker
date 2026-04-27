import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskEventType, TaskRow } from "@/types/db";

interface TaskEventInsert {
  task_id: string;
  actor_id: string;
  event_type: TaskEventType;
  from_value: unknown;
  to_value: unknown;
  metadata?: unknown;
}

/**
 * Diff `before` against `after` and write a `task_events` row per changed
 * field. The mutation helper in /api/tasks routes calls this so callers never
 * write events directly (T-006 spec).
 */
export async function recordTaskDiff(
  client: SupabaseClient,
  opts: {
    actorId: string;
    before: TaskRow;
    after: TaskRow;
  },
): Promise<void> {
  const { before, after, actorId } = opts;
  const events: TaskEventInsert[] = [];

  if (before.status !== after.status) {
    events.push({
      task_id: after.id,
      actor_id: actorId,
      event_type: "status_changed",
      from_value: { status: before.status },
      to_value: { status: after.status },
    });
  }
  if (before.assignee_id !== after.assignee_id) {
    events.push({
      task_id: after.id,
      actor_id: actorId,
      event_type: "assignee_changed",
      from_value: { assignee_id: before.assignee_id },
      to_value: { assignee_id: after.assignee_id },
    });
  }
  if (before.story_points !== after.story_points) {
    events.push({
      task_id: after.id,
      actor_id: actorId,
      event_type: "points_changed",
      from_value: { story_points: before.story_points },
      to_value: { story_points: after.story_points },
    });
  }
  if (before.priority !== after.priority) {
    events.push({
      task_id: after.id,
      actor_id: actorId,
      event_type: "priority_changed",
      from_value: { priority: before.priority },
      to_value: { priority: after.priority },
    });
  }
  if (before.due_date !== after.due_date) {
    events.push({
      task_id: after.id,
      actor_id: actorId,
      event_type: "due_date_changed",
      from_value: { due_date: before.due_date },
      to_value: { due_date: after.due_date },
    });
  }
  if (before.project_id !== after.project_id) {
    events.push({
      task_id: after.id,
      actor_id: actorId,
      event_type: "project_changed",
      from_value: { project_id: before.project_id },
      to_value: { project_id: after.project_id },
    });
  }
  if (before.title !== after.title) {
    events.push({
      task_id: after.id,
      actor_id: actorId,
      event_type: "title_changed",
      from_value: { title: before.title },
      to_value: { title: after.title },
    });
  }
  if (before.description !== after.description) {
    events.push({
      task_id: after.id,
      actor_id: actorId,
      event_type: "description_changed",
      from_value: { description: before.description },
      to_value: { description: after.description },
    });
  }

  if (events.length === 0) return;
  const { error } = await client.from("task_events").insert(events);
  if (error) {
    // Append-only; don't block the response, but surface for logs.
    throw new Error(`task_events insert failed: ${error.message}`);
  }
}

export async function recordTaskCreated(
  client: SupabaseClient,
  opts: { actorId: string; task: TaskRow; metadata?: Record<string, unknown> },
): Promise<void> {
  const { error } = await client.from("task_events").insert({
    task_id: opts.task.id,
    actor_id: opts.actorId,
    event_type: "created",
    from_value: null,
    to_value: {
      title: opts.task.title,
      status: opts.task.status,
      story_points: opts.task.story_points,
      priority: opts.task.priority,
      assignee_id: opts.task.assignee_id,
    },
    metadata: opts.metadata ?? null,
  });
  if (error) {
    throw new Error(`task_events insert failed: ${error.message}`);
  }
}
