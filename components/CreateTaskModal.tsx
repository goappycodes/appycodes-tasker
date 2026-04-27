"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";

interface ProjectOpt {
  id: string;
  code: string;
  name: string;
  status: "active" | "paused" | "done";
}
interface UserOpt {
  id: string;
  name: string;
}

const POINT_OPTIONS: Array<1 | 3 | 8 | 20> = [1, 3, 8, 20];
const PRIORITY_OPTIONS: Array<{ value: "P0" | "P1" | "P2" | "P3"; classes: string }> = [
  { value: "P0", classes: "border-danger/40 bg-danger/10 text-danger" },
  { value: "P1", classes: "border-warn/40 bg-warn/10 text-warn" },
  { value: "P2", classes: "border-accent/40 bg-accent/10 text-accent" },
  { value: "P3", classes: "border-border text-muted" },
];

export function CreateTaskModalTrigger({
  projects,
  users,
  currentUser,
  defaultProjectId,
}: {
  projects: ProjectOpt[];
  users: UserOpt[];
  currentUser: { id: string };
  defaultProjectId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
      >
        + New task
      </button>
      <CreateTaskModal
        open={open}
        onClose={() => setOpen(false)}
        projects={projects}
        users={users}
        currentUser={currentUser}
        defaultProjectId={defaultProjectId}
      />
    </>
  );
}

function CreateTaskModal({
  open,
  onClose,
  projects,
  users,
  currentUser,
  defaultProjectId,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOpt[];
  users: UserOpt[];
  currentUser: { id: string };
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const activeProjects = projects.filter((p) => p.status === "active");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>(
    defaultProjectId ?? activeProjects[0]?.id ?? "",
  );
  const [assigneeId, setAssigneeId] = useState<string>(currentUser.id);
  const [points, setPoints] = useState<1 | 3 | 8 | 20>(3);
  const [priority, setPriority] = useState<"P0" | "P1" | "P2" | "P3">("P2");
  const [dueDate, setDueDate] = useState<string>("");
  const [notify, setNotify] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setProjectId(defaultProjectId ?? activeProjects[0]?.id ?? "");
      setAssigneeId(currentUser.id);
      setPoints(3);
      setPriority("P2");
      setDueDate("");
      setNotify(true);
      setErrorMsg(null);
      setFieldErrors({});
    }
  }, [open, defaultProjectId, activeProjects, currentUser.id]);

  const valid = title.trim().length >= 3 && projectId && assigneeId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setFieldErrors({});

    const body: Record<string, unknown> = {
      project_id: projectId,
      title: title.trim(),
      story_points: points,
      priority,
      assignee_id: assigneeId || null,
    };
    if (description.trim().length > 0) body.description = description.trim();
    if (dueDate) body.due_date = dueDate;

    try {
      const res = await fetch(`/api/tasks${notify ? "" : "?notify=false"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        id?: string;
        error?: { message?: string; details?: { fieldErrors?: Record<string, string[]> } };
      };
      if (!res.ok) {
        if (json.error?.details?.fieldErrors) {
          const fe: Record<string, string> = {};
          for (const [k, v] of Object.entries(json.error.details.fieldErrors)) {
            if (Array.isArray(v) && v[0]) fe[k] = v[0];
          }
          setFieldErrors(fe);
        }
        setErrorMsg(json.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      onClose();
      router.refresh();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create new task" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted">
          Anyone can create a task. Required fields marked <span className="text-danger">*</span>.
        </p>

        <Field label="Title" required error={fieldErrors.title}>
          <input
            autoFocus
            type="text"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            placeholder="Short, plain text. No markdown."
          />
        </Field>

        <Field label="Description" error={fieldErrors.description}>
          <textarea
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Project" required error={fieldErrors.project_id}>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Assignee" required error={fieldErrors.assignee_id}>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Story points" required>
            <div className="flex gap-1.5">
              {POINT_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPoints(p)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                    points === p
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-bg text-ink hover:bg-surface"
                  }`}
                  title={p === 20 ? "20 means too big — break it down" : undefined}
                >
                  {p}
                </button>
              ))}
            </div>
            {points === 20 && (
              <p className="mt-1 text-[11px] text-warn">
                20 means too big — break it down. The API will reject this.
              </p>
            )}
          </Field>

          <Field label="Priority" required>
            <div className="flex gap-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                    priority === p.value
                      ? p.classes + " ring-1 ring-current"
                      : "border-border bg-bg text-ink hover:bg-surface"
                  }`}
                >
                  {p.value}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Due date" error={fieldErrors.due_date}>
            <input
              type="date"
              value={dueDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </Field>

          <Field label="Linked Slack thread">
            <div className="rounded-md border border-border bg-bg/40 px-3 py-2 text-xs text-muted">
              Auto-linked when created via /task add
            </div>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="rounded border-border bg-bg"
          />
          Notify assignee via Slack DM
        </label>

        {errorMsg && (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {errorMsg}
          </div>
        )}

        <footer className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || submitting}
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create task"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
        {label} {required && <span className="text-danger">*</span>}
      </span>
      {children}
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </label>
  );
}
