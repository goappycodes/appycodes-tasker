import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { apiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/users
 *
 * Lists active users. Visible to all authenticated users — the team is 40
 * people and the directory is internal. Tightening to role-scoped visibility
 * lands when (and if) we have multi-tenant needs.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await db()
    .from("users")
    .select("id, email, name, role, slack_handle, slack_user_id, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return apiError("internal_error", error.message);
  return NextResponse.json({ users: data ?? [] });
}
