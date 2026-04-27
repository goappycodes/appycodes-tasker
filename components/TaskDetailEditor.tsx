"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";

type Status = "todo" | "in_progress" | "blocked" | "done";
type Priority = "P0" | "P1" | "P2" | "P3";

interface ProjectOpt {
  id: string;
  code: string;
  name: string;
}
interface UserOpt {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  story_points: 1 | 3 | 8;
  assignee_id: string | null;
  project_id: string;
  due_date: string | null;
  blocker_reason: string | null;
}

const STATUSES: Status[] = ["todo", "in_progress", "blocked", "done"];
const STATUS_LABELS: Record<Status, string> = {
  todo: "Todo",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const PRIORITIES: Array<{ value: Priority; classes: string }> = [
  { value: "P0", classes: "border-danger/40 bg-danger/10 text-danger" },
  { value: "P1", classes: "border-warn/40 bg-warn/10 text-warn" },
  { value: "P2", classes: "border-accent/40 bg-accent/10 text-accent" },
  { value: "P3", classes: "border-border text-muted" },
];

const POINTS: Array<1 | 3 | 8> = [1, 3, 8];

/**
 * Inline-edit shell for task detail page (Sprint 2 §13). Click any field to
 * edit; tab/blur to save; Esc to cancel. Status changes to blocked/done open
 * focused dialogs to collect the required extra info.
 */
export function TaskDetailEditor({
  task: initialTask,
  projects,
  users,
  canEdit,
}: {
  task: Task;
  projects: ProjectOpt[];
  users: UserOpt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [task, setTask] = useState<Task>(initialTask);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  async function patch(payload: Partial<Task>): Promise<boolean> {
    if (!canEdit) {
      setError("Only the assignee, creator, or project lead can edit this task.");
      return false;
    }
    setError(null);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: { message?: string } };
      setError(json.error?.message ?? `HTTP ${res.status}`);
      return false;
    }
    const updated = (await res.json()) as Task;
    setTask((t) => ({ ...t, ...updated }));
    startTransition(() => router.refresh());
    return true;
  }

  // status changes go through the dropdown handler
  async function onStatusChange(next: Status) {
    if (next === task.status) return;
    if (next === "blocked") {
      setBlockOpen(true);
      return;
    }
    await patch({ status: next });
  }

  async function submitBlock() {
    if (blockReason.trim().length < 3) {
      setError("Reason must be at least 3 characters.");
      return;
    }
    const ok = await patch({ status: "blocked", blocker_reason: blockReason.trim() });
    if (ok) {
      setBlockOpen(false);
      setBlockReason("");
    }
  }

  const projectName = projects.find((p) => p.id === task.project_id);
  const assigneeName = users.find((u) => u.id === task.assignee_id);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {/* Quick action row */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canEdit || task.status === "done" || isPending}
          onClick={() => patch({ status: "done" })}
          className="rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✓ Mark done
        </button>
        <button
          type="button"
          disabled={!canEdit || task.status === "blocked" || isPending}
          onClick={() => setBlockOpen(true)}
          className="rounded-md border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs font-medium text-warn hover:bg-warn/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          🚧 Block
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Editable
          label="Status"
          render={() => (
            <select
              disabled={!canEdit}
              value={task.status}
              onChange={(e) => onStatusChange(e.target.value as Status)}
              className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          )}
        />

        <Editable
          label="Priority"
          render={() => (
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => patch({ priority: p.value })}
                  className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                    task.priority === p.value
                      ? p.classes + " ring-1 ring-current"
                      : "border-border bg-bg text-ink hover:bg-surface"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {p.value}
                </button>
              ))}
            </div>
          )}
        />

        <Editable
          label="Project"
          render={() => (
            <select
              disabled={!canEdit}
              value={task.project_id}
              onChange={(e) => patch({ project_id: e.target.value })}
              className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          )}
          subLabel={projectName ? `${projectName.code} · ${projectName.name}` : "(no project)"}
        />

        <Editable
          label="Assignee"
          render={() => (
            <select
              disabled={!canEdit}
              value={task.assignee_id ?? ""}
              onChange={(e) => patch({ assignee_id: e.target.value || null })}
              className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
            >
              <option value="">— Unassigned —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          subLabel={assigneeName?.name ?? "Unassigned"}
        />

        <Editable
          label="Story points"
          render={() => (
            <div className="flex gap-1.5">
              {POINTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => patch({ story_points: p })}
                  className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                    task.story_points === p
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-bg text-ink hover:bg-surface"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        />

        <Editable
          label="Due date"
          render={() => (
            <input
              type="date"
              disabled={!canEdit}
              defaultValue={task.due_date ?? ""}
              onBlur={async (e) => {
                const next = e.target.value || null;
                if (next !== (task.due_date ?? null)) await patch({ due_date: next });
              }}
              className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
            />
          )}
        />
      </div>

      {/* Description */}
      <DescriptionEditor
        description={task.description ?? ""}
        canEdit={canEdit}
        onSave={async (v) => {
          await patch({ description: v.length === 0 ? null : v });
        }}
      />

      {/* Blocker reason (read-only display when blocked) */}
      {task.status === "blocked" && task.blocker_reason && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
          <div className="text-[10px] uppercase tracking-wider">Blocker reason</div>
          <div className="mt-1 text-sm">{task.blocker_reason}</div>
        </div>
      )}

      {/* Block reason modal */}
      <Modal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title={`Block ${task.id}`}
        size="md"
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Reason is required. This will post to the project&apos;s Slack channel and DM the lead.
          </p>
          <textarea
            autoFocus
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            placeholder="Waiting on design approval, awaiting API access, etc."
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setBlockOpen(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitBlock}
              disabled={blockReason.trim().length < 3}
              className="rounded-md border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs font-medium text-warn hover:bg-warn/20 disabled:opacity-50"
            >
              Mark blocked
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Editable({
  label,
  render,
  subLabel,
}: {
  label: string;
  render: () => React.ReactNode;
  subLabel?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">{label}</div>
      {render()}
      {subLabel && <div className="mt-1 text-[11px] text-muted">{subLabel}</div>}
    </div>
  );
}

function DescriptionEditor({
  description,
  canEdit,
  onSave,
}: {
  description: string;
  canEdit: boolean;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);

  if (!editing) {
    return (
      <div className="rounded-md border border-border bg-bg p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted">Description</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setDraft(description);
                setEditing(true);
              }}
              className="text-[11px] text-muted hover:text-ink"
            >
              Edit
            </button>
          )}
        </div>
        <div className="whitespace-pre-wrap text-sm text-ink">
          {description || <span className="text-muted">No description.</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-accent/40 bg-bg p-3">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">Description</div>
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        maxLength={2000}
        className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={async () => {
            await onSave(draft);
            setEditing(false);
          }}
          className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/90"
        >
          Save
        </button>
      </div>
    </div>
  );
}
