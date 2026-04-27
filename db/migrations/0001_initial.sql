-- =============================================================================
-- Tasker Sprint 1 — initial schema
-- 6 tables · 4 enums · 1 sequence
-- Run inside the Supabase SQL editor (or psql) on a fresh database.
-- =============================================================================

set search_path = public;

-- -----------------------------------------------------------------------------
-- Extensions (must be installed before any table that uses their types)
-- -----------------------------------------------------------------------------
create extension if not exists citext;
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Enums (4)
-- -----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'manager', 'lead', 'dev');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('todo', 'in_progress', 'blocked', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('P0', 'P1', 'P2', 'P3');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_event_type as enum (
    'created',
    'status_changed',
    'assignee_changed',
    'points_changed',
    'priority_changed',
    'due_date_changed',
    'project_changed',
    'title_changed',
    'description_changed'
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Global task ID sequence — T-1, T-2, T-247
-- -----------------------------------------------------------------------------
create sequence if not exists task_seq start with 1;

-- -----------------------------------------------------------------------------
-- Helper: updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Table: users (seeded only — no silent account creation)
-- -----------------------------------------------------------------------------
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  email           citext unique not null,
  name            text not null,
  slack_user_id   text unique,
  slack_handle    text,
  clockify_user_id text,
  role            user_role not null default 'dev',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

create index if not exists ix_users_role     on users (role);
create index if not exists ix_users_active   on users (is_active);

-- -----------------------------------------------------------------------------
-- Table: projects
-- -----------------------------------------------------------------------------
create table if not exists projects (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  description       text,
  slack_channel_id  text unique,
  lead_user_id      uuid references users (id),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_projects_updated_at on projects;
create trigger trg_projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

create index if not exists ix_projects_active on projects (is_active);

-- -----------------------------------------------------------------------------
-- Table: tasks (id = 'T-<seq>')
-- -----------------------------------------------------------------------------
create table if not exists tasks (
  id              text primary key default ('T-' || nextval('task_seq')),
  project_id      uuid not null references projects (id),
  title           text not null,
  description     text,
  status          task_status not null default 'todo',
  priority        task_priority not null default 'P2',
  story_points    smallint not null default 3,
  assignee_id     uuid references users (id),
  creator_id      uuid not null references users (id),
  due_date        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 20-point tasks are rejected at the API with a "break it down" message,
  -- so they should never reach the DB. Defense in depth: enforce the same.
  constraint tasks_points_allowed check (story_points in (1, 3, 8))
);

drop trigger if exists trg_tasks_updated_at on tasks;
create trigger trg_tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- Hot-query indexes (per spec)
create index if not exists ix_tasks_assignee_status on tasks (assignee_id, status);
create index if not exists ix_tasks_project_status  on tasks (project_id, status);

-- Partial index on due_date for OPEN tasks only
create index if not exists ix_tasks_due_open
  on tasks (due_date)
  where status in ('todo', 'in_progress', 'blocked')
    and due_date is not null;

-- -----------------------------------------------------------------------------
-- Table: task_events  (APPEND-ONLY — every mutation writes a row)
-- -----------------------------------------------------------------------------
create table if not exists task_events (
  id          bigserial primary key,
  task_id     text not null references tasks (id) on delete cascade,
  actor_id    uuid not null references users (id),
  event_type  task_event_type not null,
  from_value  jsonb,
  to_value    jsonb,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists ix_task_events_task    on task_events (task_id, created_at desc);
create index if not exists ix_task_events_actor   on task_events (actor_id, created_at desc);
create index if not exists ix_task_events_type    on task_events (event_type, created_at desc);

-- Block UPDATE / DELETE on task_events (enforced even from service-role for safety)
create or replace function task_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'task_events is append-only (% % blocked)', tg_op, tg_table_name;
end $$;

drop trigger if exists trg_task_events_no_update on task_events;
create trigger trg_task_events_no_update
  before update or delete on task_events
  for each row execute function task_events_immutable();

-- -----------------------------------------------------------------------------
-- Table: time_entries  (Sprint 4 — Clockify sync; created empty in Sprint 1)
-- -----------------------------------------------------------------------------
create table if not exists time_entries (
  id                  bigserial primary key,
  task_id             text references tasks (id) on delete set null,
  user_id             uuid not null references users (id),
  clockify_entry_id   text unique,
  description         text,
  started_at          timestamptz not null,
  ended_at            timestamptz,
  duration_seconds    integer,
  created_at          timestamptz not null default now()
);

create index if not exists ix_time_entries_task on time_entries (task_id, started_at desc);
create index if not exists ix_time_entries_user on time_entries (user_id, started_at desc);

-- -----------------------------------------------------------------------------
-- Table: daily_snapshots  (Sprint 5 — cron-populated; powers Manager Heatmap)
-- -----------------------------------------------------------------------------
create table if not exists daily_snapshots (
  id                  bigserial primary key,
  user_id             uuid not null references users (id),
  snapshot_date       date not null,
  open_tasks          integer not null default 0,
  in_progress_tasks   integer not null default 0,
  blocked_tasks       integer not null default 0,
  done_tasks          integer not null default 0,
  open_points         integer not null default 0,
  done_points         integer not null default 0,
  hours_logged        numeric(6,2) not null default 0,
  created_at          timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index if not exists ix_daily_snapshots_user on daily_snapshots (user_id, snapshot_date desc);
create index if not exists ix_daily_snapshots_date on daily_snapshots (snapshot_date);

-- =============================================================================
-- End of 0001_initial.sql
-- =============================================================================
