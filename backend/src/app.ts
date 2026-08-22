import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import accountsRouter from './routes/accounts';
import authRouter from './routes/auth';
import billingRouter from './routes/billing';
import callsRouter from './routes/calls';
import campaignsRouter from './routes/campaigns';
import escalationsRouter from './routes/escalations';
import eventsRouter from './routes/events';
import reportsRouter from './routes/reports';
import webhooksRouter from './routes/webhooks';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? '*' }));

// Stripe requires the raw body to verify its signature; Twilio posts
// form-encoded, not JSON. Both are mounted ahead of (and excluded from) the
// generic JSON parser below.
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }));
app.post('/webhooks/twilio', express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  if (req.path === '/webhooks/stripe' || req.path === '/webhooks/twilio') return next();
  express.json({ limit: '2mb' })(req, res, next);
});

// Brute-force protection on auth endpoints specifically; webhooks and the
// SSE stream are excluded since they're either trusted third parties or a
// long-lived connection rather than a request burst.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use('/auth/register', authLimiter);
app.use('/auth/login', authLimiter);

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false });
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks/') || req.path.startsWith('/events/')) return next();
  apiLimiter(req, res, next);
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRouter);
app.use('/campaigns', campaignsRouter);
app.use('/campaigns/:id/accounts', accountsRouter);
app.use('/calls', callsRouter);
app.use('/billing', billingRouter);
app.use('/escalations', escalationsRouter);
app.use('/reports', reportsRouter);
app.use('/events', eventsRouter);
app.use('/webhooks', webhooksRouter);

app.use(errorHandler);
