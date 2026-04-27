import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { apiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/users
 *
 * Sprint 1 scope: list active users. Visible to all authenticated users —
 * the team is 40 people and the directory is internal. Tightening to
 * role-scoped visibility lands when (and if) we have multi-tenant needs.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { data, error } = await db()
    .from("users")
    .select("id, email, name, role, slack_handle, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return apiError("internal_error", error.message);
  return NextResponse.json({ users: data ?? [] });
}
