/**
 * Block Kit builders for Tasker. Plain functions returning arrays of blocks.
 * Slack expects strict JSON shapes — these are typed loosely (`unknown[]`)
 * because Slack's schema is too permissive to model fully without pulling in
 * a Slack SDK types dep.
 */
import type { TaskRow, ProjectRow, UserRow } from "@/types/db";

interface NotifyCtx {
  task: TaskRow;
  project: Pick<ProjectRow, "id" | "code" | "name" | "slack_channel_id" | "lead_user_id"> | null;
  actor: Pick<UserRow, "id" | "name" | "slack_handle" | "slack_user_id"> | null;
  target: Pick<UserRow, "id" | "name" | "slack_user_id"> | null;
}

const APP_URL = () => process.env.APP_URL ?? "http://localhost:3000";

function taskUrl(taskId: string) {
  return `${APP_URL()}/dashboard/tasks/${taskId}`;
}

function dueLine(due: string | null): string {
  if (!due) return "no due date";
  const d = new Date(due + "T00:00:00Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const overdue = d < today;
  const fmt = d.toUTCString().slice(0, 16); // "Wed, 04 May 2026"
  return overdue ? `⚠ ${fmt} (overdue)` : fmt;
}

function metaLine(ctx: NotifyCtx): string {
  const proj = ctx.project ? `${ctx.project.code} · ${ctx.project.name}` : "(no project)";
  return `${proj}  ·  ${ctx.task.priority}  ·  ${ctx.task.story_points} pts  ·  Due ${dueLine(ctx.task.due_date)}`;
}

function actorMention(actor: NotifyCtx["actor"]): string {
  if (actor?.slack_user_id) return `<@${actor.slack_user_id}>`;
  return actor?.name ?? "someone";
}

// ---------------------------------------------------------------------------
// DM templates (Sprint 2 §10)
// ---------------------------------------------------------------------------
export function buildAssignedDmBlocks(ctx: NotifyCtx): unknown[] {
  const t = ctx.task;
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📋  *New task assigned to you* by ${actorMention(ctx.actor)}`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${t.id} · ${t.title}*\n${metaLine(ctx)}` },
    },
    ...(t.description ? [{ type: "section", text: { type: "mrkdwn", text: t.description } }] : []),
    {
      type: "actions",
      block_id: `task_actions:${t.id}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "▶ Start timer" },
          action_id: "start_timer",
          value: t.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "View" },
          action_id: "view_task",
          url: taskUrl(t.id),
          value: t.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Block" },
          style: "danger",
          action_id: "open_block_modal",
          value: t.id,
        },
      ],
    },
  ];
}

export function buildReassignedDmBlocks(
  ctx: NotifyCtx & { previousAssignee: Pick<UserRow, "id" | "name" | "slack_handle"> | null },
): unknown[] {
  const t = ctx.task;
  const prev = ctx.previousAssignee?.name ?? "someone else";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔁  *Task reassigned to you* by ${actorMention(ctx.actor)} (was assigned to ${prev})`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${t.id} · ${t.title}*\n${metaLine(ctx)}` },
    },
    {
      type: "actions",
      block_id: `task_actions:${t.id}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View" },
          action_id: "view_task",
          url: taskUrl(t.id),
          value: t.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Block" },
          style: "danger",
          action_id: "open_block_modal",
          value: t.id,
        },
      ],
    },
  ];
}

export function buildBlockedChannelBlocks(ctx: NotifyCtx): unknown[] {
  const t = ctx.task;
  const reason = t.blocker_reason ?? "(no reason given)";
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `🚧  *${t.id} blocked* by ${actorMention(ctx.actor)}` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${t.title}*  ·  ${ctx.project?.name ?? ""}\nReason: ${reason}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View" },
          url: taskUrl(t.id),
          action_id: "view_task",
          value: t.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Mark unblocked" },
          action_id: "unblock_task",
          value: t.id,
        },
      ],
    },
  ];
}

export function buildCompletedChannelBlocks(ctx: NotifyCtx): unknown[] {
  const t = ctx.task;
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✓  *${t.id} marked done* by ${actorMention(ctx.actor)}\n_${t.title}_`,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Confirmation card (channel) when /task add succeeds
// ---------------------------------------------------------------------------
export function buildTaskCreatedConfirmation(ctx: NotifyCtx): unknown[] {
  const t = ctx.task;
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `✓  *Task ${t.id} created*` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${t.title}*\n${metaLine(ctx)}` },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ctx.target?.slack_user_id
            ? `Assigned to <@${ctx.target.slack_user_id}> · DM sent`
            : "Unassigned",
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open in app" },
          url: taskUrl(t.id),
          action_id: "view_task",
          value: t.id,
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// /task mine card
// ---------------------------------------------------------------------------
export function buildMyTaskCard(t: TaskRow, projectCode: string | null): unknown[] {
  const overdue =
    t.due_date && new Date(t.due_date) < new Date(new Date().toDateString()) && t.status !== "done";
  const due = t.due_date
    ? `${overdue ? "⚠ " : ""}Due ${t.due_date}${overdue ? " (overdue)" : ""}`
    : "no due date";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${t.id} · ${t.title}*\n${projectCode ? projectCode + "  ·  " : ""}${t.priority}  ·  ${t.story_points} pts  ·  ${due}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Done" },
          style: "primary",
          action_id: "open_done_modal",
          value: t.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Block" },
          style: "danger",
          action_id: "open_block_modal",
          value: t.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "View" },
          url: taskUrl(t.id),
          action_id: "view_task",
          value: t.id,
        },
      ],
    },
    { type: "divider" },
  ];
}

// ---------------------------------------------------------------------------
// /task show — single task detail card
// ---------------------------------------------------------------------------
export function buildTaskDetailCard(
  t: TaskRow,
  project: Pick<ProjectRow, "name" | "code"> | null,
  recentEvents: Array<{ event_type: string; created_at: string }>,
): unknown[] {
  const proj = project ? `${project.code} · ${project.name}` : "(no project)";
  const eventsText = recentEvents
    .slice(0, 3)
    .map((e) => `· ${e.event_type} — ${new Date(e.created_at).toUTCString().slice(5, 22)}`)
    .join("\n");
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${t.id} · ${t.title}*` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Project*\n${proj}` },
        { type: "mrkdwn", text: `*Status*\n${t.status}` },
        { type: "mrkdwn", text: `*Priority*\n${t.priority}` },
        { type: "mrkdwn", text: `*Points*\n${t.story_points}` },
        { type: "mrkdwn", text: `*Due*\n${t.due_date ?? "—"}` },
      ],
    },
    ...(t.description ? [{ type: "section", text: { type: "mrkdwn", text: t.description } }] : []),
    ...(eventsText
      ? [
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: `Recent activity:\n${eventsText}` }],
          },
        ]
      : []),
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open" },
          url: taskUrl(t.id),
          action_id: "view_task",
          value: t.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Mark done" },
          style: "primary",
          action_id: "open_done_modal",
          value: t.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Block" },
          style: "danger",
          action_id: "open_block_modal",
          value: t.id,
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// /task add modal (Sprint 2 §9)
// ---------------------------------------------------------------------------
export function buildCreateTaskModal(opts: {
  channelId: string | null;
  projectOptions: Array<{ id: string; code: string; name: string }>;
  defaultProjectId?: string;
}): unknown {
  const projectOptions = opts.projectOptions.slice(0, 100).map((p) => ({
    text: { type: "plain_text", text: `${p.code} · ${p.name}`.slice(0, 75) },
    value: p.id,
  }));
  const initialOption =
    opts.defaultProjectId &&
    projectOptions.find((o) => (o as { value: string }).value === opts.defaultProjectId);

  return {
    type: "modal",
    callback_id: "create_task_modal",
    private_metadata: JSON.stringify({ channel_id: opts.channelId }),
    title: { type: "plain_text", text: "Create task" },
    submit: { type: "plain_text", text: "Create" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "title",
        label: { type: "plain_text", text: "Title" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          min_length: 3,
          max_length: 200,
        },
      },
      {
        type: "input",
        block_id: "description",
        optional: true,
        label: { type: "plain_text", text: "Description" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          multiline: true,
          max_length: 2000,
        },
      },
      {
        type: "input",
        block_id: "project",
        label: { type: "plain_text", text: "Project" },
        element: {
          type: "static_select",
          action_id: "value",
          options: projectOptions,
          ...(initialOption ? { initial_option: initialOption } : {}),
          placeholder: { type: "plain_text", text: "Pick a project" },
        },
      },
      {
        type: "input",
        block_id: "assignee",
        label: { type: "plain_text", text: "Assignee" },
        element: {
          type: "users_select",
          action_id: "value",
          placeholder: { type: "plain_text", text: "Who's on it?" },
        },
      },
      {
        type: "input",
        block_id: "points",
        label: { type: "plain_text", text: "Story points" },
        element: {
          type: "static_select",
          action_id: "value",
          initial_option: { text: { type: "plain_text", text: "3" }, value: "3" },
          options: [1, 3, 8].map((n) => ({
            text: { type: "plain_text", text: String(n) },
            value: String(n),
          })),
        },
      },
      {
        type: "input",
        block_id: "priority",
        label: { type: "plain_text", text: "Priority" },
        element: {
          type: "static_select",
          action_id: "value",
          initial_option: { text: { type: "plain_text", text: "P2" }, value: "P2" },
          options: ["P0", "P1", "P2", "P3"].map((p) => ({
            text: { type: "plain_text", text: p },
            value: p,
          })),
        },
      },
      {
        type: "input",
        block_id: "due_date",
        optional: true,
        label: { type: "plain_text", text: "Due date" },
        element: { type: "datepicker", action_id: "value" },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// /task done modal — asks for actual hours
// ---------------------------------------------------------------------------
export function buildDoneModal(taskId: string): unknown {
  return {
    type: "modal",
    callback_id: "done_task_modal",
    private_metadata: JSON.stringify({ task_id: taskId }),
    title: { type: "plain_text", text: `Mark ${taskId} done` },
    submit: { type: "plain_text", text: "Mark done" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "actual_hours",
        optional: true,
        label: { type: "plain_text", text: "How long did this actually take? (hours)" },
        element: {
          type: "number_input",
          is_decimal_allowed: true,
          action_id: "value",
          min_value: "0",
          max_value: "200",
        },
        hint: {
          type: "plain_text",
          text: "Used by Sprint 5 variance reports. Optional for now.",
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// /task block modal — collects blocker reason
// ---------------------------------------------------------------------------
export function buildBlockModal(taskId: string): unknown {
  return {
    type: "modal",
    callback_id: "block_task_modal",
    private_metadata: JSON.stringify({ task_id: taskId }),
    title: { type: "plain_text", text: `Block ${taskId}` },
    submit: { type: "plain_text", text: "Block" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "reason",
        label: { type: "plain_text", text: "What's blocking this task?" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          multiline: true,
          min_length: 3,
          max_length: 1000,
        },
      },
    ],
  };
}
