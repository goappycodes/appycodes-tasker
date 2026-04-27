import { z } from "zod";

export const taskStatusSchema = z.enum(["todo", "in_progress", "blocked", "done"]);
export const taskPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export const userRoleSchema = z.enum(["admin", "manager", "lead", "dev"]);

/**
 * Story points: 1, 3, 8 are persisted; 20 is rejected with a custom message
 * (the "break it down" forcing function from the spec).
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

export const createTaskSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).optional().nullable(),
  status: taskStatusSchema.optional().default("todo"),
  priority: taskPrioritySchema.optional().default("P2"),
  story_points: storyPointsSchema.optional().default(3),
  assignee_id: z.string().uuid().optional().nullable(),
  due_date: isoDateNotPast.optional().nullable(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(10_000).optional().nullable(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    story_points: storyPointsSchema.optional(),
    assignee_id: z.string().uuid().optional().nullable(),
    project_id: z.string().uuid().optional(),
    // PATCH allows past dates — retroactive correction per spec.
    due_date: isoDate.optional().nullable(),
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

/**
 * Status transitions (T-006 spec): cannot move from `done` back to `todo`
 * without an explicit "reopen" action (which lands in Sprint 3+). All other
 * transitions are allowed.
 */
export function validateStatusTransition(from: string, to: string): string | null {
  if (from === "done" && to === "todo") {
    return "Cannot move a done task back to todo. (Reopen lands in Sprint 3.)";
  }
  return null;
}
