# Tasker — AppyCodes Task OS

Internal task management platform for AppyCodes. Slack is the verb, the web app is the noun.

This repo currently implements **Sprint 1 — Foundation**: Next.js 14 app, Supabase schema, Slack OAuth login restricted to seeded users, CRUD APIs with zod, append-only `task_events`, seed importer, placeholder dashboard, and logging baseline.

## Stack

- **Next.js 14** (App Router, TypeScript, Tailwind)
- **Vercel** (auto-deploys this repo)
- **Supabase Postgres** (server-side service-role only — no RLS in v1)
- **Slack OAuth** (sign-in only; bot/slash commands land in Sprint 2)
- **Pino** structured logging, **Sentry** for exceptions

## Repo layout

```
app/                Next.js App Router (pages + /api/* routes)
components/         React UI components
db/migrations/      Supabase SQL migrations
lib/                Server-side helpers (auth, db, validation, logging)
scripts/            CLI scripts (seed importer)
types/              Shared types
workers/            Cloudflare workers (Sprint 5 cron)
seed/               Local-only seed inputs (gitignored)
```

## Getting started

### Prerequisites (Day 0)

- Node 20+
- Supabase project (region: Singapore)
- Slack app (`api.slack.com/apps`) named "Tasker"
- Cloudflare Pages project pointed at this repo
- `seed/users.csv`, `seed/projects.csv`, `seed/trello-export.json` prepared

### Local setup

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev
```

Visit `http://localhost:3000`.

### Apply the schema

Run `db/migrations/0001_initial.sql` against your Supabase database (Supabase SQL Editor or `psql`).

### Seed data

```bash
npm run seed
```

### Deploy to Vercel

1. Import this repo in the Vercel dashboard.
2. Set the env vars listed in `.env.example` (use the Production scope; Preview/Development are optional).
3. After the first deploy, add the production URL's callback to the Slack app:
   `https://<your-vercel-domain>/api/auth/slack/callback`
4. Update `SLACK_REDIRECT_URI` and `APP_URL` in Vercel env vars to match.

Vercel auto-builds on push to `main`. PRs get preview deployments automatically.

## Sprint 1 acceptance demo (Friday EOD)

All seven must pass.

1. Visit production URL → login renders.
2. Sign in with Slack → land on `/dashboard`.
3. `SELECT * FROM users` returns ~40 rows.
4. `SELECT count(*) FROM tasks` shows imported Trello backlog.
5. `GET /api/tasks?assignee={your_id}` returns valid JSON.
6. `POST /api/tasks` writes a row to `task_events` automatically.
7. `/dashboard` shows your tasks; clicking one shows detail + events.

## Out of scope (later sprints)

Slack bot · My Day · Manager Heatmap · Project Health · Clockify integration · cron jobs · variance reports · RLS.
