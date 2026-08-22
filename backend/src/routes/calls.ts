import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { generateVapiPrompt } from '../services/ClaudeService';
import { initiateVapiCall } from '../services/VapiService';

const router = Router();
router.use(requireAuth);

// Loads a call and confirms it belongs (via account -> campaign) to the caller.
async function loadOwnedCall(userId: string, callId: string) {
  const { data: call, error } = await supabase
    .from('calls')
    .select('*, accounts!inner(*, campaigns!inner(user_id))')
    .eq('id', callId)
    .eq('accounts.campaigns.user_id', userId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!call) throw new ApiError(404, 'Call not found');
  return call;
}

const initiateSchema = z.object({
  account_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
});

router.post(
  '/initiate',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { account_id, campaign_id } = initiateSchema.parse(req.body);

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .eq('user_id', req.userId)
      .maybeSingle();
    if (!campaign) throw new ApiError(404, 'Campaign not found');

    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', account_id)
      .eq('campaign_id', campaign_id)
      .maybeSingle();
    if (!account) throw new ApiError(404, 'Account not found');

    const prompt = await generateVapiPrompt(account, campaign);
    const vapiCallId = await initiateVapiCall(account, prompt);

    const { data: call, error } = await supabase
      .from('calls')
      .insert({ account_id, vapi_call_id: vapiCallId, status: 'in_progress', started_at: new Date().toISOString() })
      .select('*')
      .single();
    if (error) throw new ApiError(500, error.message);

    await supabase.from('accounts').update({ status: 'called', call_count: account.call_count + 1 }).eq('id', account_id);

    res.status(201).json({ call_id: call.id, vapi_reference: vapiCallId });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const call = await loadOwnedCall(req.userId!, req.params.id);
    res.json(call);
  })
);

const escalateSchema = z.object({
  reason: z.enum(['dispute', 'hardship', 'hostility', 'manager_request', 'compliance_concern']),
  notes: z.string().optional(),
});

router.post(
  '/:id/escalate',
  asyncHandler(async (req: AuthedRequest, res) => {
    const call = await loadOwnedCall(req.userId!, req.params.id);
    const { reason, notes } = escalateSchema.parse(req.body);

    await supabase.from('calls').update({ status: 'escalated' }).eq('id', call.id);
    const { data: escalation, error } = await supabase
      .from('escalations')
      .insert({ call_id: call.id, reason, notes, status: 'open' })
      .select('*')
      .single();
    if (error) throw new ApiError(500, error.message);

    res.status(201).json(escalation);
  })
);

export default router;
