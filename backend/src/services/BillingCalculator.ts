import { supabase } from '../db/supabase';
import { computeCommission } from '../utils/billingMath';

const COMMISSION_RATE = 0.06;
const BASE_FEE = 599;

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

interface Account {
  campaign_id: string;
}

// Recomputes this month's billing row for the account's owning user from
// scratch (sum of amount_paid across all their accounts this month), rather
// than incrementing, so edits/corrections to amount_paid stay consistent.
export async function recalculateCommissionForAccount(account: Account) {
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('user_id')
    .eq('id', account.campaign_id)
    .single();
  if (!campaign) return;

  await recalculateCommissionForUser(campaign.user_id);
}

export async function recalculateCommissionForUser(userId: string) {
  const month = currentMonth();
  const monthStart = `${month}-01`;

  const { data: campaigns } = await supabase.from('campaigns').select('id').eq('user_id', userId);
  const campaignIds = (campaigns ?? []).map((c) => c.id);
  if (campaignIds.length === 0) return;

  const { data: accounts } = await supabase
    .from('accounts')
    .select('amount_paid, payment_date')
    .in('campaign_id', campaignIds)
    .gte('payment_date', monthStart);

  const { count: callsMade } = await supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .in(
      'account_id',
      (
        await supabase.from('accounts').select('id').in('campaign_id', campaignIds)
      ).data?.map((a) => a.id) ?? []
    )
    .gte('created_at', monthStart);

  const amountCollected = (accounts ?? []).reduce((sum, a) => sum + Number(a.amount_paid ?? 0), 0);
  const { commissionOwed, totalOwed } = computeCommission(amountCollected, COMMISSION_RATE, BASE_FEE);

  await supabase
    .from('billing')
    .upsert(
      {
        user_id: userId,
        month,
        calls_made: callsMade ?? 0,
        amount_collected: amountCollected,
        commission_rate: COMMISSION_RATE,
        commission_owed: commissionOwed,
        base_fee: BASE_FEE,
        total_owed: totalOwed,
      },
      { onConflict: 'user_id,month' }
    );
}
