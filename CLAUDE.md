# CLAUDE.md

Context for Claude Code sessions working in this repo.

## 1. Project overview

AI Collections is an AI voice-agent debt collection SaaS. Collection agencies upload a
CSV of debtor accounts into a campaign; the backend has Claude generate a personalized
call script per account, Vapi places the outbound call, Claude analyzes the resulting
transcript for payment commitments, and Twilio sends a follow-up SMS. Agencies track
everything (calls, transcripts, recordings, escalations, commission owed) from a React
dashboard with live updates.

**Current stage**: functional MVP, verified end-to-end against a real Supabase project
(register → login → create campaign → upload CSV → view stats all confirmed working).
Vapi/Twilio/Stripe/Anthropic integrations are implemented but untested against live
third-party accounts — no calls have actually been placed yet. No automated E2E tests;
unit tests cover pure logic only (billing math, phone normalization).

## 2. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + TypeScript, Tailwind CSS, React Query, Zustand, React Router 7 |
| Backend | Node.js + Express + TypeScript, Zod for validation |
| Database | Supabase (Postgres) — accessed via `@supabase/supabase-js` with the **service_role** key; RLS policies exist on every table but the backend enforces tenant scoping itself since it bypasses RLS |
| Job queue | BullMQ on Redis (hourly call batches, monthly billing) |
| Realtime | Custom SSE event bus over Redis pub/sub (**not** Supabase Realtime — see note below) |
| Auth | Custom bcrypt + JWT, own `users` table (not Supabase Auth) |
| Third-party APIs | Vapi (voice calls), Twilio (SMS), Anthropic Claude (`claude-sonnet-5` — prompt generation + transcript analysis), Stripe (commission billing) |
| Testing | Vitest (backend unit tests only) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) — typecheck + test + build on push/PR |

**Why not Supabase Realtime/Auth**: this backend uses its own JWT auth against a plain
`users` table, so a browser holding only the Supabase anon key has no `auth.uid()` —
Postgres RLS keyed on `auth.uid()` wouldn't scope correctly. Instead, realtime dashboard
updates go through `backend/src/events/eventBus.ts` (Redis pub/sub → SSE), authenticated
with a one-time ticket rather than a JWT in the URL.

## 3. Repo structure

```
backend/            Express API + BullMQ workers (TypeScript)
  src/app.ts           Express app config (middleware, routes) — no listen()
  src/api.ts           API-only entry point (imports app.ts, calls listen())
  src/worker.ts        Worker-only entry point (BullMQ workers, no Express)
  src/index.ts         Combined entry point (api.ts + worker.ts) — used by `npm run dev`
  src/routes/          One file per resource: auth, campaigns, accounts, calls,
                       billing, escalations, reports, events (SSE), webhooks
  src/services/        Vapi/Claude/Twilio/Stripe integration wrappers + BillingCalculator
  src/queues/          BullMQ queue + worker definitions (callAccountsQueue, billingQueue)
  src/events/          Redis-backed pub/sub + SSE fan-out (eventBus.ts)
  src/middleware/      JWT auth guard, error handler
  src/utils/           Pure helpers with unit tests (billingMath, phone)
  src/db/supabase.ts   Supabase client (service_role key; ws polyfill for Node <22)

frontend/            React dashboard (Vite + TypeScript)
  src/pages/           One file per route: Login, Signup, Dashboard, Campaigns,
                       CampaignDetail, AccountDetail (transcript + recording playback),
                       Escalations, Billing, Settings
  src/components/      Layout (nav shell), ProtectedRoute, StatsCard
  src/lib/             api.ts (fetch wrapper with JWT), realtime.ts (SSE hook)
  src/store/           authStore.ts (Zustand, persisted to localStorage)

database/
  migrations/          Numbered SQL files (run in order) — tables, indexes, RLS policies
  seed.sql             Sample data: one demo user, one campaign, three accounts

.github/workflows/ci.yml   CI: typecheck + test + build for both apps
docker-compose.yml         Local Redis + backend-api/backend-worker containers
backend/Dockerfile          Multi-stage build for the backend
frontend/vercel.json        SPA rewrite rule for deploying the frontend to Vercel

config/, docs/       Empty placeholder folders from initial scaffolding — unused
```

## 4. How to run locally

**1. Database (Supabase)** — one-time setup:
Create a project at supabase.com, then run every file in `database/migrations/` in
order via the SQL Editor (or concatenate them into one paste). Optionally run
`database/seed.sql` for sample data.

**2. Redis** — port `6379`:
```bash
docker compose up redis
```

**3. Backend** — port `4000`:
```bash
cd backend
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIS_URL, JWT_SECRET
                        # Vapi/Twilio/Anthropic/Stripe keys can stay blank except for actually placing calls
npm install
npm test                # unit tests
npm run dev              # runs API + worker together — http://localhost:4000
```
Split into separate processes with `npm run dev:api` / `npm run dev:worker` if needed.

**4. Frontend** — port `5173`:
```bash
cd frontend
cp .env.example .env    # VITE_API_URL=http://localhost:4000
npm install
npm run dev              # http://localhost:5173
```

**Seeded demo login** (after running `database/seed.sql`):
- Email: `demo@agency.test`
- Password: `password123`
