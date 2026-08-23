import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// Sonnet is the cost/quality default for high-volume per-call generation;
// override via env if a given deployment wants Opus-level analysis instead.
const MODEL = env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

interface Account {
  name: string;
  amount_owed: number;
  days_overdue: number;
  account_type?: string | null;
  last_payment_date?: string | null;
}

interface Campaign {
  tone: 'professional' | 'empathetic' | 'aggressive';
}

export async function generateVapiPrompt(account: Account, campaign: Campaign): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `Generate a Vapi voice-agent system prompt for a debt collection call.

Debtor: ${account.name}
Amount owed: $${account.amount_owed}
Days overdue: ${account.days_overdue}
Account type: ${account.account_type ?? 'unspecified'}
Last payment: ${account.last_payment_date ?? 'unknown'}
Campaign tone: ${campaign.tone}

The prompt MUST:
1. Identify the company and state "This is a debt collection call".
2. State the amount owed and days overdue.
3. Never threaten illegal action or use abusive language (FDCPA compliant).
4. Offer flexible payment options (pay in full, payment plan).
5. Instruct the agent to escalate to a human immediately on: dispute, hardship claim, hostility, or a request for a manager.
6. Match the requested tone (${campaign.tone}).

Return only the system prompt text, ready to paste into Vapi.`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}

export interface TranscriptAnalysis {
  payment_promised: boolean;
  amount_promised: number;
  payment_date: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | 'angry';
  key_objection: string | null;
  next_action: string;
}

export async function analyzeTranscript(transcript: string): Promise<TranscriptAnalysis> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `Analyze this debt collection call transcript and respond with ONLY a JSON object matching this shape, no prose:
{"payment_promised": boolean, "amount_promised": number, "payment_date": string|null, "sentiment": "positive"|"neutral"|"negative"|"angry", "key_objection": string|null, "next_action": string}

Transcript:
${transcript}`,
      },
    ],
  });

  const block = message.content[0];
  const text = block.type === 'text' ? block.text : '{}';
  try {
    return JSON.parse(text) as TranscriptAnalysis;
  } catch {
    return {
      payment_promised: false,
      amount_promised: 0,
      payment_date: null,
      sentiment: 'neutral',
      key_objection: null,
      next_action: 'manual_review',
    };
  }
}

export async function generateSmsTemplate(account: Account, context: string): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: `Write a short SMS (max 160 characters) following up on a debt collection call.
Debtor: ${account.name}. Amount: $${account.amount_owed}. Context: ${context}.
Tone: professional but warm. Return only the SMS text.`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}
