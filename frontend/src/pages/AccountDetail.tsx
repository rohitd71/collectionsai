import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface Account {
  id: string;
  name: string;
  phone: string;
  amount_owed: number;
  days_overdue: number;
  status: string;
  amount_paid: number | null;
  notes: string | null;
}

interface Call {
  id: string;
  status: string;
  outcome: string | null;
  duration: number | null;
  transcript: string | null;
  recording_url: string | null;
  sentiment: string | null;
  amount_promised: number | null;
  started_at: string | null;
  ended_at: string | null;
}

const ESCALATION_REASONS = ['dispute', 'hardship', 'hostility', 'manager_request', 'compliance_concern'] as const;

function CallRow({ call, campaignId }: { call: Call; campaignId: string }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [reason, setReason] = useState<(typeof ESCALATION_REASONS)[number]>('dispute');
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const escalate = useMutation({
    mutationFn: () => api.post(`/calls/${call.id}/escalate`, { reason, notes: notes || undefined }),
    onSuccess: () => {
      setShowEscalate(false);
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['account', campaignId] });
    },
  });

  return (
    <div className="border-b border-slate-100 py-4 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-900">{call.started_at ? new Date(call.started_at).toLocaleString() : 'Not started'}</span>
        <span className="capitalize text-slate-500">{call.duration ? `${call.duration}s` : '—'}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{call.outcome ?? call.status}</span>
        {call.sentiment && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{call.sentiment}</span>}
        {call.amount_promised != null && <span className="text-xs text-emerald-700">Promised ${call.amount_promised}</span>}
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        {call.transcript && (
          <button onClick={() => setShowTranscript((v) => !v)} className="text-slate-700 underline">
            {showTranscript ? 'Hide transcript' : 'View transcript'}
          </button>
        )}
        {call.status !== 'escalated' && (
          <button onClick={() => setShowEscalate((v) => !v)} className="text-amber-700 underline">
            Escalate
          </button>
        )}
      </div>

      {call.recording_url && (
        <audio controls className="mt-3 w-full" src={call.recording_url}>
          Your browser does not support audio playback.
        </audio>
      )}

      {showTranscript && call.transcript && (
        <pre className="mt-3 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700">{call.transcript}</pre>
      )}

      {showEscalate && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded border border-amber-200 bg-amber-50 p-3">
          <label className="text-xs">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
            >
              {ESCALATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs">
            Notes
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={() => escalate.mutate()}
            disabled={escalate.isPending}
            className="rounded bg-amber-600 px-3 py-1.5 text-xs text-white"
          >
            {escalate.isPending ? 'Escalating…' : 'Confirm Escalate'}
          </button>
        </div>
      )}
    </div>
  );
}

export function AccountDetail() {
  const { id: campaignId, accountId } = useParams<{ id: string; accountId: string }>();

  const { data } = useQuery({
    queryKey: ['account', campaignId, accountId],
    queryFn: () => api.get<{ account: Account; calls: Call[] }>(`/campaigns/${campaignId}/accounts/${accountId}`),
    enabled: !!campaignId && !!accountId,
  });

  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const { account, calls } = data;

  return (
    <div>
      <Link to={`/campaigns/${campaignId}`} className="mb-4 inline-block text-sm text-slate-500 underline">
        &larr; Back to campaign
      </Link>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">{account.name}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{account.status}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-slate-500">Phone</dt>
            <dd className="text-slate-900">{account.phone}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Amount Owed</dt>
            <dd className="text-slate-900">${account.amount_owed}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Days Overdue</dt>
            <dd className="text-slate-900">{account.days_overdue}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Amount Paid</dt>
            <dd className="text-slate-900">{account.amount_paid != null ? `$${account.amount_paid}` : '—'}</dd>
          </div>
        </dl>
        {account.notes && <p className="mt-4 text-sm text-slate-600">{account.notes}</p>}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-2 text-lg font-medium text-slate-900">Call History</h2>
        {calls.length ? (
          calls.map((call) => <CallRow key={call.id} call={call} campaignId={campaignId!} />)
        ) : (
          <p className="text-sm text-slate-500">No calls yet.</p>
        )}
      </div>
    </div>
  );
}
