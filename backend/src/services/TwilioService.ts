import twilio from 'twilio';
import { supabase } from '../db/supabase';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function sendSms(accountId: string, phone: string, message: string) {
  const sms = await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone,
  });

  await supabase.from('sms_messages').insert({
    account_id: accountId,
    twilio_sms_id: sms.sid,
    message_text: message,
    status: 'queued',
    sent_at: new Date().toISOString(),
  });

  return sms.sid;
}

export function verifyTwilioSignature(signature: string, url: string, params: Record<string, string>) {
  return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN!, signature, url, params);
}
