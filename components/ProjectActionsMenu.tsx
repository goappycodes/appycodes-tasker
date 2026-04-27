"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Row-action ⋯ menu for the projects table. Visible to manager+; renders only
 * the link items the user is allowed to use.
 */
export function ProjectActionsMenu({
  projectId,
  status,
  slackChannelId,
  canEdit,
  canArchive,
}: {
  projectId: string;
  status: "active" | "paused" | "done";
  slackChannelId: string | null;
  canEdit: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function patchStatus(newStatus: "active" | "paused" | "done") {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        alert(json.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (busy) return;
    if (!confirm("Archive this project? All open tasks must be closed or reassigned first."))
      return;
    setBusy(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (res.status === 204) {
        router.refresh();
        return;
      }
      const json = (await res.json()) as {
        error?: {
          message?: string;
          details?: { open_tasks?: Array<{ id: string; title: string }> };
        };
      };
      const blocking = json.error?.details?.open_tasks ?? [];
      alert(
        `${json.error?.message ?? "Could not archive."}` +
          (blocking.length
            ? `\n\nBlocking tasks:\n${blocking.map((t) => `${t.id} ${t.title}`).join("\n")}`
            : ""),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit && !canArchive) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 text-muted hover:bg-bg hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-border bg-surface py-1 text-xs shadow-lg">
          {canEdit && status !== "paused" && (
            <button
              onClick={() => patchStatus("paused")}
              className="block w-full px-3 py-1.5 text-left hover:bg-bg"
            >
              Pause
            </button>
          )}
          {canEdit && status === "paused" && (
            <button
              onClick={() => patchStatus("active")}
              className="block w-full px-3 py-1.5 text-left hover:bg-bg"
            >
              Reactivate
            </button>
          )}
          {canArchive && status !== "done" && (
            <button
              onClick={archive}
              className="block w-full px-3 py-1.5 text-left text-danger hover:bg-bg"
            >
              Archive
            </button>
          )}
          {slackChannelId && (
            <a
              href={`slack://channel?team=&id=${slackChannelId}`}
              className="block px-3 py-1.5 text-muted hover:bg-bg hover:text-ink"
            >
              Open Slack channel
            </a>
          )}
        </div>
      )}
    </div>
  );
}
