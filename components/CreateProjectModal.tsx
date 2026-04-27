"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";

interface UserOpt {
  id: string;
  name: string;
  role: "admin" | "manager" | "lead" | "dev";
}

export function CreateProjectModalTrigger({ users }: { users: UserOpt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
      >
        + New project
      </button>
      <CreateProjectModal open={open} onClose={() => setOpen(false)} users={users} />
    </>
  );
}

function CreateProjectModal({
  open,
  onClose,
  users,
}: {
  open: boolean;
  onClose: () => void;
  users: UserOpt[];
}) {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [status, setStatus] = useState<"active" | "paused" | "done">("active");
  const [slackChannelId, setSlackChannelId] = useState("");
  const [leadId, setLeadId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setCode("");
      setName("");
      setClientName("");
      setStatus("active");
      setSlackChannelId("");
      setLeadId("");
      setErrorMsg(null);
      setFieldErrors({});
    }
  }, [open]);

  const codeValid = /^[A-Z]{2,6}$/.test(code);
  const nameValid = name.trim().length >= 3;
  const channelValid = !slackChannelId || /^[CG][A-Z0-9]{7,11}$/.test(slackChannelId);
  const valid = codeValid && nameValid && channelValid;

  const leadEligible = users.filter((u) => u.role !== "dev");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setFieldErrors({});

    const body: Record<string, unknown> = {
      code,
      name: name.trim(),
      status,
    };
    if (clientName.trim()) body.client_name = clientName.trim();
    if (slackChannelId) body.slack_channel_id = slackChannelId;
    if (leadId) body.lead_user_id = leadId;

    try {
      const res = await fetch("/api/projects", {
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
    <Modal open={open} onClose={onClose} title="Create new project" size="md">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted">
          Leads, managers, and admins only. Devs cannot create projects.
        </p>

        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Field label="Code" required error={fieldErrors.code}>
            <input
              autoFocus
              type="text"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm uppercase tracking-wider text-ink focus:border-accent focus:outline-none"
              placeholder="RR"
            />
          </Field>
          <div className="self-end pb-2 text-[11px] text-muted">
            Short uniq id, 2–6 letters · LOCKED after creation
          </div>
        </div>

        <Field label="Project name" required error={fieldErrors.name}>
          <input
            type="text"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Client name" error={fieldErrors.client_name}>
            <input
              type="text"
              value={clientName}
              maxLength={120}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              placeholder="Optional"
            />
          </Field>

          <Field label="Status" required>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "paused" | "done")}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="done">Archived</option>
            </select>
          </Field>
        </div>

        <Field label="Slack channel ID" error={fieldErrors.slack_channel_id}>
          <input
            type="text"
            value={slackChannelId}
            onChange={(e) => setSlackChannelId(e.target.value.toUpperCase())}
            placeholder="C0123ABCDEF"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-muted">
            When devs run /task add in this channel, the project will be auto-detected.
          </p>
        </Field>

        <Field label="Project lead">
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          >
            <option value="">—</option>
            {leadEligible.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </Field>

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
            {submitting ? "Creating…" : "Create project"}
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
