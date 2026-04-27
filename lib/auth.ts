import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/session";
import { getSession } from "@/lib/session";

export type Role = SessionPayload["role"];

const ROLE_RANK: Record<Role, number> = {
  dev: 1,
  lead: 2,
  manager: 3,
  admin: 4,
};

export function isAdmin(role: Role) {
  return role === "admin";
}

export function isManagerOrAbove(role: Role) {
  return ROLE_RANK[role] >= ROLE_RANK.manager;
}

export function isLeadOrAbove(role: Role) {
  return ROLE_RANK[role] >= ROLE_RANK.lead;
}

/**
 * Permission rule from the spec (T-006):
 * "creator, assignee, and lead+ on the project" can edit a task.
 *
 * `projectLeadId` is the project's `lead_user_id` (nullable). `userRole` lets
 * admins/managers bypass project-lead scoping.
 */
export function canEditTask(opts: {
  user: { id: string; role: Role };
  task: { creator_id: string; assignee_id: string | null };
  projectLeadId: string | null;
}): boolean {
  const { user, task, projectLeadId } = opts;
  if (isManagerOrAbove(user.role)) return true;
  if (user.id === task.creator_id) return true;
  if (task.assignee_id && user.id === task.assignee_id) return true;
  if (projectLeadId && user.id === projectLeadId && isLeadOrAbove(user.role)) return true;
  return false;
}

/**
 * Helper for /api/* route handlers — returns either the session or a 401 NextResponse.
 *
 *   const auth = await requireSession();
 *   if (auth instanceof NextResponse) return auth;
 *   const { userId, role } = auth;
 */
export async function requireSession(): Promise<SessionPayload | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Authentication required." } },
      { status: 401 },
    );
  }
  return session;
}
