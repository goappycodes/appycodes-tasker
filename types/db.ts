// Hand-written DB row types matching db/migrations/0001_initial.sql + 0002_sprint2.sql.
// Replace with `supabase gen types typescript` output once the schema stabilises.

export type UserRole = "admin" | "manager" | "lead" | "dev";
// `Role` mirrors the DB enum 1:1; service-token requests still resolve to a
// real user via `X-Slack-User-Id`, so permissions use the human's role.
export type Role = UserRole;

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "P0" | "P1" | "P2" | "P3";
export type ProjectStatus = "active" | "paused" | "done";
export type TaskEventType =
  | "created"
  | "status_changed"
  | "assignee_changed"
  | "points_changed"
  | "priority_changed"
  | "due_date_changed"
  | "project_changed"
  | "title_changed"
  | "description_changed";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  slack_user_id: string | null;
  slack_handle: string | null;
  clockify_user_id: string | null;
  role: UserRole;
  is_active: boolean;
  capacity_hours_per_day: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: string;
  slug: string;
  code: string;
  name: string;
  description: string | null;
  client_name: string | null;
  slack_channel_id: string | null;
  lead_user_id: string | null;
  status: ProjectStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  story_points: 1 | 3 | 8;
  assignee_id: string | null;
  creator_id: string;
  due_date: string | null;
  completed_at: string | null;
  blocker_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskEventRow {
  id: number;
  task_id: string;
  actor_id: string;
  event_type: TaskEventType;
  from_value: unknown;
  to_value: unknown;
  metadata: unknown;
  created_at: string;
}

export interface TimeEntryRow {
  id: number;
  task_id: string | null;
  user_id: string;
  clockify_entry_id: string | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}
