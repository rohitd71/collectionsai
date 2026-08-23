import { z } from 'zod';

// Validated once at process startup. A missing *required* var fails fast with
// a clear message instead of surfacing later as a cryptic runtime error deep
// in a request handler. Third-party integration keys are optional so the app
// stays runnable for local dev/testing before Vapi/Twilio/Stripe/Anthropic
// are wired up — but each is required the moment its own feature is used, so
// we warn loudly at startup instead of failing silently later.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  PUBLIC_BACKEND_URL: z.string().url(),
  FRONTEND_URL: z.string().url().optional(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  VAPI_API_KEY: z.string().optional(),
  VAPI_ASSISTANT_ID: z.string().optional(),
  BUSINESS_PHONE_NUMBER: z.string().optional(),
  VAPI_WEBHOOK_SECRET: z.string().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

const INTEGRATION_GROUPS: Array<{ label: string; keys: (keyof typeof env)[] }> = [
  { label: 'Vapi (voice calls)', keys: ['VAPI_API_KEY', 'VAPI_ASSISTANT_ID', 'BUSINESS_PHONE_NUMBER'] },
  { label: 'Twilio (SMS)', keys: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'] },
  { label: 'Anthropic (Claude)', keys: ['ANTHROPIC_API_KEY'] },
  { label: 'Stripe (billing)', keys: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
];

// Called once from the API/worker entry points, not at import time, so a
// script that only needs Supabase (e.g. migrate.ts) doesn't get spurious
// warnings about keys it never touches.
export function warnOnMissingIntegrations() {
  for (const group of INTEGRATION_GROUPS) {
    const missing = group.keys.filter((key) => !env[key]);
    if (missing.length > 0 && missing.length < group.keys.length) {
      console.warn(`[env] ${group.label} is partially configured — missing: ${missing.join(', ')}`);
    } else if (missing.length === group.keys.length) {
      console.warn(`[env] ${group.label} is not configured — that feature will fail if used.`);
    }
  }
  if (env.NODE_ENV === 'production' && !env.FRONTEND_URL) {
    console.warn('[env] FRONTEND_URL is not set in production — CORS will reject all cross-origin requests.');
  }
}
