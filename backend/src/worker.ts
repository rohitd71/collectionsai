import 'dotenv/config';
import { warnOnMissingIntegrations } from './env';
import { closeEventBus } from './events/eventBus';
import { logger } from './logger';
import { billingQueue, scheduleMonthlyBilling, startBillingWorker } from './queues/billingQueue';
import { callAccountsQueue, scheduleHourlyBatches, startCallAccountsWorker } from './queues/callAccountsQueue';
import { connection } from './queues/redis';

// No Express app here — this process only runs the BullMQ workers and their
// recurring schedules. Deploy it as a separate long-running container from
// the HTTP API once you outgrow a single combined instance (see index.ts).
warnOnMissingIntegrations();

const callAccountsWorker = startCallAccountsWorker();
const billingWorker = startBillingWorker();
scheduleHourlyBatches().catch((err) => logger.error({ err }, 'Failed to schedule hourly batches'));
scheduleMonthlyBilling().catch((err) => logger.error({ err }, 'Failed to schedule monthly billing'));

logger.info('Worker process started (call batches + billing)');

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down worker`);
  // Worker.close() waits for in-progress jobs to finish before resolving,
  // so an active call-batch or billing run isn't killed mid-write.
  await Promise.allSettled([
    callAccountsWorker.close(),
    billingWorker.close(),
    callAccountsQueue.close(),
    billingQueue.close(),
    closeEventBus(),
    connection.quit(),
  ]);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
