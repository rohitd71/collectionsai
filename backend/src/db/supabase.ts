import { createClient, WebSocketLikeConstructor } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from '../env';

// Service-role client: bypasses RLS. All tenant scoping is enforced in
// application code (every query filters by user_id / campaign ownership).
// This backend never uses Supabase Realtime (it has its own SSE event bus —
// see src/events/eventBus.ts), but supabase-js still constructs a
// RealtimeClient internally and that constructor throws on Node < 22 without
// a WebSocket implementation, so `ws` is wired in purely to satisfy it.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
});
