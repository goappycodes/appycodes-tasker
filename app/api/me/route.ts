import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { apiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { data, error } = await db()
    .from("users")
    .select("id, email, name, role, slack_handle, is_active")
    .eq("id", session.userId)
    .maybeSingle();

  if (error) return apiError("internal_error", error.message);
  if (!data || !data.is_active) {
    return apiError("forbidden", "User is no longer active.");
  }
  return NextResponse.json(data);
}
