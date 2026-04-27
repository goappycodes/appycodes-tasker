import { NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/slack/verify";
import { resolveActingUser, apiCreateTask, apiPatchTask } from "@/lib/slack/bot";
import { openView, postChatMessage, postEphemeral } from "@/lib/slack/client";
import { buildBlockModal, buildDoneModal, buildTaskCreatedConfirmation } from "@/lib/slack/blocks";
import { db } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import type { TaskRow, ProjectRow, UserRow } from "@/types/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface BlockActionPayload {
  type: "block_actions";
  user: { id: string };
  trigger_id: string;
  channel?: { id: string };
  actions: Array<{ action_id: string; value?: string; type: string }>;
}

interface ViewSubmissionPayload {
  type: "view_submission";
  user: { id: string };
  view: {
    callback_id: string;
    private_metadata?: string;
    state: {
      values: Record<
        string,
        Record<
          string,
          {
            value?: string;
            selected_option?: { value: string };
            selected_user?: string;
            selected_date?: string;
          }
        >
      >;
    };
  };
}

type Payload = BlockActionPayload | ViewSubmissionPayload;

/**
 * POST /api/slack/interactions
 *
 * Receives:
 *   - block_actions   (button clicks on Block Kit cards)
 *   - view_submission (modal submits)
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
    logger.warn({ reason: verify.reason }, "slack interaction: signature rejected");
    return new NextResponse("invalid signature", { status: 401 });
  }

  // Slack sends payload as `payload=<urlencoded JSON>` form field.
  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) return new NextResponse("missing payload", { status: 400 });

  let payload: Payload;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return new NextResponse("bad payload", { status: 400 });
  }

  const acting = await resolveActingUser(payload.user.id);
  if (!acting) {
    if (payload.type === "view_submission") {
      return NextResponse.json({
        response_action: "errors",
        errors: { title: "You're not yet a Tasker user." },
      });
    }
    return new NextResponse("", { status: 200 });
  }

  if (payload.type === "block_actions") {
    return handleBlockActions(payload, acting);
  }
  if (payload.type === "view_submission") {
    return handleViewSubmission(payload, acting);
  }
  return new NextResponse("", { status: 200 });
}

// ---------------------------------------------------------------------------
// block_actions
// ---------------------------------------------------------------------------
async function handleBlockActions(p: BlockActionPayload, acting: UserRow) {
  // We expect at most one action per payload (Slack model).
  const action = p.actions[0];
  if (!action) return new NextResponse("", { status: 200 });

  const taskId = action.value ?? "";

  switch (action.action_id) {
    case "view_task":
      // Slack opens the URL itself via the button's `url` prop. Nothing to do.
      return new NextResponse("", { status: 200 });

    case "open_done_modal":
      void openView({ trigger_id: p.trigger_id, view: buildDoneModal(taskId) });
      return new NextResponse("", { status: 200 });

    case "open_block_modal":
      void openView({ trigger_id: p.trigger_id, view: buildBlockModal(taskId) });
      return new NextResponse("", { status: 200 });

    case "unblock_task": {
      const r = await apiPatchTask(acting.slack_user_id ?? "", taskId, {
        status: "todo",
        blocker_reason: null,
      });
      if (!r.ok && p.channel?.id) {
        await postEphemeral({
          channel: p.channel.id,
          user: p.user.id,
          text: `Could not unblock ${taskId}.`,
        });
      }
      return new NextResponse("", { status: 200 });
    }

    case "start_timer":
      // Sprint-4 stub.
      if (p.channel?.id) {
        await postEphemeral({
          channel: p.channel.id,
          user: p.user.id,
          text: "Clockify integration ships in Sprint 4 — for now, start your timer manually with the task ID in the description.",
        });
      }
      return new NextResponse("", { status: 200 });

    default:
      logger.info({ action_id: action.action_id }, "slack: unhandled block_action");
      return new NextResponse("", { status: 200 });
  }
}

// ---------------------------------------------------------------------------
// view_submission
// ---------------------------------------------------------------------------
async function handleViewSubmission(p: ViewSubmissionPayload, acting: UserRow) {
  const cb = p.view.callback_id;

  if (cb === "create_task_modal") return submitCreateTask(p, acting);
  if (cb === "done_task_modal") return submitDoneTask(p, acting);
  if (cb === "block_task_modal") return submitBlockTask(p, acting);

  logger.info({ callback_id: cb }, "slack: unhandled view_submission");
  return new NextResponse("", { status: 200 });
}

function meta<T>(p: ViewSubmissionPayload, fallback: T): T {
  if (!p.view.private_metadata) return fallback;
  try {
    return JSON.parse(p.view.private_metadata) as T;
  } catch {
    return fallback;
  }
}

async function submitCreateTask(p: ViewSubmissionPayload, acting: UserRow) {
  const v = p.view.state.values;
  const title = v.title?.value?.value?.trim() ?? "";
  const description = v.description?.value?.value ?? null;
  const projectId = v.project?.value?.selected_option?.value;
  const assigneeSlackId = v.assignee?.value?.selected_user;
  const points = Number(v.points?.value?.selected_option?.value ?? 3);
  const priority = (v.priority?.value?.selected_option?.value ?? "P2") as "P0" | "P1" | "P2" | "P3";
  const dueDate = v.due_date?.value?.selected_date ?? null;

  if (!title || title.length < 3) {
    return NextResponse.json({
      response_action: "errors",
      errors: { title: "Title must be at least 3 characters." },
    });
  }
  if (!projectId) {
    return NextResponse.json({
      response_action: "errors",
      errors: { project: "Please select a project." },
    });
  }

  // Resolve assignee Slack ID → users.id
  let assigneeId: string | null = null;
  if (assigneeSlackId) {
    const { data } = await db()
      .from("users")
      .select("id")
      .eq("slack_user_id", assigneeSlackId)
      .eq("is_active", true)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({
        response_action: "errors",
        errors: { assignee: "That Slack user isn't a Tasker user yet." },
      });
    }
    assigneeId = data.id as string;
  }

  const r = await apiCreateTask(
    acting.slack_user_id ?? "",
    {
      project_id: projectId,
      title,
      description,
      assignee_id: assigneeId,
      story_points: (points === 1 || points === 3 || points === 8 ? points : 3) as 1 | 3 | 8,
      priority,
      due_date: dueDate,
    },
    { notify: true },
  );

  if (!r.ok) {
    const msg =
      (r.body as { error?: { message?: string } })?.error?.message ?? "Could not create task.";
    return NextResponse.json({
      response_action: "errors",
      errors: { title: msg },
    });
  }

  // Channel confirmation card (non-ephemeral) where the command was invoked.
  const m = meta<{ channel_id?: string }>(p, {});
  if (m.channel_id) {
    await postCreatedConfirmation(r.task, m.channel_id);
  }

  // Returning {} closes the modal cleanly.
  return NextResponse.json({});
}

async function postCreatedConfirmation(task: TaskRow, channelId: string) {
  const supabase = db();
  const [{ data: project }, { data: assignee }, { data: actor }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, code, name, slack_channel_id, lead_user_id")
      .eq("id", task.project_id)
      .maybeSingle<
        Pick<ProjectRow, "id" | "code" | "name" | "slack_channel_id" | "lead_user_id">
      >(),
    task.assignee_id
      ? supabase
          .from("users")
          .select("id, name, slack_user_id")
          .eq("id", task.assignee_id)
          .maybeSingle<Pick<UserRow, "id" | "name" | "slack_user_id">>()
      : Promise.resolve({ data: null }),
    supabase
      .from("users")
      .select("id, name, slack_handle, slack_user_id")
      .eq("id", task.creator_id)
      .maybeSingle<Pick<UserRow, "id" | "name" | "slack_handle" | "slack_user_id">>(),
  ]);
  await postChatMessage({
    channel: channelId,
    text: `Task ${task.id} created`,
    blocks: buildTaskCreatedConfirmation({
      task,
      project: project ?? null,
      actor: actor ?? null,
      target: assignee ?? null,
    }),
  });
}

async function submitDoneTask(p: ViewSubmissionPayload, acting: UserRow) {
  const m = meta<{ task_id?: string }>(p, {});
  const taskId = m.task_id;
  if (!taskId) return NextResponse.json({});
  const v = p.view.state.values;
  const hoursRaw = v.actual_hours?.value?.value;
  const hours = hoursRaw ? Number(hoursRaw) : null;

  const r = await apiPatchTask(acting.slack_user_id ?? "", taskId, { status: "done" });
  if (!r.ok) {
    return NextResponse.json({
      response_action: "errors",
      errors: { actual_hours: "Could not mark done." },
    });
  }

  if (hours !== null && Number.isFinite(hours)) {
    await db()
      .from("task_events")
      .insert({
        task_id: taskId,
        actor_id: acting.id,
        event_type: "status_changed",
        from_value: null,
        to_value: { status: "done", marked_via: "slack" },
        metadata: { actual_hours: hours },
      });
  }

  return NextResponse.json({});
}

async function submitBlockTask(p: ViewSubmissionPayload, acting: UserRow) {
  const m = meta<{ task_id?: string }>(p, {});
  const taskId = m.task_id;
  if (!taskId) return NextResponse.json({});
  const v = p.view.state.values;
  const reason = v.reason?.value?.value?.trim() ?? "";
  if (!reason || reason.length < 3) {
    return NextResponse.json({
      response_action: "errors",
      errors: { reason: "Reason must be at least 3 characters." },
    });
  }

  const r = await apiPatchTask(acting.slack_user_id ?? "", taskId, {
    status: "blocked",
    blocker_reason: reason,
  });
  if (!r.ok) {
    return NextResponse.json({
      response_action: "errors",
      errors: { reason: "Could not block task." },
    });
  }
  return NextResponse.json({});
}
