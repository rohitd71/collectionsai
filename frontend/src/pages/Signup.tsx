import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface RegisterResponse {
  jwt_token: string;
  user: { id: string; email: string; company_name: string; plan: string };
}

export function Signup() {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<RegisterResponse>('/auth/register', {
        email,
        password,
        company_name: companyName,
      });
      login(res.jwt_token, res.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Create your account</h1>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <label className="mb-3 block text-sm">
          Company name
          <input
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="mb-3 block text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="mb-6 block text-sm">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Creating account…' : 'Sign up'}
        </button>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account? <Link to="/login" className="text-slate-900 underline">Log in</Link>
        </p>
      </form>
    </div>
  );
}
