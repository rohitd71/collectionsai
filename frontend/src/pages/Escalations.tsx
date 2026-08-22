import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Escalation {
  id: string;
  reason: string;
  status: 'open' | 'resolved';
  agent_assigned: string | null;
  notes: string | null;
  created_at: string;
  calls: {
    id: string;
    accounts: { id: string; name: string; phone: string; campaigns: { id: string; name: string } };
  };
}

export function Escalations() {
  const queryClient = useQueryClient();

  const { data: escalations } = useQuery({
    queryKey: ['escalations', 'open'],
    queryFn: () => api.get<Escalation[]>('/escalations?status=open'),
    refetchInterval: 30_000,
  });

  const resolve = useMutation({
    mutationFn: (id: string) => api.patch(`/escalations/${id}`, { status: 'resolved' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['escalations'] }),
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Escalations</h1>

      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {escalations?.length ? (
          escalations.map((esc) => (
            <div key={esc.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-slate-900">
                  {esc.calls.accounts.name}{' '}
                  <span className="text-xs text-slate-500">({esc.calls.accounts.phone})</span>
                </p>
                <p className="text-xs text-slate-500">
                  {esc.calls.accounts.campaigns.name} · reason: <span className="capitalize">{esc.reason}</span>
                </p>
                {esc.notes && <p className="mt-1 text-xs text-slate-600">{esc.notes}</p>}
              </div>
              <button
                onClick={() => resolve.mutate(esc.id)}
                disabled={resolve.isPending}
                className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white"
              >
                Mark Resolved
              </button>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-slate-500">No open escalations.</p>
        )}
      </div>
    </div>
  );
}
