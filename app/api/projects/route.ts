import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { apiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { data, error } = await db()
    .from("projects")
    .select("id, slug, name, description, slack_channel_id, lead_user_id, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return apiError("internal_error", error.message);
  return NextResponse.json({ projects: data ?? [] });
}
