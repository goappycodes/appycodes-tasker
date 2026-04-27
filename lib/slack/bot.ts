/**
 * Bot-side helpers — resolve the acting user, find a default project for the
 * channel, and call the Tasker API on the user's behalf via the service-token
 * pattern (Sprint 2 §3).
 */
import { db } from "@/lib/supabase";
import type { ProjectRow, UserRow, TaskRow } from "@/types/db";

const API_BASE = () =>
  process.env.TASKER_API_BASE ?? process.env.APP_URL ?? "http://localhost:3000";

/**
 * Look up the AppyCodes user behind a Slack user ID. Falls back to email
 * match if needed. Returns null when the Slack user isn't seeded.
 */
export async function resolveActingUser(slackUserId: string): Promise<UserRow | null> {
  const supabase = db();
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("slack_user_id", slackUserId)
    .eq("is_active", true)
    .maybeSingle<UserRow>();
  return data ?? null;
}

/**
 * Resolve "which project does a /task add belong to?" given the channel where
 * the command was invoked.
 *   1. If channel maps to a project → that project.
 *   2. Otherwise → the Inbox project (special always-active project).
 *   3. If neither is configured, returns the first active project as a last
 *      resort. Bot UI surfaces the dropdown either way so the user can override.
 */
export async function resolveDefaultProject(
  channelId: string | null,
): Promise<{ id: string; code: string; name: string } | null> {
  const supabase = db();

  if (channelId) {
    const { data } = await supabase
      .from("projects")
      .select("id, code, name")
      .eq("slack_channel_id", channelId)
      .eq("status", "active")
      .maybeSingle();
    if (data) return data;
  }

  const { data: inbox } = await supabase
    .from("projects")
    .select("id, code, name")
    .eq("slug", "inbox")
    .eq("status", "active")
    .maybeSingle();
  if (inbox) return inbox;

  const { data: any } = await supabase
    .from("projects")
    .select("id, code, name")
    .eq("status", "active")
    .order("name")
    .limit(1)
    .maybeSingle();
  return any ?? null;
}

export async function listActiveProjects(): Promise<
  Array<Pick<ProjectRow, "id" | "code" | "name">>
> {
  const { data } = await db()
    .from("projects")
    .select("id, code, name")
    .eq("status", "active")
    .order("name");
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Service-token API client — bot calls Tasker's own API as the acting user
// ---------------------------------------------------------------------------
function serviceHeaders(slackUserId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.TASKER_SERVICE_TOKEN ?? ""}`,
    "X-Slack-User-Id": slackUserId,
    "Content-Type": "application/json",
  };
}

export async function apiCreateTask(
  slackUserId: string,
  body: {
    project_id: string;
    title: string;
    description?: string | null;
    assignee_id?: string | null;
    story_points?: 1 | 3 | 8;
    priority?: "P0" | "P1" | "P2" | "P3";
    due_date?: string | null;
  },
  opts?: { notify?: boolean },
): Promise<{ ok: true; task: TaskRow } | { ok: false; status: number; body: unknown }> {
  const url = `${API_BASE()}/api/tasks${opts?.notify === false ? "?notify=false" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: serviceHeaders(slackUserId),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, body: json };
  return { ok: true, task: json as TaskRow };
}

export async function apiPatchTask(
  slackUserId: string,
  taskId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; task: TaskRow } | { ok: false; status: number; body: unknown }> {
  const res = await fetch(`${API_BASE()}/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: serviceHeaders(slackUserId),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, body: json };
  return { ok: true, task: json as TaskRow };
}
