import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ChangeEvent, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatsCard } from '../components/StatsCard';
import { api } from '../lib/api';
import { useRealtimeEvents } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

interface Campaign {
  id: string;
  name: string;
  status: string;
  tone: string;
}

interface CampaignDetailResponse {
  campaign: Campaign;
  stats: {
    total_accounts: number;
    calls_connected: number;
    payments_made: number;
    amount_collected: number;
  };
}

interface Account {
  id: string;
  name: string;
  phone: string;
  amount_owed: number;
  status: string;
}

interface UploadSummary {
  total: number;
  valid: number;
  duplicates: number;
  invalid: { row: number; error: string }[];
}

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const token = useAuthStore((s) => s.token);

  const { data } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.get<CampaignDetailResponse>(`/campaigns/${id}`),
    enabled: !!id,
    refetchInterval: 60_000, // fallback in case the realtime stream drops
  });

  const { data: accountsPage } = useQuery({
    queryKey: ['accounts', id],
    queryFn: () => api.get<{ data: Account[] }>(`/campaigns/${id}/accounts`),
    enabled: !!id,
    refetchInterval: 60_000,
  });

  useRealtimeEvents((event) => {
    const eventCampaignId = event.payload.campaign_id;
    if (eventCampaignId && eventCampaignId !== id) return;
    queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    queryClient.invalidateQueries({ queryKey: ['accounts', id] });
  });

  async function handleExport() {
    if (!id) return;
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/reports/export?campaign_id=${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign-${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const uploadCsv = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<UploadSummary>(`/campaigns/${id}/accounts/upload`, formData);
    },
    onSuccess: (summary) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', id] });
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      alert(`Uploaded ${summary.valid} accounts (${summary.duplicates} duplicates, ${summary.invalid.length} invalid).`);
    },
  });

  const launch = useMutation({
    mutationFn: () => api.post(`/campaigns/${id}/launch`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaign', id] }),
  });

  const pause = useMutation({
    mutationFn: () => api.post(`/campaigns/${id}/pause`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaign', id] }),
  });

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadCsv.mutate(file);
    e.target.value = '';
  }

  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const { campaign, stats } = data;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{campaign.name}</h1>
          <p className="text-sm capitalize text-slate-500">{campaign.status} · {campaign.tone} tone</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadCsv.isPending}
            className="rounded border border-slate-300 px-4 py-2 text-sm"
          >
            {uploadCsv.isPending ? 'Uploading…' : 'Upload Accounts (CSV)'}
          </button>
          <button onClick={handleExport} disabled={exporting} className="rounded border border-slate-300 px-4 py-2 text-sm">
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          {campaign.status === 'active' ? (
            <button onClick={() => pause.mutate()} className="rounded bg-amber-600 px-4 py-2 text-sm text-white">
              Pause
            </button>
          ) : (
            <button onClick={() => launch.mutate()} className="rounded bg-emerald-600 px-4 py-2 text-sm text-white">
              Launch Campaign
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatsCard label="Total Accounts" value={stats.total_accounts} />
        <StatsCard label="Connected" value={stats.calls_connected} />
        <StatsCard label="Payments Made" value={stats.payments_made} />
        <StatsCard label="Amount Collected" value={`$${stats.amount_collected.toLocaleString()}`} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-medium text-slate-900">Accounts</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Amount Owed</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accountsPage?.data.length ? (
                accountsPage.data.map((a) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/campaigns/${id}/accounts/${a.id}`)}>
                    <td className="px-4 py-2 text-slate-900 underline">{a.name}</td>
                    <td className="px-4 py-2">{a.phone}</td>
                    <td className="px-4 py-2">${a.amount_owed}</td>
                    <td className="px-4 py-2 capitalize">{a.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No accounts uploaded yet.
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
