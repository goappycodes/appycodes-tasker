import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  let dbError: string | undefined;

  try {
    // Cheap ping: read one row from a small known table.
    const { error } = await db().from("users").select("id").limit(1);
    dbOk = !error;
    dbError = error?.message;
  } catch (err) {
    dbOk = false;
    dbError = (err as Error).message;
  }

  const e = env();
  const body = {
    status: dbOk ? "ok" : "degraded",
    version: "0.1.0",
    commit: e.COMMIT_SHA,
    db: { ok: dbOk, ...(dbError ? { error: dbError } : {}) },
    elapsed_ms: Date.now() - startedAt,
  };

  if (!dbOk) logger.error({ dbError }, "/api/health DB ping failed");

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
