import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

interface Campaign {
  id: string;
  name: string;
  tone: string;
  status: string;
  account_type: string | null;
}

export function Campaigns() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [tone, setTone] = useState('professional');
  const [accountType, setAccountType] = useState('medical');
  const [showForm, setShowForm] = useState(false);

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<Campaign[]>('/campaigns'),
  });

  const createCampaign = useMutation({
    mutationFn: () =>
      api.post<Campaign>('/campaigns', { name, tone, account_type: accountType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setName('');
      setShowForm(false);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createCampaign.mutate();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Campaigns</h1>
        <button onClick={() => setShowForm((v) => !v)} className="rounded bg-slate-900 px-4 py-2 text-sm text-white">
          {showForm ? 'Cancel' : '+ New Campaign'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
          <input
            placeholder="Campaign name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 md:col-span-2"
            required
          />
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="rounded border border-slate-300 px-3 py-2">
            <option value="professional">Professional</option>
            <option value="empathetic">Empathetic</option>
            <option value="aggressive">Aggressive</option>
          </select>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          >
            <option value="credit_card">Credit card</option>
            <option value="auto_loan">Auto loan</option>
            <option value="medical">Medical</option>
            <option value="personal_loan">Personal loan</option>
            <option value="other">Other</option>
          </select>
          <button
            type="submit"
            disabled={createCampaign.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white md:col-span-4"
          >
            {createCampaign.isPending ? 'Creating…' : 'Create Campaign'}
          </button>
        </form>
      )}

      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {campaigns?.length ? (
          campaigns.map((c) => (
            <Link key={c.id} to={`/campaigns/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <div>
                <p className="text-slate-900">{c.name}</p>
                <p className="text-xs capitalize text-slate-500">{c.tone} · {c.account_type ?? 'unspecified'}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{c.status}</span>
            </Link>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-slate-500">No campaigns yet. Create one above.</p>
        )}
      </div>
    </div>
  );
}
