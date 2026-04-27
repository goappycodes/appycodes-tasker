import type { TaskStatus } from "@/types/db";

const STYLES: Record<TaskStatus, string> = {
  todo: "border-border text-muted",
  in_progress: "border-accent/40 bg-accent/10 text-accent",
  blocked: "border-warn/40 bg-warn/10 text-warn",
  done: "border-success/40 bg-success/10 text-success",
};

const LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export function TaskStatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
