import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { queueCallBatch } from '../queues/callAccountsQueue';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  tone: z.enum(['professional', 'empathetic', 'aggressive']).default('professional'),
  account_type: z.enum(['credit_card', 'auto_loan', 'medical', 'personal_loan', 'other']).optional(),
  max_retries: z.number().int().min(0).max(10).default(3),
});

const updateSchema = createSchema.partial().extend({
  call_schedule_start: z.string().optional(),
  call_schedule_end: z.string().optional(),
});

// helper: verify the campaign belongs to req.userId, or throw 404
async function loadOwnedCampaign(userId: string, campaignId: string) {
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  return campaign;
}

router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const input = createSchema.parse(req.body);
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .insert({ ...input, user_id: req.userId })
      .select('*')
      .single();
    if (error || !campaign) throw new ApiError(500, error?.message ?? 'Failed to create campaign');
    res.status(201).json(campaign);
  })
);

router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    let query = supabase.from('campaigns').select('*').eq('user_id', req.userId).neq('status', 'deleted');
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    res.json(data);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const campaign = await loadOwnedCampaign(req.userId!, req.params.id);

    const { data: accounts } = await supabase
      .from('accounts')
      .select('status, amount_paid')
      .eq('campaign_id', campaign.id);

    const stats = {
      total_accounts: accounts?.length ?? 0,
      calls_connected: accounts?.filter((a) => a.status === 'connected' || a.status === 'promised' || a.status === 'paid').length ?? 0,
      payments_made: accounts?.filter((a) => a.status === 'paid').length ?? 0,
      amount_collected: (accounts ?? []).reduce((sum, a) => sum + Number(a.amount_paid ?? 0), 0),
    };

    res.json({ campaign, stats });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    await loadOwnedCampaign(req.userId!, req.params.id);
    const updates = updateSchema.parse(req.body);
    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw new ApiError(500, error.message);
    res.json(data);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    await loadOwnedCampaign(req.userId!, req.params.id);
    const { error } = await supabase.from('campaigns').update({ status: 'deleted' }).eq('id', req.params.id);
    if (error) throw new ApiError(500, error.message);
    res.status(204).send();
  })
);

router.post(
  '/:id/launch',
  asyncHandler(async (req: AuthedRequest, res) => {
    const campaign = await loadOwnedCampaign(req.userId!, req.params.id);
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'active', launched_at: new Date().toISOString() })
      .eq('id', campaign.id);
    if (error) throw new ApiError(500, error.message);

    const queued = await queueCallBatch(campaign.id, 500);
    res.json({ status: 'active', queued });
  })
);

router.post(
  '/:id/pause',
  asyncHandler(async (req: AuthedRequest, res) => {
    const campaign = await loadOwnedCampaign(req.userId!, req.params.id);
    const { error } = await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaign.id);
    if (error) throw new ApiError(500, error.message);
    res.json({ status: 'paused' });
  })
);

export default router;
