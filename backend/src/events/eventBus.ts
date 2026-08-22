import { randomUUID } from 'crypto';
import { Response } from 'express';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Redis pub/sub fans events out across every API instance; local clients
// (this instance's open SSE connections) are kept in-memory and written to
// whenever a message arrives on their user's channel.
const publisher = new IORedis(REDIS_URL);
const subscriber = new IORedis(REDIS_URL);

const localClients = new Map<string, Set<Response>>();

subscriber.psubscribe('user:*:events');
subscriber.on('pmessage', (_pattern, channel, message) => {
  const userId = channel.split(':')[1];
  const clients = localClients.get(userId);
  if (!clients) return;
  for (const res of clients) {
    res.write(`data: ${message}\n\n`);
  }
});

export interface DomainEvent {
  type: 'call.completed' | 'account.updated' | 'campaign.batch_queued';
  payload: Record<string, unknown>;
}

export function publishEvent(userId: string, event: DomainEvent) {
  publisher.publish(`user:${userId}:events`, JSON.stringify(event)).catch((err) => {
    console.error('Failed to publish realtime event:', err);
  });
}

export function registerClient(userId: string, res: Response) {
  if (!localClients.has(userId)) localClients.set(userId, new Set());
  localClients.get(userId)!.add(res);
}

export function unregisterClient(userId: string, res: Response) {
  localClients.get(userId)?.delete(res);
}

// One-time SSE tickets: EventSource can't send an Authorization header, and a
// long-lived JWT in the query string would end up in server/proxy logs. A
// ticket is minted from an already-authenticated request, used once, and
// expires in 30s if the client never connects.
const TICKET_PREFIX = 'sse_ticket:';
const TICKET_TTL_SECONDS = 30;

export async function issueTicket(userId: string): Promise<string> {
  const ticket = randomUUID();
  await publisher.set(`${TICKET_PREFIX}${ticket}`, userId, 'EX', TICKET_TTL_SECONDS);
  return ticket;
}

export async function consumeTicket(ticket: string): Promise<string | null> {
  const key = `${TICKET_PREFIX}${ticket}`;
  const userId = await publisher.get(key);
  if (!userId) return null;
  await publisher.del(key);
  return userId;
}
