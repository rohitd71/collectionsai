# AI Collections SaaS

AI voice-agent debt collection platform: campaign management, CSV account upload,
Vapi-driven calls, Claude-based transcript analysis, Twilio SMS follow-up, live
dashboard updates, escalation handling, and Stripe commission billing.

## Structure

- `frontend/` — React (Vite) + Tailwind dashboard
- `backend/` — Node/Express API, webhooks, realtime event stream, and BullMQ job queue
- `database/migrations/` — Supabase (Postgres) schema, run in numeric order
- `database/seed.sql` — sample data for local dev
- `.github/workflows/ci.yml` — typecheck/test/build on every push and PR

## Local setup

1. **Database**: create a Supabase project. Then either:
   - `cd backend && cp .env.example .env`, fill in `DATABASE_URL` (Settings ->
     Database -> Connection string — the direct one, not the service_role key),
     and run `npm run migrate` — applies every file in `database/migrations/`
     in order, tracked in a `schema_migrations` table so re-running is a no-op, or
   - paste each file in `database/migrations/` into the SQL Editor manually, in
     order.

   Optionally run `database/seed.sql` (via the SQL Editor) for sample data.

2. **Redis** (job queue + realtime pub/sub): `docker compose up redis`, or any
   local/hosted Redis instance.

3. **Backend**:
   ```bash
   cd backend
   cp .env.example .env   # fill in Supabase, Redis, JWT_SECRET; Vapi/Twilio/Anthropic/Stripe optional locally
   npm install
   npm test                # unit tests (billing math, phone normalization)
   npm run dev              # http://localhost:4000 — fails fast with a clear
                            # error if a required var is missing/malformed;
                            # warns (doesn't fail) about unconfigured Vapi/
                            # Twilio/Anthropic/Stripe keys
   ```
   `GET /health` is a plain liveness check; `GET /health/ready` also verifies
   Supabase and Redis are actually reachable — point an orchestrator's
   readiness probe at the latter.

4. **Frontend**:
   ```bash
   cd frontend
   cp .env.example .env
   npm install
   npm run dev             # http://localhost:5173
   ```

5. Log in with the seeded demo user (`demo@agency.test` / `password123`) once
   you've run `seed.sql`, or sign up a fresh account from the UI.

## What's implemented

- **Auth**: register/login/JWT.
- **Campaigns**: CRUD, launch/pause, live stats.
- **Accounts**: CSV upload with validation/dedup, per-account status updates.
- **Calls**: manual initiation, Vapi webhook ingestion, Claude transcript
  analysis, automatic SMS follow-up via Twilio. No-answer/voicemail/busy calls
  are classified separately from real conversations and automatically
  requeued for another attempt up to the campaign's `max_retries`.
- **Call/account detail UI**: per-account call history with transcript
  viewer, recording playback, and manual escalate action.
- **Escalations**: list + resolve (dispute/hardship/hostility/manager_request).
- **Billing**: monthly commission calculation, Stripe invoicing, payment webhook.
- **Reports**: campaign summary, hourly call breakdown, CSV export.
- **Settings page**: edit company name, view the exact webhook URLs to paste
  into the Vapi/Twilio/Stripe dashboards.
- **Realtime dashboard updates**: see "Realtime architecture" below.
- **Security**: rate limiting on auth endpoints, Twilio/Stripe/Vapi webhook
  signature verification, RLS policies on every table, bcrypt password hashing.
- **CI**: GitHub Actions runs typecheck + tests + build on every push/PR.
- **Deployment**: `backend/Dockerfile` + `docker-compose.yml` running the API
  and job-queue worker as separate processes/containers, `frontend/vercel.json`
  for the SPA.
- **Production hardening**: fail-fast env validation (`backend/src/env.ts`) —
  missing required config crashes at startup with a clear message instead of
  failing obscurely mid-request; structured JSON logging via pino
  (`backend/src/logger.ts`, redacts tokens/passwords, pretty-printed in dev);
  graceful shutdown on SIGTERM/SIGINT (drains in-flight requests, waits for
  in-progress BullMQ jobs to finish, closes Redis connections); a
  dependency-checking `/health/ready` endpoint; CORS that fails closed (no
  `FRONTEND_URL` configured means no browser origin is trusted, not "allow
  everything"); and a `DATABASE_URL`-based migration runner
  (`backend/src/migrate.ts`) replacing manual SQL-editor pasting. Also fixed:
  BullMQ Workers now get their own dedicated Redis connection instead of
  sharing one with their Queue — a shared connection's blocking calls can
  stall unrelated commands under real load.

## Realtime architecture (a deliberate deviation from the original spec)

The original design called for the frontend to subscribe directly to Supabase
Realtime. That assumes Supabase Auth issuing the JWTs so Postgres RLS can key
policies off `auth.uid()`. This backend uses its own bcrypt/JWT auth against a
plain `users` table instead (simpler to reason about, no Supabase Auth
lock-in) — which means a browser holding only the Supabase anon key has no
`auth.uid()`, so RLS would either block everything or (if misconfigured) leak
cross-tenant data.

Instead, the backend runs its own event bus: domain events (`call.completed`,
`account.updated`, `campaign.batch_queued`) are published to Redis and fanned
out over Server-Sent Events to the specific authenticated user's browser tabs
(`backend/src/events/eventBus.ts`, `backend/src/routes/events.ts`,
`frontend/src/lib/realtime.ts`). The frontend authenticates the SSE connection
with a one-time, 30-second ticket (minted from an already-authenticated
request) rather than a JWT in the URL, since `EventSource` can't send custom
headers and a long-lived token in a query string ends up in logs. Each page
also keeps a 60s fallback poll in case the stream drops.

## Deploying

- **Frontend**: deploy `frontend/` to Vercel as a static Vite build; `vercel.json`
  handles SPA client-side routing.
- **Backend**: needs a persistent process, not serverless functions — it holds
  open SSE connections and runs BullMQ workers. Deploy `backend/Dockerfile` to
  a host that runs long-lived containers (Render, Railway, Fly.io, ECS, etc.),
  pointed at your production Supabase, Redis, Vapi, Twilio, Anthropic, and
  Stripe credentials. The image ships four entry points:
  - `src/index.ts` — API + worker combined in one process (local dev default).
  - `src/api.ts` / `src/worker.ts` — the same split into two processes, so a
    traffic spike on the API can't starve call/billing jobs and vice versa.
    `docker-compose.yml` runs these as separate `backend-api` and
    `backend-worker` services; use `npm run dev:api` / `npm run dev:worker`
    (or `start:api` / `start:worker` for the built output) to run them apart
    outside Docker too.
- Set `PUBLIC_BACKEND_URL` to the backend's real public URL in production —
  Twilio's webhook signature is computed over the exact URL it POSTed to, so
  this must be exact or SMS status webhooks will be rejected.

## Not yet implemented

- Account "likelihood to pay" scoring (the docs described a `scoreAccount`
  Claude call; not built — nothing in the UI would surface it yet)
- Automated E2E tests. The core flow (register -> login -> create campaign ->
  upload CSV -> read back stats) has been manually verified end-to-end against
  a real Supabase project, but there's no automated test suite driving that —
  unit tests cover pure logic only (billing math, phone normalization). Vapi/
  Twilio/Stripe call-placement paths are implemented but have never run
  against live third-party accounts.
- Multi-region/HA Redis for the job queue and realtime pub/sub (a single
  instance is assumed throughout)
- `npm run migrate` is implemented and typechecked but hasn't been run against
  a live database from this environment (needs `DATABASE_URL`, the direct
  Postgres connection string with its password — a more sensitive credential
  than the service_role key already in use, so it wasn't requested)
