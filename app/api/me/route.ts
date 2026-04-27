import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { apiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await db()
    .from("users")
    .select("id, email, name, role, slack_handle, is_active, capacity_hours_per_day")
    .eq("id", auth.userId)
    .maybeSingle();

  if (error) return apiError("internal_error", error.message);
  if (!data || !data.is_active) {
    return apiError("forbidden", "User is no longer active.");
  }
  return NextResponse.json(data);
}
