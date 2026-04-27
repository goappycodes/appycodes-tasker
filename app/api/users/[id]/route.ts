import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/supabase";
import { apiError, fromZod } from "@/lib/errors";
import { updateUserSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/users/:id
 *
 * Auth: admin (Sprint 2 §6). Updates role, is_active, capacity, name.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (!can(auth.role, "user:edit-role")) {
    return apiError("forbidden", "Only admins can update user fields.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("validation_error", "Invalid JSON body.");
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) return fromZod(parsed.error);
  const input = parsed.data;

  // Guard rail: prevent the last admin from being demoted or deactivated.
  if (input.role !== undefined && input.role !== "admin") {
    const { count } = await db()
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);
    if (count === 1) {
      const { data: target } = await db()
        .from("users")
        .select("role")
        .eq("id", params.id)
        .maybeSingle();
      if (target?.role === "admin") {
        return apiError("conflict", "Cannot demote the last active admin.");
      }
    }
  }

  const { data: updated, error } = await db()
    .from("users")
    .update(input)
    .eq("id", params.id)
    .select("id, email, name, role, is_active, capacity_hours_per_day")
    .single();

  if (error) {
    if (error.code === "PGRST116") return apiError("not_found", `User ${params.id} not found.`);
    logger.error({ err: error }, "user patch failed");
    return apiError("internal_error", error.message);
  }
  return NextResponse.json(updated);
}
