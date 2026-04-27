/**
 * Demo seeder — populates the DB with realistic-looking team, projects, tasks
 * and task_events so the dashboard is worth looking at. Idempotent: keyed on
 * users.email and projects.slug; tasks are only inserted if the project has
 * fewer than its target count.
 *
 *   npm run seed:demo
 *
 * NOT for production data — that goes through `npm run seed` (CSV+Trello).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

loadDotenv();

const supabase = createClient(
  required("SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
type Role = "admin" | "manager" | "lead" | "dev";

const USERS: Array<{ email: string; name: string; role: Role; slack_handle?: string }> = [
  { email: "ritesh@appycodes.com", name: "Ritesh",        role: "admin",   slack_handle: "ritesh" },
  { email: "swati@appycodes.com",  name: "Swati",         role: "admin",   slack_handle: "swati" },
  { email: "priya@appycodes.com",  name: "Priya Verma",   role: "manager", slack_handle: "priya" },
  { email: "arjun@appycodes.com",  name: "Arjun Mehta",   role: "lead",    slack_handle: "arjun" },
  { email: "tania@appycodes.com",  name: "Tania Bose",    role: "lead",    slack_handle: "tania" },
  { email: "karan@appycodes.com",  name: "Karan Singh",   role: "dev",     slack_handle: "karan" },
  { email: "neha@appycodes.com",   name: "Neha Iyer",     role: "dev",     slack_handle: "neha" },
  { email: "vikram@appycodes.com", name: "Vikram Joshi",  role: "dev",     slack_handle: "vikram" },
  { email: "aditi@appycodes.com",  name: "Aditi Sharma",  role: "dev",     slack_handle: "aditi" },
  { email: "rahul@appycodes.com",  name: "Rahul Das",     role: "dev",     slack_handle: "rahul" },
  { email: "meera@appycodes.com",  name: "Meera Nair",    role: "dev",     slack_handle: "meera" },
  { email: "sanjay@appycodes.com", name: "Sanjay Kapoor", role: "dev",     slack_handle: "sanjay" },
];

const PROJECTS: Array<{
  slug: string;
  name: string;
  description: string;
  lead: string;          // email
  slack_channel_id?: string;
  taskTarget: number;    // total tasks we want for this project
}> = [
  { slug: "tasker",         name: "Tasker (internal)",       description: "Internal task OS replacing Trello + Sheets",       lead: "swati@appycodes.com",  slack_channel_id: "C00TASKER",   taskTarget: 12 },
  { slug: "website",        name: "Website redesign",        description: "appycodes.com refresh — new landing + blog",       lead: "ritesh@appycodes.com", slack_channel_id: "C00WEB",      taskTarget: 8  },
  { slug: "mobile-app",     name: "Mobile app v2",           description: "Rewrite of the field-ops app",                     lead: "arjun@appycodes.com",  slack_channel_id: "C00MOBILE",   taskTarget: 10 },
  { slug: "ml-pipeline",    name: "ML data pipeline",        description: "Ingestion + feature store for the recsys client",  lead: "tania@appycodes.com",  slack_channel_id: "C00ML",       taskTarget: 8  },
  { slug: "billing",        name: "Billing system overhaul", description: "Stripe migration + invoice rework",                lead: "priya@appycodes.com",  slack_channel_id: "C00BILL",     taskTarget: 6  },
  { slug: "ops-tools",      name: "Internal ops tools",      description: "Admin dashboards, on-call runbooks",               lead: "tania@appycodes.com",  slack_channel_id: "C00OPS",      taskTarget: 5  },
  { slug: "support-portal", name: "Customer support portal", description: "Self-serve ticketing for clients",                 lead: "arjun@appycodes.com",  slack_channel_id: "C00SUPPORT",  taskTarget: 5  },
  { slug: "inbox",          name: "Inbox (uncategorised)",   description: "Default project for /task add fallbacks",          lead: "ritesh@appycodes.com",                                  taskTarget: 4  },
];

// Project-specific task title pools — keeps the seed feeling like real work
const TASK_TITLES: Record<string, string[]> = {
  tasker: [
    "Wire up Slack bot scaffolding",
    "Implement /task add slash command",
    "Manager Heatmap query design",
    "Clockify webhook receiver",
    "Decide project to channel mapping",
    "Apply schema 0001_initial.sql to prod",
    "Sentry quotas for the web app",
    "Daily snapshot cron skeleton",
    "Variance report query draft",
    "RLS policies for Sprint 6 mobile",
    "Reseed staging from prod nightly",
    "Add /api/projects POST endpoint",
    "Block-Kit modal for /task add",
    "Status-change buttons in DM",
  ],
  website: [
    "Pick design system / component library",
    "Migrate landing copy from old site",
    "Set up CMS for blog",
    "New hero section animations",
    "Performance budget for product pages",
    "Cookie banner GDPR copy",
    "Case study template + first three posts",
    "Redirect map from old URLs",
  ],
  "mobile-app": [
    "Field-ops offline sync engine",
    "Push notification stack on iOS",
    "Photo upload retry on flaky network",
    "Switch state mgmt to Zustand",
    "Replace Mapbox with Maplibre",
    "Sentry-rn integration",
    "Crash-free sessions dashboard",
    "Onboarding flow rework",
    "Background location permissions",
    "iPad layout pass",
  ],
  "ml-pipeline": [
    "Backfill 90 days of click events",
    "Feature store schema review",
    "Daily training DAG on Airflow",
    "Eval harness for recsys A/B",
    "Drift detection on top-50 features",
    "Cost report by team",
    "Spot-instance fallback for trainers",
    "Feast → BigQuery exporter",
  ],
  billing: [
    "Stripe customer migration script",
    "Invoice PDF redesign",
    "Refund webhook handling",
    "Tax rules for GST + EU VAT",
    "Dunning emails for failed payments",
    "Pause-subscription flow",
  ],
  "ops-tools": [
    "Admin dashboard for user roles",
    "On-call runbook generator",
    "Slack alert routing rules",
    "Postmortem template + sync",
    "Audit-log viewer",
  ],
  "support-portal": [
    "Ticket submission form",
    "SLA timer per priority",
    "Macro replies for support team",
    "CSAT survey on resolution",
    "Per-client knowledge base",
  ],
  inbox: [
    "Rename test channel mention",
    "Investigate weird timezone bug",
    "Review Q2 vendor invoice",
    "Update org chart in Notion",
  ],
};

// Status / priority / points / due-date distributions (rough percentages)
const STATUS_DIST: Array<["todo" | "in_progress" | "blocked" | "done", number]> = [
  ["todo",        0.50],
  ["in_progress", 0.25],
  ["blocked",     0.10],
  ["done",        0.15],
];
const PRIORITY_DIST: Array<["P0" | "P1" | "P2" | "P3", number]> = [
  ["P0", 0.05],
  ["P1", 0.20],
  ["P2", 0.50],
  ["P3", 0.25],
];
const POINTS_DIST: Array<[1 | 3 | 8, number]> = [
  [1, 0.30],
  [3, 0.50],
  [8, 0.20],
];

// Deterministic PRNG so re-runs of the demo produce the same sample
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

function pick<T>(dist: Array<[T, number]>): T {
  const r = rand();
  let cum = 0;
  for (const [v, p] of dist) {
    cum += p;
    if (r < cum) return v;
  }
  return dist[dist.length - 1]![0];
}

function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Seed steps
// ---------------------------------------------------------------------------
async function seedUsers() {
  console.log(`→ users: upserting ${USERS.length}`);
  const payload = USERS.map((u) => ({
    email: u.email,
    name: u.name,
    role: u.role,
    slack_handle: u.slack_handle ?? null,
    is_active: true,
  }));
  const { error } = await supabase.from("users").upsert(payload, { onConflict: "email" });
  if (error) throw new Error(`users upsert: ${error.message}`);

  const { data, error: selErr } = await supabase.from("users").select("id, email, role");
  if (selErr) throw new Error(selErr.message);
  const byEmail = new Map<string, { id: string; role: Role }>();
  for (const u of data ?? []) byEmail.set(u.email, { id: u.id as string, role: u.role as Role });
  console.log(`  ✓ ${byEmail.size} users in DB`);
  return byEmail;
}

async function seedProjects(userByEmail: Map<string, { id: string; role: Role }>) {
  console.log(`→ projects: upserting ${PROJECTS.length}`);
  const payload = PROJECTS.map((p) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    slack_channel_id: p.slack_channel_id ?? null,
    lead_user_id: userByEmail.get(p.lead)?.id ?? null,
    is_active: true,
  }));
  const { error } = await supabase.from("projects").upsert(payload, { onConflict: "slug" });
  if (error) throw new Error(`projects upsert: ${error.message}`);

  const { data, error: selErr } = await supabase.from("projects").select("id, slug");
  if (selErr) throw new Error(selErr.message);
  const bySlug = new Map<string, string>();
  for (const p of data ?? []) bySlug.set(p.slug, p.id as string);
  console.log(`  ✓ ${bySlug.size} projects in DB`);
  return bySlug;
}

async function seedTasks(
  projectIdBySlug: Map<string, string>,
  userByEmail: Map<string, { id: string; role: Role }>,
) {
  // Snapshot existing task counts per project so we only top up.
  const { data: existing, error } = await supabase.from("tasks").select("project_id");
  if (error) throw new Error(error.message);
  const haveByProject = new Map<string, number>();
  for (const t of existing ?? []) {
    const k = t.project_id as string;
    haveByProject.set(k, (haveByProject.get(k) ?? 0) + 1);
  }

  const userIds = Array.from(userByEmail.values()).map((u) => u.id);
  const tasksToInsert: Array<{
    project_id: string;
    title: string;
    description: string | null;
    status: "todo" | "in_progress" | "blocked" | "done";
    priority: "P0" | "P1" | "P2" | "P3";
    story_points: 1 | 3 | 8;
    assignee_id: string | null;
    creator_id: string;
    due_date: string | null;
  }> = [];

  let totalTarget = 0;

  for (const project of PROJECTS) {
    const projectId = projectIdBySlug.get(project.slug);
    if (!projectId) continue;
    const have = haveByProject.get(projectId) ?? 0;
    const need = Math.max(0, project.taskTarget - have);
    totalTarget += project.taskTarget;
    if (need === 0) continue;

    const titles = (TASK_TITLES[project.slug] ?? [])
      .filter((_, i) => i < project.taskTarget)
      .slice(have, have + need);

    for (const title of titles) {
      const status = pick(STATUS_DIST);
      const priority = pick(PRIORITY_DIST);
      const points = pick(POINTS_DIST);
      const isAssigned = rand() > 0.15 || project.slug !== "inbox"; // inbox has more unassigned
      const assignee_id = isAssigned ? pickFrom(userIds) : null;
      const creator_id = pickFrom(userIds);

      // Mix of past due (overdue), today, near future, far future, and null.
      const dueRoll = rand();
      const due_date =
        dueRoll < 0.15 && status !== "done" ? isoDate(-Math.ceil(rand() * 14)) // overdue
        : dueRoll < 0.45 ? isoDate(Math.ceil(rand() * 7))                       // this week
        : dueRoll < 0.65 ? isoDate(Math.ceil(rand() * 30))                      // this month
        : null;

      tasksToInsert.push({
        project_id: projectId,
        title,
        description: rand() < 0.3 ? null : `Auto-generated demo task for ${project.name}.`,
        status,
        priority,
        story_points: points,
        assignee_id,
        creator_id,
        due_date,
      });
    }
  }

  console.log(`→ tasks: target ${totalTarget}, existing ${existing?.length ?? 0}, inserting ${tasksToInsert.length}`);
  if (tasksToInsert.length === 0) return [];

  const { data: created, error: insErr } = await supabase
    .from("tasks")
    .insert(tasksToInsert)
    .select("*");
  if (insErr) throw new Error(`tasks insert: ${insErr.message}`);
  console.log(`  ✓ ${created?.length ?? 0} tasks created`);
  return created ?? [];
}

async function seedEvents(newTasks: Array<{ id: string; status: string; creator_id: string; title: string; story_points: number; priority: string }>) {
  if (newTasks.length === 0) return;
  type EventRow = {
    task_id: string;
    actor_id: string;
    event_type: "created" | "status_changed" | "points_changed" | "assignee_changed";
    from_value: unknown;
    to_value: unknown;
    metadata?: unknown;
  };
  const events: EventRow[] = [];

  for (const t of newTasks) {
    events.push({
      task_id: t.id,
      actor_id: t.creator_id,
      event_type: "created",
      from_value: null,
      to_value: { title: t.title, status: "todo", priority: t.priority, story_points: t.story_points },
      metadata: { source: "seed_demo" },
    });
    // For tasks not in 'todo', show the status progression.
    if (t.status === "in_progress" || t.status === "done") {
      events.push({
        task_id: t.id,
        actor_id: t.creator_id,
        event_type: "status_changed",
        from_value: { status: "todo" },
        to_value: { status: "in_progress" },
      });
    }
    if (t.status === "done") {
      events.push({
        task_id: t.id,
        actor_id: t.creator_id,
        event_type: "status_changed",
        from_value: { status: "in_progress" },
        to_value: { status: "done" },
      });
    }
    if (t.status === "blocked") {
      events.push({
        task_id: t.id,
        actor_id: t.creator_id,
        event_type: "status_changed",
        from_value: { status: "todo" },
        to_value: { status: "blocked" },
      });
    }
  }

  console.log(`→ task_events: inserting ${events.length}`);
  const { error } = await supabase.from("task_events").insert(events);
  if (error) throw new Error(`task_events insert: ${error.message}`);
  console.log(`  ✓ ${events.length} events written`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}. Did you create .env.local?`);
    process.exit(1);
  }
  return v;
}

function loadDotenv() {
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
  console.log("Tasker demo seeder\n");
  const users = await seedUsers();
  const projects = await seedProjects(users);
  const newTasks = await seedTasks(projects, users);
  await seedEvents(
    newTasks.map((t) => ({
      id: t.id as string,
      status: t.status as string,
      creator_id: t.creator_id as string,
      title: t.title as string,
      story_points: t.story_points as number,
      priority: t.priority as string,
    })),
  );
  console.log("\n✓ demo seed complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
