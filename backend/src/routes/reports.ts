import { Router } from 'express';
import { supabase } from '../db/supabase';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';

const router = Router();
router.use(requireAuth);

async function loadOwnedCampaignId(userId: string, campaignId: string) {
  const { data, error } = await supabase.from('campaigns').select('id').eq('id', campaignId).eq('user_id', userId).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, 'Campaign not found');
  return data.id;
}

function requireCampaignId(req: AuthedRequest) {
  const campaignId = typeof req.query.campaign_id === 'string' ? req.query.campaign_id : undefined;
  if (!campaignId) throw new ApiError(400, 'campaign_id query param is required');
  return campaignId;
}

router.get(
  '/campaign-summary',
  asyncHandler(async (req: AuthedRequest, res) => {
    const campaignId = requireCampaignId(req);
    await loadOwnedCampaignId(req.userId!, campaignId);

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('status, amount_paid, call_count')
      .eq('campaign_id', campaignId);
    if (error) throw new ApiError(500, error.message);

    const totalCalls = (accounts ?? []).reduce((sum, a) => sum + a.call_count, 0);
    const callsConnected = (accounts ?? []).filter((a) => ['connected', 'promised', 'paid'].includes(a.status)).length;
    const paymentsMade = (accounts ?? []).filter((a) => a.status === 'paid').length;
    const totalCollected = (accounts ?? []).reduce((sum, a) => sum + Number(a.amount_paid ?? 0), 0);

    res.json({
      total_calls: totalCalls,
      calls_connected: callsConnected,
      connection_rate: totalCalls > 0 ? callsConnected / totalCalls : 0,
      payments_made: paymentsMade,
      payment_rate: callsConnected > 0 ? paymentsMade / callsConnected : 0,
      total_collected: totalCollected,
      average_collection: paymentsMade > 0 ? totalCollected / paymentsMade : 0,
    });
  })
);

router.get(
  '/daily-breakdown',
  asyncHandler(async (req: AuthedRequest, res) => {
    const campaignId = requireCampaignId(req);
    await loadOwnedCampaignId(req.userId!, campaignId);

    const { data: accountIds } = await supabase.from('accounts').select('id').eq('campaign_id', campaignId);
    const ids = (accountIds ?? []).map((a) => a.id);
    if (ids.length === 0) return res.json([]);

    const { data: calls, error } = await supabase
      .from('calls')
      .select('created_at, outcome')
      .in('account_id', ids);
    if (error) throw new ApiError(500, error.message);

    const byHour = new Map<number, { calls: number; successes: number }>();
    for (let h = 0; h < 24; h++) byHour.set(h, { calls: 0, successes: 0 });

    for (const call of calls ?? []) {
      const hour = new Date(call.created_at).getUTCHours();
      const bucket = byHour.get(hour)!;
      bucket.calls += 1;
      if (call.outcome === 'promised' || call.outcome === 'paid') bucket.successes += 1;
    }

    const breakdown = Array.from(byHour.entries()).map(([hour, { calls: c, successes }]) => ({
      hour,
      calls: c,
      success_rate: c > 0 ? successes / c : 0,
    }));

    res.json(breakdown);
  })
);

function toCsvValue(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

router.get(
  '/export',
  asyncHandler(async (req: AuthedRequest, res) => {
    const campaignId = requireCampaignId(req);
    await loadOwnedCampaignId(req.userId!, campaignId);

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('name, phone, amount_owed, days_overdue, status, amount_paid, payment_date, call_count, notes')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });
    if (error) throw new ApiError(500, error.message);

    const headers = ['name', 'phone', 'amount_owed', 'days_overdue', 'status', 'amount_paid', 'payment_date', 'call_count', 'notes'];
    const rows = (accounts ?? []).map((a) => headers.map((h) => toCsvValue((a as Record<string, unknown>)[h])).join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${campaignId}.csv"`);
    res.send(csv);
  })
);

export default router;
