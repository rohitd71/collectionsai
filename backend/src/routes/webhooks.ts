import { Router } from 'express';
import { supabase } from '../db/supabase';
import { env } from '../env';
import { publishEvent } from '../events/eventBus';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { analyzeTranscript, generateSmsTemplate } from '../services/ClaudeService';
import { recalculateCommissionForAccount } from '../services/BillingCalculator';
import { constructWebhookEvent, handlePaymentSucceeded } from '../services/StripeService';
import { sendSms, verifyTwilioSignature } from '../services/TwilioService';
import { NO_CONVERSATION_REASONS, VapiWebhookPayload } from '../services/VapiService';

const router = Router();

router.post(
  '/vapi',
  asyncHandler(async (req, res) => {
    // Vapi lets you configure a custom header on the server-URL webhook;
    // require it so an attacker can't forge "customer paid" call results.
    const secret = req.headers['x-webhook-secret'];
    if (env.VAPI_WEBHOOK_SECRET && secret !== env.VAPI_WEBHOOK_SECRET) {
      throw new ApiError(401, 'Invalid webhook secret');
    }

    const payload = req.body as VapiWebhookPayload;

    const { data: call } = await supabase
      .from('calls')
      .select('*, accounts(*, campaigns(user_id, max_retries))')
      .eq('vapi_call_id', payload.call_id)
      .maybeSingle();
    if (!call) throw new ApiError(404, 'Unknown call_id');

    // Idempotency: a webhook already processed for this call is a no-op.
    if (call.status === 'completed') return res.json({ success: true, already_processed: true });

    await supabase
      .from('calls')
      .update({
        status: 'completed',
        duration: payload.duration,
        transcript: payload.transcript,
        recording_url: payload.recording_url,
        ended_at: new Date().toISOString(),
      })
      .eq('id', call.id);

    const account = call.accounts;
    const userId: string | undefined = account?.campaigns?.user_id;
    const maxRetries: number = account?.campaigns?.max_retries ?? 3;

    // A call that never became a conversation (no answer, voicemail, busy)
    // has nothing for Claude to analyze. Requeue it for another attempt if
    // the campaign's max_retries allows it; otherwise leave it exhausted.
    const noConversation = payload.ended_reason ? NO_CONVERSATION_REASONS.has(payload.ended_reason) : false;
    if (noConversation) {
      const outcome = payload.ended_reason === 'voicemail' ? 'voicemail' : 'no_answer';
      await supabase.from('calls').update({ outcome }).eq('id', call.id);

      const canRetry = account.call_count < maxRetries;
      await supabase.from('accounts').update({ status: canRetry ? 'pending' : 'called' }).eq('id', account.id);

      if (userId) {
        publishEvent(userId, {
          type: 'call.completed',
          payload: { call_id: call.id, account_id: account.id, campaign_id: account.campaign_id, outcome, retry_scheduled: canRetry },
        });
      }
      return res.json({ success: true, outcome, retry_scheduled: canRetry });
    }

    const analysis = await analyzeTranscript(payload.transcript);

    await supabase
      .from('calls')
      .update({
        outcome: analysis.payment_promised ? 'promised' : 'connected',
        amount_promised: analysis.amount_promised || null,
        payment_date_promised: analysis.payment_date,
        sentiment: analysis.sentiment,
      })
      .eq('id', call.id);

    const nextStatus = analysis.payment_promised ? 'promised' : 'connected';
    await supabase.from('accounts').update({ status: nextStatus }).eq('id', account.id);

    if (analysis.amount_promised > 0) {
      await recalculateCommissionForAccount(account);
    }

    const smsText = await generateSmsTemplate(account, analysis.next_action);
    if (smsText) {
      await sendSms(account.id, account.phone, smsText);
    }

    if (userId) {
      publishEvent(userId, { type: 'call.completed', payload: { call_id: call.id, account_id: account.id, campaign_id: account.campaign_id } });
    }

    res.json({ success: true });
  })
);

// Twilio posts application/x-www-form-urlencoded (see express.urlencoded()
// mounted for this path in index.ts), using its own field names
// (MessageSid/MessageStatus), not the JSON shape the earlier draft assumed.
router.post(
  '/twilio',
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-twilio-signature'];
    if (typeof signature !== 'string') {
      throw new ApiError(400, 'Missing X-Twilio-Signature header');
    }
    const valid = verifyTwilioSignature(signature, `${env.PUBLIC_BACKEND_URL}/webhooks/twilio`, req.body as Record<string, string>);
    if (!valid) throw new ApiError(403, 'Invalid Twilio signature');

    const { MessageSid, MessageStatus } = req.body as { MessageSid: string; MessageStatus: string };
    await supabase
      .from('sms_messages')
      .update({
        status: MessageStatus,
        delivered_at: MessageStatus === 'delivered' ? new Date().toISOString() : null,
      })
      .eq('twilio_sms_id', MessageSid);
    res.status(200).send();
  })
);

// Registered with express.raw() in index.ts so req.body is a Buffer here,
// which Stripe's signature verification requires.
router.post(
  '/stripe',
  asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') throw new ApiError(400, 'Missing Stripe-Signature header');

    const event = constructWebhookEvent(req.body as Buffer, signature);

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as { id: string };
      await handlePaymentSucceeded(invoice.id);
    }

    res.json({ received: true });
  })
);

export default router;
