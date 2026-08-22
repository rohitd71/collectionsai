interface Account {
  id: string;
  name: string;
  phone: string;
}

interface VapiCallResponse {
  id: string;
}

const VAPI_BASE_URL = 'https://api.vapi.ai';

// Thin wrapper over Vapi's REST API. Kept dependency-free (fetch) since the
// official SDK's shape churns; swap for `@vapi-ai/server-sdk` if preferred.
export async function initiateVapiCall(account: Account, systemPrompt: string): Promise<string> {
  const response = await fetch(`${VAPI_BASE_URL}/call`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assistantId: process.env.VAPI_ASSISTANT_ID,
      phoneNumberId: process.env.BUSINESS_PHONE_NUMBER,
      customer: { number: account.phone, name: account.name },
      assistantOverrides: {
        model: {
          messages: [{ role: 'system', content: systemPrompt }],
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vapi call initiation failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as VapiCallResponse;
  return data.id;
}

// Vapi's actual end-of-call-report carries an `endedReason` distinguishing a
// real conversation from a call that never connected. This maps the reasons
// relevant to retry/outcome logic; anything else is treated as a completed
// conversation worth analyzing.
export const NO_CONVERSATION_REASONS = new Set([
  'customer-did-not-answer',
  'no-answer',
  'voicemail',
  'customer-busy',
]);

export interface VapiWebhookPayload {
  call_id: string;
  account_id: string;
  duration: number;
  status: 'completed' | 'failed';
  ended_reason?: string;
  transcript: string;
  recording_url: string;
}
