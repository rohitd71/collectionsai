import 'dotenv/config';
import { scheduleHourlyBatches, startCallAccountsWorker } from './queues/callAccountsQueue';
import { scheduleMonthlyBilling, startBillingWorker } from './queues/billingQueue';

// No Express app here — this process only runs the BullMQ workers and their
// recurring schedules. Deploy it as a separate long-running container from
// the HTTP API once you outgrow a single combined instance (see index.ts).
startCallAccountsWorker();
startBillingWorker();
scheduleHourlyBatches().catch((err) => console.error('Failed to schedule hourly batches:', err));
scheduleMonthlyBilling().catch((err) => console.error('Failed to schedule monthly billing:', err));

console.log('Worker process started (call batches + billing).');
