import { Queue, Worker } from 'bullmq';
import { supabase } from '../db/supabase';
import { recalculateCommissionForUser } from '../services/BillingCalculator';
import { chargeMonthlyCommission } from '../services/StripeService';
import { connection, createWorkerConnection } from './redis';

export const billingQueue = new Queue('billing', { connection });

// Runs at midnight on the 1st of each month.
export async function scheduleMonthlyBilling() {
  await billingQueue.add('charge-all-customers', {}, { repeat: { pattern: '0 0 1 * *' }, jobId: 'monthly-billing' });
}

export function startBillingWorker() {
  return new Worker(
    'billing',
    async () => {
      const previousMonth = new Date();
      previousMonth.setMonth(previousMonth.getMonth() - 1);
      const month = previousMonth.toISOString().slice(0, 7);

      const { data: users } = await supabase.from('users').select('id, stripe_customer_id');
      let billed = 0;
      for (const user of users ?? []) {
        await recalculateCommissionForUser(user.id);
        const { data: billing } = await supabase
          .from('billing')
          .select('*')
          .eq('user_id', user.id)
          .eq('month', month)
          .maybeSingle();
        if (!billing || billing.status !== 'unpaid' || !user.stripe_customer_id) continue;

        await chargeMonthlyCommission(user.stripe_customer_id, billing);
        billed += 1;
      }
      return { users_billed: billed };
    },
    { connection: createWorkerConnection() }
  );
}
