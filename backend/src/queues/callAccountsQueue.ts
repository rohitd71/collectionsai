import { Queue, Worker } from 'bullmq';
import { supabase } from '../db/supabase';
import { publishEvent } from '../events/eventBus';
import { generateVapiPrompt } from '../services/ClaudeService';
import { initiateVapiCall } from '../services/VapiService';
import { connection } from './redis';

interface CallBatchJob {
  campaign_id: string;
  batch_size: number;
}

export const callAccountsQueue = new Queue<CallBatchJob>('call-accounts', { connection });

export async function queueCallBatch(campaignId: string, batchSize: number) {
  const job = await callAccountsQueue.add('call-batch', { campaign_id: campaignId, batch_size: batchSize });
  return job.id;
}

// Fires every hour for every campaign still marked active.
export async function scheduleHourlyBatches() {
  await callAccountsQueue.add(
    'sweep-active-campaigns',
    { campaign_id: '', batch_size: 500 },
    { repeat: { pattern: '0 * * * *' }, jobId: 'hourly-sweep' }
  );
}

export function startCallAccountsWorker() {
  return new Worker<CallBatchJob>(
    'call-accounts',
    async (job) => {
      if (job.name === 'sweep-active-campaigns') {
        const { data: campaigns } = await supabase.from('campaigns').select('id').eq('status', 'active');
        for (const c of campaigns ?? []) {
          await callAccountsQueue.add('call-batch', { campaign_id: c.id, batch_size: 500 });
        }
        return { campaigns_swept: campaigns?.length ?? 0 };
      }

      const { campaign_id, batch_size } = job.data;
      const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', campaign_id).single();
      if (!campaign || campaign.status !== 'active') return { calls_queued: 0 };

      const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .eq('campaign_id', campaign_id)
        .eq('status', 'pending')
        .limit(batch_size);

      let queued = 0;
      for (const account of accounts ?? []) {
        try {
          const prompt = await generateVapiPrompt(account, campaign);
          const vapiCallId = await initiateVapiCall(account, prompt);

          await supabase.from('calls').insert({
            account_id: account.id,
            vapi_call_id: vapiCallId,
            status: 'in_progress',
            started_at: new Date().toISOString(),
          });
          await supabase
            .from('accounts')
            .update({ status: 'called', call_count: account.call_count + 1 })
            .eq('id', account.id);
          queued += 1;
        } catch (err) {
          console.error(`Failed to call account ${account.id}:`, err);
        }
      }

      if (queued > 0) {
        publishEvent(campaign.user_id, { type: 'campaign.batch_queued', payload: { campaign_id, queued } });
      }

      return { calls_queued: queued };
    },
    { connection }
  );
}
