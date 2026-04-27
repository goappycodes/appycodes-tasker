-- =============================================================================
-- Tasker Sprint 2 — column additions
-- No new tables. Adds project.code/client_name/status, task completion +
-- blocker_reason, and per-user capacity. Idempotent.
-- =============================================================================

set search_path = public;

-- 1. New enum for project lifecycle status
do $$ begin
  create type project_status as enum ('active', 'paused', 'done');
exception when duplicate_object then null; end $$;

-- 2. projects: code, client_name, status
alter table projects
  add column if not exists code        text,
  add column if not exists client_name text,
  add column if not exists status      project_status not null default 'active';

-- Backfill `code` from existing slug for projects that don't have one yet.
-- Strips non-alphanumerics, takes first 4 chars, uppercases. Sufficient for
-- the demo seed; new projects validate against /^[A-Z]{2,6}$/ at the API.
update projects
   set code = upper(substring(regexp_replace(slug, '[^a-zA-Z0-9]', '', 'g') from 1 for 4))
 where code is null;

-- Mirror the legacy `is_active` flag into the new enum so downstream code can
-- migrate over time without breaking either side.
update projects
   set status = case when is_active then 'active'::project_status
                     else 'paused'::project_status end
 where (is_active = true  and status <> 'active')
    or (is_active = false and status =  'active');

-- After backfill, lock down code: unique, format-checked, not null
do $$ begin
  alter table projects add constraint projects_code_unique unique (code);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table projects add constraint projects_code_format check (code ~ '^[A-Z]{2,6}$');
exception when duplicate_object then null; end $$;

alter table projects alter column code set not null;

create index if not exists ix_projects_status on projects (status);

-- 3. tasks: completed_at, blocker_reason
alter table tasks
  add column if not exists completed_at   timestamptz,
  add column if not exists blocker_reason text;

-- 4. users: capacity_hours_per_day (Manager Heatmap input — used in Sprint 3+)
alter table users
  add column if not exists capacity_hours_per_day numeric(4,2) default 6.5;

-- =============================================================================
-- End of 0002_sprint2.sql
-- =============================================================================
