import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { apiError, fromZod } from "@/lib/errors";
import { createTaskSchema, taskFilterSchema } from "@/lib/validation";
import { recordTaskCreated } from "@/lib/events";
import { logger } from "@/lib/logger";
import { fireNotify } from "@/lib/notify";
import type { TaskRow } from "@/types/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks
 *
 * Filters: assignee, project, status, priority, dueBefore, limit.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const parsed = taskFilterSchema.safeParse({
    assignee: url.searchParams.get("assignee") ?? undefined,
    project: url.searchParams.get("project") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    priority: url.searchParams.get("priority") ?? undefined,
    dueBefore: url.searchParams.get("dueBefore") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return fromZod(parsed.error);

  const f = parsed.data;
  let q = db()
    .from("tasks")
    .select(
      "id, project_id, title, status, priority, story_points, assignee_id, creator_id, due_date, completed_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(f.limit);

  if (f.assignee) q = q.eq("assignee_id", f.assignee);
  if (f.project) q = q.eq("project_id", f.project);
  if (f.status) q = q.eq("status", f.status);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.dueBefore) q = q.lte("due_date", f.dueBefore);

  const { data, error } = await q;
  if (error) return apiError("internal_error", error.message);
  return NextResponse.json({ tasks: data ?? [] });
}

/**
 * POST /api/tasks — any logged-in user can create a task.
 *
 * `notify=true` query param (default) fires a `task_assigned` Slack DM to the
 * assignee post-insert. Set `notify=false` to skip.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const notify = url.searchParams.get("notify") !== "false";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("validation_error", "Invalid JSON body.");
  }

  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) return fromZod(parsed.error);
  const input = parsed.data;

  const supabase = db();

  // Verify project exists and is not archived.
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, status")
    .eq("id", input.project_id)
    .maybeSingle();
  if (projErr) return apiError("internal_error", projErr.message);
  if (!project || project.status === "done") {
    return apiError("validation_error", "Project does not exist or is archived.");
  }

  if (input.assignee_id) {
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

  const { data: created, error: insErr } = await supabase
    .from("tasks")
    .insert({
      project_id: input.project_id,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority,
      story_points: input.story_points,
      assignee_id: input.assignee_id ?? null,
      creator_id: auth.userId,
      due_date: input.due_date ?? null,
    })
    .select("*")
    .single();
  if (insErr || !created) {
    logger.error({ insErr }, "task insert failed");
    return apiError("internal_error", insErr?.message ?? "Failed to create task.");
  }

  try {
    await recordTaskCreated(supabase, { actorId: auth.userId, task: created as TaskRow });
  } catch (err) {
    logger.error({ err }, "task_events write failed for created event");
  }

  if (notify && created.assignee_id && created.assignee_id !== auth.userId) {
    await fireNotify({
      kind: "task_assigned",
      task_id: created.id,
      actor_user_id: auth.userId,
      target_user_id: created.assignee_id,
    });
  }

  return NextResponse.json(created, { status: 201 });
}
