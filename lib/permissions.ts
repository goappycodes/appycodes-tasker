import type { Role } from "@/types/db";

/**
 * Single source of truth for who can do what (Sprint 2 §6).
 *
 * Imported by both API middleware and UI components. If a `can()` check ever
 * disagrees between server and browser, that's the bug — fix it here, not by
 * patching the call site.
 */

export type PermissionAction =
  // tasks
  | "task:create"
  | "task:edit-own-or-assigned"
  | "task:edit-any-in-project"
  | "task:reassign"
  | "task:soft-delete"
  | "task:mark-done-as-assignee"
  // projects
  | "project:create"
  | "project:edit"
  | "project:archive"
  // users
  | "user:edit-role";

interface Ctx {
  // Provide whatever signals the action needs. Unused fields are ignored.
  isCreator?: boolean;
  isAssignee?: boolean;
  isProjectLead?: boolean;
}

const ROLE_RANK: Record<Role, number> = {
  dev: 1,
  lead: 2,
  manager: 3,
  admin: 4,
};

export function isAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export function isAdmin(role: Role) {
  return role === "admin";
}
export function isManagerOrAbove(role: Role) {
  return isAtLeast(role, "manager");
}
export function isLeadOrAbove(role: Role) {
  return isAtLeast(role, "lead");
}

/**
 * Bot/service traffic carries the `X-Slack-User-Id` so we can attribute events
 * to the real human. The role on the JWT is "service"; that path always passes
 * permission checks because the bot's UI has its own gating.
 */
export function can(role: Role, action: PermissionAction, ctx: Ctx = {}): boolean {
  switch (action) {
    case "task:create":
      // Any logged-in user can create tasks (per Sprint 1 spec).
      return true;

    case "task:mark-done-as-assignee":
      return ctx.isAssignee === true;

    case "task:edit-own-or-assigned":
      // Any role can edit if creator or assignee. Lead+ on the project also.
      if (ctx.isCreator || ctx.isAssignee) return true;
      if (ctx.isProjectLead && isLeadOrAbove(role)) return true;
      if (isManagerOrAbove(role)) return true;
      return false;

    case "task:edit-any-in-project":
      // Lead on this project, or manager/admin globally.
      if (ctx.isProjectLead && isLeadOrAbove(role)) return true;
      return isManagerOrAbove(role);

    case "task:reassign":
      // Same as edit-any-in-project: only lead+ or manager+.
      if (ctx.isProjectLead && isLeadOrAbove(role)) return true;
      return isManagerOrAbove(role);

    case "task:soft-delete":
      return isAdmin(role);

    case "project:create":
      return isLeadOrAbove(role);

    case "project:edit":
    case "project:archive":
      return isManagerOrAbove(role);

    case "user:edit-role":
      return isAdmin(role);
  }
}

/**
 * Convenience used by the existing /api/tasks/[id] PATCH handler. Mirrors the
 * Sprint 1 default rule: creator OR assignee OR project lead+ OR manager+.
 */
export function canEditTask(opts: {
  user: { id: string; role: Role };
  task: { creator_id: string; assignee_id: string | null };
  projectLeadId: string | null;
}): boolean {
  const { user, task, projectLeadId } = opts;
  return can(user.role, "task:edit-own-or-assigned", {
    isCreator: user.id === task.creator_id,
    isAssignee: !!task.assignee_id && user.id === task.assignee_id,
    isProjectLead: !!projectLeadId && user.id === projectLeadId,
  });
}
