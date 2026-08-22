import { createClient, WebSocketLikeConstructor } from '@supabase/supabase-js';
import WebSocket from 'ws';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

// Service-role client: bypasses RLS. All tenant scoping is enforced in
// application code (every query filters by user_id / campaign ownership).
// This backend never uses Supabase Realtime (it has its own SSE event bus —
// see src/events/eventBus.ts), but supabase-js still constructs a
// RealtimeClient internally and that constructor throws on Node < 22 without
// a WebSocket implementation, so `ws` is wired in purely to satisfy it.
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
});
