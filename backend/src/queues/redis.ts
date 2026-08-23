import IORedis from 'ioredis';
import { env } from '../env';

// Shared connection for Queue instances (Queues only issue quick, non-blocking
// commands, so sharing is safe and cheaper than one connection each).
export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

// BullMQ Workers poll with blocking commands (BRPOPLPUSH-style) that would
// otherwise stall a connection shared with a Queue's own commands — each
// Worker needs its own dedicated connection. See BullMQ's connection docs.
export function createWorkerConnection() {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
