import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    let query = supabase
      .from('escalations')
      .select('*, calls!inner(id, account_id, accounts!inner(id, name, phone, campaign_id, campaigns!inner(id, name, user_id)))')
      .eq('calls.accounts.campaigns.user_id', req.userId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    res.json(data);
  })
);

async function loadOwnedEscalation(userId: string, escalationId: string) {
  const { data, error } = await supabase
    .from('escalations')
    .select('*, calls!inner(id, accounts!inner(id, campaign_id, campaigns!inner(user_id)))')
    .eq('id', escalationId)
    .eq('calls.accounts.campaigns.user_id', userId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, 'Escalation not found');
  return data;
}

const updateSchema = z.object({
  status: z.enum(['open', 'resolved']).optional(),
  agent_assigned: z.string().optional(),
  notes: z.string().optional(),
});

router.patch(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    await loadOwnedEscalation(req.userId!, req.params.id);
    const updates = updateSchema.parse(req.body);

    const { data, error } = await supabase
      .from('escalations')
      .update({
        ...updates,
        resolved_at: updates.status === 'resolved' ? new Date().toISOString() : undefined,
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw new ApiError(500, error.message);
    res.json(data);
  })
);

export default router;
