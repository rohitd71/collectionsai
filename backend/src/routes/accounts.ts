import { parse } from 'csv-parse/sync';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { publishEvent } from '../events/eventBus';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { recalculateCommissionForAccount } from '../services/BillingCalculator';
import { normalizePhone } from '../utils/phone';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const csvRowSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(7),
  amount: z.coerce.number().positive(),
  days_overdue: z.coerce.number().int().nonnegative().default(0),
  account_type: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
});

async function assertCampaignOwned(userId: string, campaignId: string) {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, 'Campaign not found');
}

router.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertCampaignOwned(req.userId!, req.params.id);
    if (!req.file) throw new ApiError(400, 'CSV file is required (field name "file")');

    const records: Record<string, string>[] = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const seenPhones = new Set<string>();
    const valid: Record<string, unknown>[] = [];
    const invalid: { row: number; error: string }[] = [];
    let duplicates = 0;

    records.forEach((raw, i) => {
      const parsed = csvRowSchema.safeParse(raw);
      if (!parsed.success) {
        invalid.push({ row: i + 2, error: parsed.error.issues.map((e) => e.message).join(', ') });
        return;
      }
      const phone = normalizePhone(parsed.data.phone);
      if (seenPhones.has(phone)) {
        duplicates += 1;
        return;
      }
      seenPhones.add(phone);
      valid.push({
        campaign_id: req.params.id,
        name: parsed.data.name,
        phone,
        email: parsed.data.email || null,
        amount_owed: parsed.data.amount,
        days_overdue: parsed.data.days_overdue,
        account_type: parsed.data.account_type || null,
        status: 'pending',
      });
    });

    if (valid.length > 0) {
      const { error } = await supabase.from('accounts').insert(valid);
      if (error) throw new ApiError(500, error.message);
    }

    res.json({
      total: records.length,
      valid: valid.length,
      duplicates,
      invalid,
    });
  })
);

router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertCampaignOwned(req.userId!, req.params.id);
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = 100;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase.from('accounts').select('*', { count: 'exact' }).eq('campaign_id', req.params.id);
    if (typeof req.query.status === 'string') query = query.eq('status', req.query.status);

    const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
    if (error) throw new ApiError(500, error.message);
    res.json({ data, page, page_size: pageSize, total: count ?? 0 });
  })
);

router.get(
  '/:accountId',
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertCampaignOwned(req.userId!, req.params.id);
    const { data: account, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', req.params.accountId)
      .eq('campaign_id', req.params.id)
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!account) throw new ApiError(404, 'Account not found');

    const { data: calls } = await supabase
      .from('calls')
      .select('*')
      .eq('account_id', account.id)
      .order('created_at', { ascending: false });

    res.json({ account, calls: calls ?? [] });
  })
);

const updateAccountSchema = z.object({
  status: z.enum(['pending', 'called', 'connected', 'promised', 'paid', 'escalated']).optional(),
  notes: z.string().optional(),
  amount_paid: z.number().nonnegative().optional(),
  payment_date: z.string().optional(),
});

router.patch(
  '/:accountId',
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertCampaignOwned(req.userId!, req.params.id);
    const updates = updateAccountSchema.parse(req.body);
    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', req.params.accountId)
      .eq('campaign_id', req.params.id)
      .select('*')
      .single();
    if (error) throw new ApiError(500, error.message);

    // amount_paid changed on a debt collections account -> commission owed changes too.
    if (updates.amount_paid !== undefined) {
      await recalculateCommissionForAccount(data);
    }

    publishEvent(req.userId!, { type: 'account.updated', payload: { account_id: data.id, campaign_id: data.campaign_id } });

    res.json(data);
  })
);

router.delete(
  '/:accountId',
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertCampaignOwned(req.userId!, req.params.id);
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', req.params.accountId)
      .eq('campaign_id', req.params.id);
    if (error) throw new ApiError(500, error.message);
    res.status(204).send();
  })
);

export default router;
