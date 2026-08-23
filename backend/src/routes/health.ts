import { Router } from 'express';
import { supabase } from '../db/supabase';
import { connection } from '../queues/redis';

const router = Router();

// Liveness-only check for load balancers that just need "is the process up".
router.get('/', (_req, res) => res.json({ status: 'ok' }));

// Readiness check: verifies the dependencies this process actually needs to
// serve traffic are reachable. Useful for orchestrators (k8s readiness probe,
// a deploy's post-start smoke check) — a 200 here means real traffic is safe.
router.get('/ready', async (_req, res) => {
  const [supabaseCheck, redisCheck] = await Promise.allSettled([
    supabase.from('users').select('id').limit(1),
    connection.ping(),
  ]);

  const supabaseOk = supabaseCheck.status === 'fulfilled' && !supabaseCheck.value.error;
  const redisOk = redisCheck.status === 'fulfilled';

  const status = supabaseOk && redisOk ? 200 : 503;
  res.status(status).json({
    status: status === 200 ? 'ok' : 'degraded',
    supabase: supabaseOk ? 'ok' : 'unreachable',
    redis: redisOk ? 'ok' : 'unreachable',
  });
});

export default router;
