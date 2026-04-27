import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/supabase";
import { apiError, fromZod } from "@/lib/errors";
import { updateProjectSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await db()
    .from("projects")
    .select(
      "id, code, slug, name, description, client_name, slack_channel_id, lead_user_id, status, is_active, created_at, updated_at",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) return apiError("internal_error", error.message);
  if (!data) return apiError("not_found", `Project ${params.id} not found.`);
  return NextResponse.json(data);
}

/**
 * PATCH /api/projects/:id
 *
 * Auth: manager+ (Sprint 2 §6).
 * `code` is immutable — omit from updateProjectSchema, server-side enforced.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (!can(auth.role, "project:edit")) {
    return apiError("forbidden", "Only managers and admins can edit projects.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("validation_error", "Invalid JSON body.");
  }

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) return fromZod(parsed.error);
  const input = parsed.data;

  const supabase = db();
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.description !== undefined) update.description = input.description;
  if (input.client_name !== undefined) update.client_name = input.client_name;
  if (input.slack_channel_id !== undefined) update.slack_channel_id = input.slack_channel_id;
  if (input.lead_user_id !== undefined) update.lead_user_id = input.lead_user_id;
  if (input.status !== undefined) {
    update.status = input.status;
    update.is_active = input.status !== "done"; // mirror legacy flag
  }

  const { data: updated, error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") return apiError("not_found", `Project ${params.id} not found.`);
    if (error.code === "23505") {
      return apiError("conflict", "That Slack channel is already linked to another project.");
    }
    logger.error({ err: error }, "project patch failed");
    return apiError("internal_error", error.message);
  }
  return NextResponse.json(updated);
}

/**
 * DELETE /api/projects/:id
 *
 * Auth: admin (Sprint 2 §6). Soft-delete: sets status='done'.
 * 409 if any open tasks remain — returns the blocking IDs.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (!can(auth.role, "task:soft-delete")) {
    return apiError("forbidden", "Only admins can archive projects.");
  }

  const supabase = db();

  // Check for open tasks first
  const { data: openTasks, error: openErr } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("project_id", params.id)
    .in("status", ["todo", "in_progress", "blocked"])
    .limit(50);

  if (openErr) return apiError("internal_error", openErr.message);
  if (openTasks && openTasks.length > 0) {
    return apiError(
      "conflict",
      `Project has ${openTasks.length} open task(s). Close or reassign first.`,
      {
        open_tasks: openTasks,
      },
    );
  }

  const { error } = await supabase
    .from("projects")
    .update({ status: "done", is_active: false })
    .eq("id", params.id);

  if (error) {
    if (error.code === "PGRST116") return apiError("not_found", `Project ${params.id} not found.`);
    logger.error({ err: error }, "project delete failed");
    return apiError("internal_error", error.message);
  }

  return new NextResponse(null, { status: 204 });
}
