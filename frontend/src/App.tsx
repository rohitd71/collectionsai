import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AccountDetail } from './pages/AccountDetail';
import { Billing } from './pages/Billing';
import { CampaignDetail } from './pages/CampaignDetail';
import { Campaigns } from './pages/Campaigns';
import { Dashboard } from './pages/Dashboard';
import { Escalations } from './pages/Escalations';
import { Login } from './pages/Login';
import { Settings } from './pages/Settings';
import { Signup } from './pages/Signup';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/campaigns/:id" element={<CampaignDetail />} />
              <Route path="/campaigns/:id/accounts/:accountId" element={<AccountDetail />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/escalations" element={<Escalations />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
