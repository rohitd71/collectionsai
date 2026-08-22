import { FormEvent, useState } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

interface User {
  id: string;
  email: string;
  company_name: string;
  plan: string;
}

const WEBHOOK_PATHS = [
  { label: 'Vapi', path: '/webhooks/vapi' },
  { label: 'Twilio', path: '/webhooks/twilio' },
  { label: 'Stripe', path: '/webhooks/stripe' },
];

export function Settings() {
  const { user, login, token } = useAuthStore();
  const [companyName, setCompanyName] = useState(user?.company_name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.patch<User>('/auth/me', { company_name: companyName });
      if (token) login(token, updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Settings</h1>

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium text-slate-900">Company Info</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            Company name
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Email (read-only)
            <input value={user?.email ?? ''} disabled className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Plan (read-only)
            <input value={user?.plan ?? ''} disabled className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 capitalize" />
          </label>
          <button type="submit" disabled={saving} className="rounded bg-slate-900 px-4 py-2 text-sm text-white">
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span className="ml-3 text-sm text-emerald-600">Saved.</span>}
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-2 text-lg font-medium text-slate-900">Webhook URLs</h2>
        <p className="mb-4 text-sm text-slate-500">
          Paste these into the corresponding dashboard so Vapi, Twilio, and Stripe can notify this platform of call
          results, SMS delivery status, and payments.
        </p>
        <div className="space-y-2">
          {WEBHOOK_PATHS.map(({ label, path }) => (
            <div key={path} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm">
              <span className="font-medium text-slate-700">{label}</span>
              <code className="text-slate-500">{API_URL}{path}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
