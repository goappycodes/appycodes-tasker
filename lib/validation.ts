import { z } from "zod";

export const taskStatusSchema = z.enum(["todo", "in_progress", "blocked", "done"]);
export const taskPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export const userRoleSchema = z.enum(["admin", "manager", "lead", "dev"]);
export const projectStatusSchema = z.enum(["active", "paused", "done"]);

/**
 * Story points: 1, 3, 8 are persisted; 20 is rejected with a custom message
 * (the "break it down" forcing function from the Sprint 1 spec).
 */
export const storyPointsSchema = z
  .number()
  .int()
  .refine((n) => [1, 3, 8, 20].includes(n), {
    message: "Story points must be 1, 3, 8, or 20.",
  })
  .refine((n) => n !== 20, {
    message: "Break this task down — 20 means it is too big.",
  })
  .transform((n) => n as 1 | 3 | 8);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.")
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date." });

const isoDateNotPast = isoDate.refine(
  (s) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(s) >= today;
  },
  { message: "due_date cannot be in the past on create." },
);

// --- task schemas ----------------------------------------------------------
export const createTaskSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().nullable(),
  status: taskStatusSchema.optional().default("todo"),
  priority: taskPrioritySchema.optional().default("P2"),
  story_points: storyPointsSchema.optional().default(3),
  assignee_id: z.string().uuid().optional().nullable(),
  due_date: isoDateNotPast.optional().nullable(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().min(3).max(200).optional(),
    description: z.string().max(2000).optional().nullable(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    story_points: storyPointsSchema.optional(),
    assignee_id: z.string().uuid().optional().nullable(),
    project_id: z.string().uuid().optional(),
    // PATCH allows past dates — retroactive correction per spec.
    due_date: isoDate.optional().nullable(),
    blocker_reason: z.string().max(1000).optional().nullable(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, { message: "No fields to update." });

export const taskFilterSchema = z.object({
  assignee: z.string().uuid().optional(),
  project: z.string().uuid().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueBefore: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

// --- project schemas -------------------------------------------------------
export const projectCodeSchema = z
  .string()
  .regex(/^[A-Z]{2,6}$/, "Code must be 2–6 uppercase letters (A-Z).");

export const createProjectSchema = z.object({
  code: projectCodeSchema,
  name: z.string().min(3).max(80),
  description: z.string().max(2000).optional().nullable(),
  client_name: z.string().max(120).optional().nullable(),
  slack_channel_id: z
    .string()
    .regex(/^[CG][A-Z0-9]{7,11}$/, "Slack channel ID must start with C/G and be 8–12 chars.")
    .optional()
    .nullable(),
  status: projectStatusSchema.optional().default("active"),
  lead_user_id: z.string().uuid().optional().nullable(),
});

export const updateProjectSchema = z
  .object({
    name: z.string().min(3).max(80).optional(),
    description: z.string().max(2000).optional().nullable(),
    client_name: z.string().max(120).optional().nullable(),
    slack_channel_id: z
      .string()
      .regex(/^[CG][A-Z0-9]{7,11}$/, "Slack channel ID must start with C/G and be 8–12 chars.")
      .optional()
      .nullable(),
    status: projectStatusSchema.optional(),
    lead_user_id: z.string().uuid().optional().nullable(),
    // `code` is intentionally omitted — immutable after creation per spec.
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, { message: "No fields to update." });

// --- user schemas ----------------------------------------------------------
export const updateUserSchema = z
  .object({
    role: userRoleSchema.optional(),
    is_active: z.boolean().optional(),
    capacity_hours_per_day: z.number().min(0).max(24).optional(),
    name: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, { message: "No fields to update." });

// --- notify schema (internal Slack notify endpoint) ------------------------
export const notifySlackSchema = z.object({
  kind: z.enum(["task_assigned", "task_blocked", "task_completed", "task_reassigned"]),
  task_id: z.string().regex(/^T-\d+$/),
  actor_user_id: z.string().uuid(),
  target_user_id: z.string().uuid().optional(),
  previous_assignee_id: z.string().uuid().optional(),
});

/**
 * Status transitions: cannot move from `done` back to `todo` without an
 * explicit "reopen" action (Sprint 3+).
 */
export function validateStatusTransition(from: string, to: string): string | null {
  if (from === "done" && to === "todo") {
    return "Cannot move a done task back to todo. (Reopen lands in Sprint 3.)";
  }
  return null;
}
