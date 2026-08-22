import { Router } from 'express';
import { supabase } from '../db/supabase';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { recalculateCommissionForUser } from '../services/BillingCalculator';

const router = Router();
router.use(requireAuth);

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

router.get(
  '/summary',
  asyncHandler(async (req: AuthedRequest, res) => {
    await recalculateCommissionForUser(req.userId!);
    const { data: billing, error } = await supabase
      .from('billing')
      .select('*')
      .eq('user_id', req.userId)
      .eq('month', currentMonth())
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    res.json(
      billing ?? {
        month: currentMonth(),
        calls_made: 0,
        amount_collected: 0,
        commission_owed: 0,
        base_fee: 599,
        total_owed: 599,
        status: 'unpaid',
      }
    );
  })
);

router.get(
  '/history',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await supabase
      .from('billing')
      .select('*')
      .eq('user_id', req.userId)
      .order('month', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    res.json(data);
  })
);

router.get(
  '/:month',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { data, error } = await supabase
      .from('billing')
      .select('*')
      .eq('user_id', req.userId)
      .eq('month', req.params.month)
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw new ApiError(404, 'No billing record for that month');
    res.json(data);
  })
);

export default router;
