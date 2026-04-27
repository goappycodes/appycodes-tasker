import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/supabase";
import { apiError, fromZod } from "@/lib/errors";
import { createProjectSchema, projectStatusSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";
import type { ProjectStatus } from "@/types/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects
 *
 * Filters: status (default: active). Includes lead_user_id and basic counts.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  // status filter: "all" → no filter, missing or invalid → "active", else → exact match
  const status: ProjectStatus | "all" =
    statusParam === "all"
      ? "all"
      : (() => {
          const parsed = projectStatusSchema.safeParse(statusParam);
          return parsed.success ? parsed.data : "active";
        })();

  let q = db()
    .from("projects")
    .select(
      "id, code, slug, name, description, client_name, slack_channel_id, lead_user_id, status, is_active, created_at",
    )
    .order("name", { ascending: true });

  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return apiError("internal_error", error.message);
  return NextResponse.json({ projects: data ?? [] });
}

/**
 * POST /api/projects
 *
 * Auth: lead+ (also: service-token path with acting user lead+).
 * Per Sprint 2 §6 permissions matrix.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (!can(auth.role, "project:create")) {
    return apiError("forbidden", "Only leads, managers, and admins can create projects.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("validation_error", "Invalid JSON body.");
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) return fromZod(parsed.error);
  const input = parsed.data;

  // slug is auto-derived from code for back-compat (Sprint 1 used slug as
  // the human-readable identifier).
  const slug = input.code.toLowerCase();

  const supabase = db();
  const { data: created, error: insErr } = await supabase
    .from("projects")
    .insert({
      code: input.code,
      slug,
      name: input.name,
      description: input.description ?? null,
      client_name: input.client_name ?? null,
      slack_channel_id: input.slack_channel_id ?? null,
      status: input.status ?? "active",
      is_active: input.status !== "done", // mirror legacy flag
      lead_user_id: input.lead_user_id ?? null,
    })
    .select("*")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      // unique_violation — code or slack_channel_id collision
      const isCode = insErr.message.toLowerCase().includes("code");
      return apiError(
        "conflict",
        isCode
          ? `Project code "${input.code}" already exists.`
          : "A project already uses that Slack channel.",
      );
    }
    logger.error({ err: insErr }, "project insert failed");
    return apiError("internal_error", insErr.message);
  }

  return NextResponse.json(created, { status: 201 });
}
