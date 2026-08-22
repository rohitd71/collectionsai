import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold text-slate-900">
            AI Collections
          </Link>
          <nav className="flex items-center gap-6 text-sm text-slate-600">
            <Link to="/">Dashboard</Link>
            <Link to="/campaigns">Campaigns</Link>
            <Link to="/escalations">Escalations</Link>
            <Link to="/billing">Billing</Link>
            <Link to="/settings">Settings</Link>
            <span className="text-slate-400">{user?.company_name}</span>
            <button
              className="rounded bg-slate-900 px-3 py-1.5 text-white"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
