import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service-role key.
 *
 * **Never** import this from client components. It bypasses RLS and gives full
 * DB access. The browser must reach the DB only through `/api/*` routes.
 */
export function db(): SupabaseClient {
  if (cached) return cached;
  const e = env();
  cached = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-tasker-server": "1" } },
  });
  return cached;
}
