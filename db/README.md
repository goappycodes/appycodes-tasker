# Database

Schema lives in `migrations/` as plain SQL files, applied in numeric order.

## Apply migrations

The simplest path for Sprint 1 is to paste each file into the Supabase SQL Editor. From the CLI:

```bash
psql "$SUPABASE_DB_URL" -f db/migrations/0001_initial.sql
```

`SUPABASE_DB_URL` is the connection string from **Supabase → Project Settings → Database → Connection string (URI)**.

## Verify (T-002 acceptance)

```sql
\dt                              -- expect 6 tables
select typname from pg_type where typname in
  ('user_role','task_status','task_priority','task_event_type'); -- 4 rows
select last_value from task_seq; -- 1
```

## Conventions

- One file per migration. Filenames `NNNN_description.sql`. Never edit a shipped migration; add a new file.
- Migrations must be idempotent (`if not exists`, `do $$ begin … exception when duplicate_object then null; end $$`).
- All schema changes go through this folder. No ad-hoc edits in the Supabase UI on shared environments.
