import { NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/slack/verify";
import { resolveActingUser, resolveDefaultProject, listActiveProjects } from "@/lib/slack/bot";
import {
  buildCreateTaskModal,
  buildDoneModal,
  buildBlockModal,
  buildMyTaskCard,
  buildTaskDetailCard,
} from "@/lib/slack/blocks";
import { openView } from "@/lib/slack/client";
import { db } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { fireNotify } from "@/lib/notify";
import type { TaskRow } from "@/types/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/slack/commands
 *
 * Single endpoint for `/task add|mine|next|show|done|block` (one command
 * registered with Slack, subcommand parsed from `text`).
 *
 * Slack expects HTTP 200 within 3s (Sprint 2 §7.2). We ack immediately and
 * either render a synchronous ephemeral response or kick off async work.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  const verify = await verifySlackRequest({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    timestamp: req.headers.get("x-slack-request-timestamp"),
    signature: req.headers.get("x-slack-signature"),
    rawBody,
  });
  if (!verify.ok) {
    logger.warn({ reason: verify.reason }, "slack command: signature rejected");
    return new NextResponse("invalid signature", { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const slackUserId = params.get("user_id") ?? "";
  const channelId = params.get("channel_id");
  const triggerId = params.get("trigger_id") ?? "";
  const text = (params.get("text") ?? "").trim();

  // First word = subcommand; rest = args.
  const [subcommand = "mine", ...args] = text.length === 0 ? ["mine"] : text.split(/\s+/);

  // Acting user — required for every subcommand. Don't 401 to Slack; respond
  // with an ephemeral message instead so the user sees what's wrong.
  const actingUser = await resolveActingUser(slackUserId);
  if (!actingUser) {
    return slackEphemeral("You're not yet a Tasker user. Ask an admin to add you, then try again.");
  }

  switch (subcommand) {
    case "add":
      return handleAdd({ slackUserId, channelId, triggerId });
    case "mine":
      return handleMine(actingUser);
    case "next":
      return handleNext(actingUser);
    case "show":
      return handleShow(args[0]);
    case "done":
      return handleDone({ slackUserId, triggerId, taskId: args[0] });
    case "block":
      return handleBlock({
        slackUserId,
        triggerId,
        taskId: args[0],
        reason: args.slice(1).join(" "),
      });
    default:
      return slackEphemeral(
        `Unknown subcommand: \`${subcommand}\`. Try: \`/task [add|mine|next|show|done|block]\`.`,
      );
  }
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleAdd(opts: {
  slackUserId: string;
  channelId: string | null;
  triggerId: string;
}) {
  const [defaultProject, allProjects] = await Promise.all([
    resolveDefaultProject(opts.channelId),
    listActiveProjects(),
  ]);

  const view = buildCreateTaskModal({
    channelId: opts.channelId,
    projectOptions: allProjects,
    defaultProjectId: defaultProject?.id,
  });

  // Fire-and-forget the modal open. Ack with 200 immediately so we beat the
  // 3-second budget.
  void openView({ trigger_id: opts.triggerId, view });
  return new NextResponse("", { status: 200 });
}

async function handleMine(user: { id: string }) {
  const supabase = db();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("assignee_id", user.id)
    .in("status", ["todo", "in_progress", "blocked"])
    .order("priority", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(11);

  if (!tasks || tasks.length === 0) {
    return slackEphemeral("All clear — nothing assigned to you. `/task add` to create one.");
  }

  const visible = (tasks as TaskRow[]).slice(0, 10);
  const overflow = tasks.length > 10;

  const projectIds = Array.from(new Set(visible.map((t) => t.project_id)));
  const { data: projects } = await supabase
    .from("projects")
    .select("id, code")
    .in("id", projectIds);
  const codeById = new Map((projects ?? []).map((p) => [p.id, p.code as string]));

  const blocks = visible.flatMap((t) => buildMyTaskCard(t, codeById.get(t.project_id) ?? null));
  if (overflow) {
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `… and more — open <${appUrl()}/dashboard|Tasker> to see all.` },
      ],
    });
  }

  return slackEphemeralBlocks(`Your open tasks (${tasks.length})`, blocks);
}

async function handleNext(user: { id: string }) {
  const { data } = await db()
    .from("tasks")
    .select("*")
    .eq("assignee_id", user.id)
    .in("status", ["todo", "in_progress", "blocked"])
    .order("priority", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle<TaskRow>();
  if (!data) {
    return slackEphemeral("All clear — nothing assigned to you. `/task add` to create one.");
  }
  const { data: project } = await db()
    .from("projects")
    .select("id, code, name")
    .eq("id", data.project_id)
    .maybeSingle();
  const blocks = buildTaskDetailCard(data, project ?? null, []);
  return slackEphemeralBlocks(`Top of your queue: ${data.id}`, blocks);
}

async function handleShow(taskId: string | undefined) {
  if (!taskId) return slackEphemeral("Usage: `/task show T-123`.");
  const { data: task } = await db()
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle<TaskRow>();
  if (!task) return slackEphemeral(`${taskId} not found — check the ID.`);

  const [{ data: project }, { data: events }] = await Promise.all([
    db().from("projects").select("id, code, name").eq("id", task.project_id).maybeSingle(),
    db()
      .from("task_events")
      .select("event_type, created_at")
      .eq("task_id", task.id)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const blocks = buildTaskDetailCard(task, project ?? null, events ?? []);
  return slackEphemeralBlocks(`${task.id}`, blocks);
}

async function handleDone(opts: {
  slackUserId: string;
  triggerId: string;
  taskId: string | undefined;
}) {
  if (!opts.taskId) return slackEphemeral("Usage: `/task done T-123`.");
  const { data: task } = await db().from("tasks").select("id").eq("id", opts.taskId).maybeSingle();
  if (!task) return slackEphemeral(`${opts.taskId} not found — check the ID.`);

  void openView({ trigger_id: opts.triggerId, view: buildDoneModal(opts.taskId) });
  return new NextResponse("", { status: 200 });
}

async function handleBlock(opts: {
  slackUserId: string;
  triggerId: string;
  taskId: string | undefined;
  reason: string;
}) {
  if (!opts.taskId) {
    return slackEphemeral("Usage: `/task block T-123 <reason>` — reason required.");
  }
  const { data: task } = await db().from("tasks").select("id").eq("id", opts.taskId).maybeSingle();
  if (!task) return slackEphemeral(`${opts.taskId} not found — check the ID.`);

  // If the user already provided a reason inline, do the PATCH directly.
  if (opts.reason && opts.reason.trim().length >= 3) {
    const { apiPatchTask } = await import("@/lib/slack/bot");
    const r = await apiPatchTask(opts.slackUserId, opts.taskId, {
      status: "blocked",
      blocker_reason: opts.reason,
    });
    if (!r.ok) {
      return slackEphemeral(
        `Could not block: ${(r.body as { error?: { message?: string } })?.error?.message ?? "unknown error"}`,
      );
    }
    void fireNotify({
      kind: "task_blocked",
      task_id: opts.taskId,
      actor_user_id: r.task.creator_id, // attribution overwritten upstream
    });
    return slackEphemeral(`🚧 ${opts.taskId} blocked.`);
  }

  void openView({ trigger_id: opts.triggerId, view: buildBlockModal(opts.taskId) });
  return new NextResponse("", { status: 200 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function slackEphemeral(text: string) {
  return NextResponse.json({ response_type: "ephemeral", text });
}

function slackEphemeralBlocks(fallbackText: string, blocks: unknown[]) {
  return NextResponse.json({ response_type: "ephemeral", text: fallbackText, blocks });
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}
