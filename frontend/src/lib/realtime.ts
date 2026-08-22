import { useEffect, useRef } from 'react';
import { api } from './api';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export interface DomainEvent {
  type: 'call.completed' | 'account.updated' | 'campaign.batch_queued';
  payload: Record<string, unknown>;
}

// Opens an SSE connection authenticated via a short-lived, one-time ticket
// (EventSource can't send an Authorization header, and a long-lived JWT in
// the URL would end up in logs). Reconnects with a fresh ticket on error.
export function useRealtimeEvents(onEvent: (event: DomainEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function connect() {
      try {
        const { ticket } = await api.post<{ ticket: string }>('/events/ticket');
        if (cancelled) return;

        source = new EventSource(`${API_URL}/events/stream?ticket=${ticket}`);
        source.onmessage = (e) => {
          try {
            onEventRef.current(JSON.parse(e.data) as DomainEvent);
          } catch {
            // ignore malformed/comment frames
          }
        };
        source.onerror = () => {
          source?.close();
          if (!cancelled) reconnectTimer = setTimeout(connect, 3000);
        };
      } catch {
        if (!cancelled) reconnectTimer = setTimeout(connect, 5000);
      }
    }

    connect();

    return () => {
      cancelled = true;
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);
}
