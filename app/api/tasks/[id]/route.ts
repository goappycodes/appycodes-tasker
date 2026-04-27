import { NextResponse } from "next/server";
import { requireSession, canEditTask } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { apiError, fromZod } from "@/lib/errors";
import { updateTaskSchema, validateStatusTransition } from "@/lib/validation";
import { recordTaskDiff } from "@/lib/events";
import { logger } from "@/lib/logger";
import type { TaskRow } from "@/types/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/:id — task with embedded events and (Sprint-4) time_entries.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

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
 * PATCH /api/tasks/:id — creator, assignee, project lead, or manager+.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

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

  // Look up the project's lead to apply edit-permission rules.
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, lead_user_id, is_active")
    .eq("id", existing.project_id)
    .maybeSingle();
  if (projErr) return apiError("internal_error", projErr.message);

  const allowed = canEditTask({
    user: { id: session.userId, role: session.role },
    task: { creator_id: existing.creator_id, assignee_id: existing.assignee_id },
    projectLeadId: project?.lead_user_id ?? null,
  });
  if (!allowed) {
    return apiError(
      "forbidden",
      "Only the creator, assignee, project lead, or a manager can edit this task.",
    );
  }

  // Status transition rule.
  if (input.status && input.status !== existing.status) {
    const reason = validateStatusTransition(existing.status, input.status);
    if (reason) return apiError("validation_error", reason);
  }

  // If reassigning to a new project, verify it's active.
  if (input.project_id && input.project_id !== existing.project_id) {
    const { data: newProj, error: npErr } = await supabase
      .from("projects")
      .select("id, is_active")
      .eq("id", input.project_id)
      .maybeSingle();
    if (npErr) return apiError("internal_error", npErr.message);
    if (!newProj || !newProj.is_active) {
      return apiError("validation_error", "Target project does not exist or is inactive.");
    }
  }

  // Validate assignee when changed.
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

  const { data: updated, error: updErr } = await supabase
    .from("tasks")
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.story_points !== undefined ? { story_points: input.story_points } : {}),
      ...(input.assignee_id !== undefined ? { assignee_id: input.assignee_id } : {}),
      ...(input.project_id !== undefined ? { project_id: input.project_id } : {}),
      ...(input.due_date !== undefined ? { due_date: input.due_date } : {}),
    })
    .eq("id", params.id)
    .select("*")
    .single();
  if (updErr || !updated) {
    logger.error({ updErr }, "task update failed");
    return apiError("internal_error", updErr?.message ?? "Update failed.");
  }

  try {
    await recordTaskDiff(supabase, {
      actorId: session.userId,
      before: existing as TaskRow,
      after: updated as TaskRow,
    });
  } catch (err) {
    logger.error({ err, taskId: params.id }, "task_events diff write failed");
  }

  return NextResponse.json(updated);
}
