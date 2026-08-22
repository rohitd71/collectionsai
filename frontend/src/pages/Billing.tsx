import { useQuery } from '@tanstack/react-query';
import { StatsCard } from '../components/StatsCard';
import { api } from '../lib/api';

interface BillingRecord {
  month: string;
  calls_made: number;
  amount_collected: number;
  commission_owed: number;
  base_fee: number;
  total_owed: number;
  status: string;
}

export function Billing() {
  const { data: summary } = useQuery({
    queryKey: ['billing-summary'],
    queryFn: () => api.get<BillingRecord>('/billing/summary'),
  });

  const { data: history } = useQuery({
    queryKey: ['billing-history'],
    queryFn: () => api.get<BillingRecord[]>('/billing/history'),
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Billing</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatsCard label="Calls Made" value={summary?.calls_made ?? 0} />
        <StatsCard label="Amount Collected" value={`$${(summary?.amount_collected ?? 0).toLocaleString()}`} />
        <StatsCard label="Commission Owed" value={`$${(summary?.commission_owed ?? 0).toLocaleString()}`} />
        <StatsCard label="Total Due" value={`$${(summary?.total_owed ?? 0).toLocaleString()}`} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-medium text-slate-900">Billing History</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Month</th>
                <th className="px-4 py-2">Collected</th>
                <th className="px-4 py-2">Commission</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history?.length ? (
                history.map((b) => (
                  <tr key={b.month}>
                    <td className="px-4 py-2">{b.month}</td>
                    <td className="px-4 py-2">${b.amount_collected.toLocaleString()}</td>
                    <td className="px-4 py-2">${b.commission_owed.toLocaleString()}</td>
                    <td className="px-4 py-2">${b.total_owed.toLocaleString()}</td>
                    <td className="px-4 py-2 capitalize">{b.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No billing history yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
