import Stripe from 'stripe';
import { supabase } from '../db/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface Billing {
  id: string;
  commission_owed: number;
  base_fee: number;
}

export async function chargeMonthlyCommission(stripeCustomerId: string, billing: Billing) {
  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    collection_method: 'charge_automatically',
    auto_advance: true,
  });

  await stripe.invoiceItems.create({
    customer: stripeCustomerId,
    invoice: invoice.id,
    currency: 'cad',
    amount: Math.round(billing.commission_owed * 100),
    description: 'Collections Commission (6%)',
  });

  await stripe.invoiceItems.create({
    customer: stripeCustomerId,
    invoice: invoice.id,
    currency: 'cad',
    amount: Math.round(billing.base_fee * 100),
    description: 'Base Monthly Fee',
  });

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);

  await supabase.from('billing').update({ stripe_invoice_id: finalized.id, status: 'charged' }).eq('id', billing.id);

  return finalized;
}

export function constructWebhookEvent(rawBody: Buffer, signature: string) {
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}

export async function handlePaymentSucceeded(invoiceId: string) {
  await supabase
    .from('billing')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('stripe_invoice_id', invoiceId);
}
