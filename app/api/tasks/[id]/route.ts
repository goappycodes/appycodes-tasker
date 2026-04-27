import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { canEditTask } from "@/lib/permissions";
import { db } from "@/lib/supabase";
import { apiError, fromZod } from "@/lib/errors";
import { updateTaskSchema, validateStatusTransition } from "@/lib/validation";
import { recordTaskDiff } from "@/lib/events";
import { logger } from "@/lib/logger";
import { fireNotify } from "@/lib/notify";
import type { TaskRow } from "@/types/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/:id — task with embedded events and (Sprint-4) time_entries.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const supabase = db();
  const { data: task, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return apiError("internal_error", error.message);
  if (!task) return apiError("not_found", `Task ${params.id} not found.`);

  const { data: events } = await supabase
    .from("task_events")
    .select("id, event_type, from_value, to_value, metadata, actor_id, created_at")
    .eq("task_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: timeEntries } = await supabase
    .from("time_entries")
    .select("id, started_at, ended_at, duration_seconds, description, user_id, clockify_entry_id")
    .eq("task_id", params.id)
    .order("started_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    task,
    events: events ?? [],
    time_entries: timeEntries ?? [],
  });
}

/**
 * PATCH /api/tasks/:id
 *
 * Creator / assignee / project-lead+ / manager+ can edit. Side effects:
 *   - status → blocked       requires `blocker_reason`; fires task_blocked
 *   - status → done          sets `completed_at`; fires task_completed
 *   - assignee changed       fires task_reassigned to new assignee
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("validation_error", "Invalid JSON body.");
  }

  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) return fromZod(parsed.error);
  const input = parsed.data;

  const supabase = db();
  const { data: existing, error: getErr } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (getErr) return apiError("internal_error", getErr.message);
  if (!existing) return apiError("not_found", `Task ${params.id} not found.`);

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, lead_user_id, status")
    .eq("id", existing.project_id)
    .maybeSingle();
  if (projErr) return apiError("internal_error", projErr.message);

  const allowed = canEditTask({
    user: { id: auth.userId, role: auth.role },
    task: { creator_id: existing.creator_id, assignee_id: existing.assignee_id },
    projectLeadId: project?.lead_user_id ?? null,
  });
  if (!allowed) {
    return apiError("forbidden", "Only the assignee, creator, or project lead can edit this task.");
  }

  if (input.status && input.status !== existing.status) {
    const reason = validateStatusTransition(existing.status, input.status);
    if (reason) return apiError("validation_error", reason);
    if (input.status === "blocked") {
      const blockerReason = input.blocker_reason ?? existing.blocker_reason;
      if (!blockerReason || blockerReason.trim() === "") {
        return apiError(
          "validation_error",
          "blocker_reason is required when moving a task to blocked.",
        );
      }
    }
  }

  if (input.project_id && input.project_id !== existing.project_id) {
    const { data: newProj, error: npErr } = await supabase
      .from("projects")
      .select("id, status")
      .eq("id", input.project_id)
      .maybeSingle();
    if (npErr) return apiError("internal_error", npErr.message);
    if (!newProj || newProj.status === "done") {
      return apiError("validation_error", "Target project does not exist or is archived.");
    }
  }

  if (input.assignee_id && input.assignee_id !== existing.assignee_id) {
    const { data: assignee, error: aErr } = await supabase
      .from("users")
      .select("id, is_active")
      .eq("id", input.assignee_id)
      .maybeSingle();
    if (aErr) return apiError("internal_error", aErr.message);
    if (!assignee || !assignee.is_active) {
      return apiError("validation_error", "Assignee does not exist or is inactive.");
    }
  }

  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.description !== undefined) update.description = input.description;
  if (input.status !== undefined) {
    update.status = input.status;
    if (input.status === "done") update.completed_at = new Date().toISOString();
    if (input.status !== "blocked") update.blocker_reason = null;
  }
  if (input.priority !== undefined) update.priority = input.priority;
  if (input.story_points !== undefined) update.story_points = input.story_points;
  if (input.assignee_id !== undefined) update.assignee_id = input.assignee_id;
  if (input.project_id !== undefined) update.project_id = input.project_id;
  if (input.due_date !== undefined) update.due_date = input.due_date;
  if (input.blocker_reason !== undefined) update.blocker_reason = input.blocker_reason;

  const { data: updated, error: updErr } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();
  if (updErr || !updated) {
    logger.error({ updErr }, "task update failed");
    return apiError("internal_error", updErr?.message ?? "Update failed.");
  }

  try {
    await recordTaskDiff(supabase, {
      actorId: auth.userId,
      before: existing as TaskRow,
      after: updated as TaskRow,
    });
  } catch (err) {
    logger.error({ err, taskId: params.id }, "task_events diff write failed");
  }

  // Side-effect notifications (best-effort; failures are logged but don't fail the request).
  if (input.status === "blocked" && existing.status !== "blocked") {
    await fireNotify({
      kind: "task_blocked",
      task_id: updated.id,
      actor_user_id: auth.userId,
    });
  } else if (input.status === "done" && existing.status !== "done") {
    await fireNotify({
      kind: "task_completed",
      task_id: updated.id,
      actor_user_id: auth.userId,
    });
  }
  if (
    input.assignee_id !== undefined &&
    input.assignee_id !== existing.assignee_id &&
    input.assignee_id &&
    input.assignee_id !== auth.userId
  ) {
    await fireNotify({
      kind: "task_reassigned",
      task_id: updated.id,
      actor_user_id: auth.userId,
      target_user_id: input.assignee_id,
      previous_assignee_id: existing.assignee_id ?? undefined,
    });
  }

  return NextResponse.json(updated);
}
