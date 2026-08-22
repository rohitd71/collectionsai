import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { StatsCard } from '../components/StatsCard';
import { api } from '../lib/api';
import { useRealtimeEvents } from '../lib/realtime';

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface BillingSummary {
  calls_made: number;
  amount_collected: number;
  commission_owed: number;
  total_owed: number;
}

export function Dashboard() {
  const queryClient = useQueryClient();

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<Campaign[]>('/campaigns'),
    refetchInterval: 60_000, // fallback in case the realtime stream drops
  });

  const { data: billing } = useQuery({
    queryKey: ['billing-summary'],
    queryFn: () => api.get<BillingSummary>('/billing/summary'),
    refetchInterval: 60_000,
  });

  useRealtimeEvents((event) => {
    if (event.type === 'call.completed' || event.type === 'account.updated') {
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
    }
    if (event.type === 'campaign.batch_queued' || event.type === 'call.completed') {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    }
  });

  const activeCampaigns = campaigns?.filter((c) => c.status === 'active') ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <Link to="/campaigns" className="rounded bg-slate-900 px-4 py-2 text-sm text-white">
          + New Campaign
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatsCard label="Active Campaigns" value={activeCampaigns.length} />
        <StatsCard label="Calls Made (this month)" value={billing?.calls_made ?? 0} />
        <StatsCard label="Amount Collected" value={`$${(billing?.amount_collected ?? 0).toLocaleString()}`} />
        <StatsCard label="Total Due" value={`$${(billing?.total_owed ?? 0).toLocaleString()}`} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-medium text-slate-900">Campaigns</h2>
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {campaigns?.length ? (
            campaigns.map((c) => (
              <Link key={c.id} to={`/campaigns/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <span className="text-slate-900">{c.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{c.status}</span>
              </Link>
            ))
          ) : (
            <p className="px-4 py-6 text-sm text-slate-500">No campaigns yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
