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
| Logging | pino (JSON in production, pretty-printed in dev; redacts tokens/passwords) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) — typecheck + test + build on push/PR |

**Production hardening already in place**: `backend/src/env.ts` validates all config at
startup with zod — a missing required var crashes immediately with a clear message
rather than failing obscurely mid-request; missing Vapi/Twilio/Anthropic/Stripe keys
only warn, since those features are optional until used. `api.ts`/`worker.ts` handle
SIGTERM/SIGINT for graceful shutdown (drain requests, let in-progress BullMQ jobs
finish, close Redis connections). `GET /health/ready` checks Supabase + Redis are
actually reachable. CORS fails closed if `FRONTEND_URL` isn't set (not `*`). BullMQ
Workers get their own dedicated Redis connection, separate from their Queue's —
sharing one is a known footgun since a Worker's blocking calls can stall it.

**Why not Supabase Realtime/Auth**: this backend uses its own JWT auth against a plain
`users` table, so a browser holding only the Supabase anon key has no `auth.uid()` —
Postgres RLS keyed on `auth.uid()` wouldn't scope correctly. Instead, realtime dashboard
updates go through `backend/src/events/eventBus.ts` (Redis pub/sub → SSE), authenticated
with a one-time ticket rather than a JWT in the URL.

## 3. Repo structure

```
backend/            Express API + BullMQ workers (TypeScript)
  src/env.ts           Zod-validated env config — import this, not process.env directly
  src/logger.ts        pino logger (structured JSON in prod, pretty in dev)
  src/app.ts           Express app config (middleware, routes) — no listen()
  src/api.ts           API-only entry point (imports app.ts, calls listen(), graceful shutdown)
  src/worker.ts        Worker-only entry point (BullMQ workers, no Express, graceful shutdown)
  src/index.ts         Combined entry point (api.ts + worker.ts) — used by `npm run dev`
  src/migrate.ts        Standalone migration runner (needs DATABASE_URL) — `npm run migrate`
  src/routes/          One file per resource: auth, campaigns, accounts, calls,
                       billing, escalations, reports, events (SSE), webhooks, health
  src/services/        Vapi/Claude/Twilio/Stripe integration wrappers + BillingCalculator
  src/queues/          BullMQ queue + worker definitions (callAccountsQueue, billingQueue);
                       redis.ts exports a shared Queue connection and a
                       createWorkerConnection() factory (Workers need their own)
  src/events/          Redis-backed pub/sub + SSE fan-out (eventBus.ts)
  src/middleware/      JWT auth guard, error handler
  src/utils/           Pure helpers with unit tests (billingMath, phone)
  src/db/supabase.ts   Supabase client (service_role key; ws polyfill for Node <22)

frontend/            React dashboard (Vite + TypeScript)
  src/pages/           One file per route: Login, Signup, Dashboard, Campaigns,
                       CampaignDetail, AccountDetail (transcript + recording playback),
                       Escalations, Billing, Settings
  src/components/      Layout (nav shell), ProtectedRoute, StatsCard, ErrorBoundary
  src/lib/             api.ts (fetch wrapper with JWT), realtime.ts (SSE hook)
  src/store/           authStore.ts (Zustand, persisted to localStorage)

database/
  migrations/          Numbered SQL files, idempotent (safe to re-run) — tables,
                       indexes, RLS policies. Apply via `npm run migrate` or paste
                       into the SQL Editor.
  seed.sql             Sample data: one demo user, one campaign, three accounts

.github/workflows/ci.yml   CI: typecheck + test + build for both apps
docker-compose.yml         Local Redis + backend-api/backend-worker containers
backend/Dockerfile          Multi-stage build for the backend
frontend/vercel.json        SPA rewrite rule for deploying the frontend to Vercel

config/, docs/       Empty placeholder folders from initial scaffolding — unused
```

## 4. How to run locally

**1. Database (Supabase)** — one-time setup:
Create a project at supabase.com. Then either run `npm run migrate` from `backend/`
(needs `DATABASE_URL`, the direct Postgres connection string — see below), or paste
every file in `database/migrations/` into the SQL Editor in order. Optionally run
`database/seed.sql` for sample data.

**2. Redis** — port `6379`:
```bash
docker compose up redis
```

**3. Backend** — port `4000`:
```bash
cd backend
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIS_URL, JWT_SECRET, PUBLIC_BACKEND_URL, FRONTEND_URL
                        # Vapi/Twilio/Anthropic/Stripe keys can stay blank except for actually placing calls
                        # (missing required vars fail startup immediately with a clear error)
npm install
npm test                # unit tests
npm run migrate          # one-time: applies database/migrations/ (needs DATABASE_URL)
npm run dev              # runs API + worker together — http://localhost:4000
```
Split into separate processes with `npm run dev:api` / `npm run dev:worker` if needed.
Check readiness with `curl http://localhost:4000/health/ready` (verifies Supabase +
Redis are actually reachable, not just that the process is up).

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

## 5. Third-party integration setup (Vapi / Twilio / Stripe)

None of these have been tested against live accounts yet. `PUBLIC_BACKEND_URL` must be
a real, internet-reachable HTTPS URL for any of their webhooks to reach the backend —
`localhost` won't work, so tunnel with `ngrok`/`cloudflared` for local testing and point
each webhook config below at the tunnel URL.

**Vapi** (`backend/src/services/VapiService.ts`, webhook: `routes/webhooks.ts`)
- `VAPI_API_KEY` — Vapi dashboard → API Keys (private key)
- `VAPI_ASSISTANT_ID` — an Assistant created in Vapi; the app overrides its system
  prompt per-call, but the assistant still needs a base voice/model config
- `BUSINESS_PHONE_NUMBER` — a phone number **ID** purchased/imported in Vapi (used as
  `phoneNumberId`, not a raw phone string, despite the env var name)
- `VAPI_WEBHOOK_SECRET` — any long random string you generate yourself
- Setup: on the assistant's **Server URL** webhook config, set it to
  `https://<PUBLIC_BACKEND_URL>/webhooks/vapi` with a custom header
  `x-webhook-secret: <VAPI_WEBHOOK_SECRET>` — checked in `webhooks.ts` to authenticate
  the callback.

**Twilio** (`backend/src/services/TwilioService.ts`, webhook: `routes/webhooks.ts`)
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — Twilio Console dashboard
- `TWILIO_PHONE_NUMBER` — an SMS-capable Twilio number in E.164 format
- Setup: on that number's Messaging config, set the status-callback URL to
  `https://<PUBLIC_BACKEND_URL>/webhooks/twilio`. Signature verification is computed
  against `PUBLIC_BACKEND_URL` exactly, so it must match the publicly reachable URL
  byte-for-byte (scheme + host, no trailing slash).

**Stripe** (`backend/src/services/StripeService.ts`, webhook: `routes/webhooks.ts`)
- `STRIPE_SECRET_KEY` — Stripe Dashboard → Developers → API keys
- `STRIPE_WEBHOOK_SECRET` — generated when the webhook endpoint below is registered
- Setup: Dashboard → Developers → Webhooks → add endpoint
  `https://<PUBLIC_BACKEND_URL>/webhooks/stripe`, subscribe to
  `invoice.payment_succeeded`, copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
  Each agency's `billing` row also needs a `stripe_customer_id` populated (a Stripe
  Customer created for them) before `chargeMonthlyCommission` will work.
