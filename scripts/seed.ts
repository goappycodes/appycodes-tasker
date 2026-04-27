/**
 * Seed importer (T-005)
 *
 *   pnpm seed   (or: npm run seed)
 *
 * Reads:
 *   - seed/users.csv     name,email,slack_user_id,slack_handle,clockify_user_id,role
 *   - seed/projects.csv  slug,name,slack_channel_id,lead_email,description
 *   - seed/trello-export.json  (Trello board JSON; one or many)
 *
 * Idempotent — safe to re-run. Users keyed on email; projects on slug; tasks on
 * a deterministic external_ref derived from the Trello card id (stored in
 * task_events.metadata when first imported, then matched on re-runs).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Load .env.local manually (tsx does not do this by default).
loadDotenv();

const SUPABASE_URL = required("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// CSV parser (minimal — handles quoted fields with commas/newlines)
// ---------------------------------------------------------------------------
function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop empty trailing rows
  const filtered = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (filtered.length === 0) return [];
  const header = filtered[0]!.map((h) => h.trim());
  return filtered.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const UserCsv = z.object({
  name: z.string().min(1),
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase()),
  slack_user_id: z.string().optional().default(""),
  slack_handle: z.string().optional().default(""),
  clockify_user_id: z.string().optional().default(""),
  role: z.enum(["admin", "manager", "lead", "dev"]).default("dev"),
});

const ProjectCsv = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  slack_channel_id: z.string().optional().default(""),
  lead_email: z.string().optional().default(""),
  description: z.string().optional().default(""),
});

// Trello export: support either a single board or an array of boards.
const TrelloCard = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().optional().default(""),
  idList: z.string(),
  due: z.string().nullable().optional(),
  closed: z.boolean().optional().default(false),
  labels: z
    .array(z.object({ name: z.string().optional() }))
    .optional()
    .default([]),
  idMembers: z.array(z.string()).optional().default([]),
});
const TrelloList = z.object({ id: z.string(), name: z.string() });
const TrelloMember = z.object({
  id: z.string(),
  username: z.string().optional(),
  email: z.string().optional(),
  fullName: z.string().optional(),
});
const TrelloBoard = z.object({
  id: z.string(),
  name: z.string(),
  lists: z.array(TrelloList),
  cards: z.array(TrelloCard),
  members: z.array(TrelloMember).optional().default([]),
});
const TrelloExport = z.union([TrelloBoard, z.array(TrelloBoard)]);

// ---------------------------------------------------------------------------
// Importers
// ---------------------------------------------------------------------------
async function importUsers() {
  const path = resolve("seed/users.csv");
  if (!existsSync(path)) {
    console.warn(`! seed/users.csv not found — skipping users`);
    return new Map<string, string>();
  }
  const rows = parseCsv(readFileSync(path, "utf8")).map((r) => UserCsv.parse(r));
  console.log(`→ users.csv: ${rows.length} rows`);

  const payload = rows.map((r) => ({
    email: r.email,
    name: r.name,
    slack_user_id: r.slack_user_id || null,
    slack_handle: r.slack_handle || null,
    clockify_user_id: r.clockify_user_id || null,
    role: r.role,
    is_active: true,
  }));

  const { error } = await supabase.from("users").upsert(payload, { onConflict: "email" });
  if (error) throw new Error(`users upsert failed: ${error.message}`);

  // Build email → id lookup for downstream linking.
  const { data, error: selErr } = await supabase.from("users").select("id, email");
  if (selErr) throw new Error(`users readback failed: ${selErr.message}`);
  const emailToId = new Map<string, string>();
  for (const u of data ?? []) emailToId.set(u.email, u.id);
  console.log(`  ✓ ${emailToId.size} users in DB`);
  return emailToId;
}

async function importProjects(emailToUserId: Map<string, string>) {
  const path = resolve("seed/projects.csv");
  if (!existsSync(path)) {
    console.warn(`! seed/projects.csv not found — skipping projects`);
    return new Map<string, string>();
  }
  const rows = parseCsv(readFileSync(path, "utf8")).map((r) => ProjectCsv.parse(r));
  console.log(`→ projects.csv: ${rows.length} rows`);

  const payload = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    description: r.description || null,
    slack_channel_id: r.slack_channel_id || null,
    lead_user_id: r.lead_email ? (emailToUserId.get(r.lead_email.toLowerCase()) ?? null) : null,
    is_active: true,
  }));

  const { error } = await supabase.from("projects").upsert(payload, { onConflict: "slug" });
  if (error) throw new Error(`projects upsert failed: ${error.message}`);

  const { data, error: selErr } = await supabase.from("projects").select("id, slug");
  if (selErr) throw new Error(`projects readback failed: ${selErr.message}`);
  const slugToId = new Map<string, string>();
  for (const p of data ?? []) slugToId.set(p.slug, p.id);
  console.log(`  ✓ ${slugToId.size} projects in DB`);
  return slugToId;
}

async function importTrello(
  emailToUserId: Map<string, string>,
  slugToProjectId: Map<string, string>,
) {
  const path = resolve("seed/trello-export.json");
  if (!existsSync(path)) {
    console.warn(`! seed/trello-export.json not found — skipping tasks`);
    return;
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const parsed = TrelloExport.parse(raw);
  const boards = Array.isArray(parsed) ? parsed : [parsed];

  // We need a default creator (an admin) for any task without a clear member match.
  const { data: anyAdmin } = await supabase
    .from("users")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!anyAdmin) {
    throw new Error("Cannot import Trello tasks: no admin user in seed. Add one to users.csv.");
  }
  const fallbackCreator = anyAdmin.id as string;

  // Track which Trello card ids we've already imported so re-runs are idempotent.
  // We persist this mapping in task_events.metadata on the "created" event.
  const { data: existingEvents } = await supabase
    .from("task_events")
    .select("task_id, metadata")
    .eq("event_type", "created");
  const existingTrelloIds = new Set<string>();
  for (const e of existingEvents ?? []) {
    const meta = e.metadata as { trello_card_id?: string } | null;
    if (meta?.trello_card_id) existingTrelloIds.add(meta.trello_card_id);
  }

  let inserted = 0;
  let skipped = 0;

  for (const board of boards) {
    const projectId = slugToProjectId.get(slugFromBoardName(board.name));
    if (!projectId) {
      console.warn(`! Trello board "${board.name}" has no matching project slug — skipping`);
      continue;
    }

    const listIdToStatus = new Map<string, "todo" | "in_progress" | "blocked" | "done">();
    for (const list of board.lists) listIdToStatus.set(list.id, mapListNameToStatus(list.name));

    const trelloMemberIdToEmail = new Map<string, string>();
    for (const m of board.members) {
      if (m.email) trelloMemberIdToEmail.set(m.id, m.email.toLowerCase());
    }

    for (const card of board.cards) {
      if (card.closed) continue;
      if (existingTrelloIds.has(card.id)) {
        skipped++;
        continue;
      }

      const status = listIdToStatus.get(card.idList) ?? "todo";
      const labelTags = (card.labels ?? []).map((l) => l.name?.toLowerCase()).filter(Boolean);
      const story_points = pointsFromLabels(labelTags as string[]);

      const assigneeEmail = card.idMembers
        .map((id) => trelloMemberIdToEmail.get(id))
        .find((e): e is string => Boolean(e));
      const assignee_id = assigneeEmail ? (emailToUserId.get(assigneeEmail) ?? null) : null;

      const due_date = card.due ? card.due.slice(0, 10) : null;

      const { data: insertedTask, error: insErr } = await supabase
        .from("tasks")
        .insert({
          project_id: projectId,
          title: card.name.slice(0, 200),
          description: card.desc || null,
          status,
          priority: "P2",
          story_points,
          assignee_id,
          creator_id: fallbackCreator,
          due_date,
        })
        .select("id")
        .single();
      if (insErr || !insertedTask) {
        console.error(`  ✗ failed to insert card "${card.name}":`, insErr?.message);
        continue;
      }

      const { error: evErr } = await supabase.from("task_events").insert({
        task_id: insertedTask.id,
        actor_id: fallbackCreator,
        event_type: "created",
        from_value: null,
        to_value: { title: card.name, status, story_points },
        metadata: { source: "trello_seed", trello_card_id: card.id, board: board.name },
      });
      if (evErr) console.error(`  ✗ event log failed for ${insertedTask.id}: ${evErr.message}`);
      inserted++;
    }
  }

  console.log(`  ✓ tasks: ${inserted} inserted, ${skipped} skipped (already imported)`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function slugFromBoardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mapListNameToStatus(name: string): "todo" | "in_progress" | "blocked" | "done" {
  const n = name.toLowerCase();
  if (/(done|complete|shipped|closed)/.test(n)) return "done";
  if (/(blocked|waiting|hold)/.test(n)) return "blocked";
  if (/(progress|doing|in[- ]?work|wip|active)/.test(n)) return "in_progress";
  return "todo";
}

function pointsFromLabels(labels: string[]): 1 | 3 | 8 {
  // Allow Trello labels like "1pt", "3pt", "8pt", "3 points", etc.
  for (const label of labels) {
    const m = label.match(/^(\d+)\s*(pt|pts|point|points)?$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (n === 1 || n === 3 || n === 8) return n;
    if (n === 20) {
      console.warn(`  ! card has 20-point label — coercing to 8 (break it down later)`);
      return 8;
    }
  }
  return 3; // default per spec
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}. Did you create .env.local?`);
    process.exit(1);
  }
  return v;
}

function loadDotenv() {
  // Minimal .env.local loader (avoids a dotenv dep for one file).
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2]!;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = val;
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  console.log("Tasker seed importer\n");
  const emails = await importUsers();
  const projects = await importProjects(emails);
  await importTrello(emails, projects);
  console.log("\n✓ seed complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
