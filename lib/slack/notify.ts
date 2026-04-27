import { db } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { postChatMessage, openImChannel } from "@/lib/slack/client";
import {
  buildAssignedDmBlocks,
  buildReassignedDmBlocks,
  buildBlockedChannelBlocks,
  buildCompletedChannelBlocks,
} from "@/lib/slack/blocks";
import type { NotifyPayload } from "@/lib/notify";
import type { TaskRow, UserRow, ProjectRow } from "@/types/db";

/**
 * Materialises a NotifyPayload into a Slack message. Looks up everyone we need
 * (task, project, actor, assignees) in parallel, then dispatches the right
 * Block Kit template.
 *
 * No-op (logs warn) if SLACK_BOT_TOKEN isn't configured — useful for local dev
 * before the bot is set up. Returns silently to avoid blocking writes.
 */
export async function sendSlackNotification(p: NotifyPayload): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    logger.warn(
      { kind: p.kind, task_id: p.task_id },
      "slack notify skipped: SLACK_BOT_TOKEN missing",
    );
    return;
  }

  const supabase = db();
  const [{ data: task }, { data: actor }] = await Promise.all([
    supabase.from("tasks").select("*").eq("id", p.task_id).maybeSingle<TaskRow>(),
    supabase
      .from("users")
      .select("id, name, slack_handle, slack_user_id")
      .eq("id", p.actor_user_id)
      .maybeSingle(),
  ]);
  if (!task) {
    logger.warn({ task_id: p.task_id }, "slack notify: task not found");
    return;
  }
  const { data: project } = await supabase
    .from("projects")
    .select("id, code, name, slack_channel_id, lead_user_id")
    .eq("id", task.project_id)
    .maybeSingle<Pick<ProjectRow, "id" | "code" | "name" | "slack_channel_id" | "lead_user_id">>();

  const target = p.target_user_id
    ? (
        await supabase
          .from("users")
          .select("id, name, slack_user_id")
          .eq("id", p.target_user_id)
          .maybeSingle<Pick<UserRow, "id" | "name" | "slack_user_id">>()
      ).data
    : null;

  const ctx = {
    task,
    project: project ?? null,
    actor: actor as Pick<UserRow, "id" | "name" | "slack_handle" | "slack_user_id"> | null,
    target,
  };

  switch (p.kind) {
    case "task_assigned": {
      if (!target?.slack_user_id) {
        logger.warn({ task_id: p.task_id }, "slack notify: assignee has no slack_user_id");
        return;
      }
      const im = await openImChannel(target.slack_user_id);
      if (!im) return;
      await postChatMessage({
        channel: im,
        text: `New task assigned: ${task.id} ${task.title}`,
        blocks: buildAssignedDmBlocks(ctx),
      });
      return;
    }

    case "task_reassigned": {
      if (!target?.slack_user_id) return;
      const im = await openImChannel(target.slack_user_id);
      if (!im) return;
      const previousAssignee = p.previous_assignee_id
        ? (
            await supabase
              .from("users")
              .select("id, name, slack_handle")
              .eq("id", p.previous_assignee_id)
              .maybeSingle<Pick<UserRow, "id" | "name" | "slack_handle">>()
          ).data
        : null;
      await postChatMessage({
        channel: im,
        text: `Task reassigned to you: ${task.id} ${task.title}`,
        blocks: buildReassignedDmBlocks({ ...ctx, previousAssignee }),
      });
      return;
    }

    case "task_blocked": {
      if (!project?.slack_channel_id) {
        logger.info({ task_id: p.task_id }, "task_blocked: project has no Slack channel");
        return;
      }
      await postChatMessage({
        channel: project.slack_channel_id,
        text: `🚧 ${task.id} blocked`,
        blocks: buildBlockedChannelBlocks(ctx),
      });
      // Also DM the project lead, if any.
      if (project.lead_user_id) {
        const { data: lead } = await supabase
          .from("users")
          .select("slack_user_id")
          .eq("id", project.lead_user_id)
          .maybeSingle<Pick<UserRow, "slack_user_id">>();
        if (lead?.slack_user_id) {
          const im = await openImChannel(lead.slack_user_id);
          if (im) {
            await postChatMessage({
              channel: im,
              text: `${task.id} on ${project.name} is blocked`,
              blocks: buildBlockedChannelBlocks(ctx),
            });
          }
        }
      }
      return;
    }

    case "task_completed": {
      if (!project?.slack_channel_id) return;
      await postChatMessage({
        channel: project.slack_channel_id,
        text: `✓ ${task.id} done`,
        blocks: buildCompletedChannelBlocks(ctx),
      });
      return;
    }
  }
}
