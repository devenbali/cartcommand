import { useEffect, useState } from 'react';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Loader2 } from 'lucide-react';

import LoginScreen from './components/auth/LoginScreen';
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './contexts/ToastContext';

const Dashboard     = lazy(() => import('./pages/Dashboard'));
const Production    = lazy(() => import('./pages/Production'));
const Inventory     = lazy(() => import('./pages/Inventory'));
const Employees     = lazy(() => import('./pages/Employees'));
const Payroll       = lazy(() => import('./pages/Payroll'));
const ScrapLog      = lazy(() => import('./pages/ScrapLog'));
const Reports       = lazy(() => import('./pages/Reports'));
const Settings      = lazy(() => import('./pages/Settings'));
const Carts         = lazy(() => import('./pages/Carts'));
const MyProfile     = lazy(() => import('./pages/MyProfile'));
const TimeAuditor   = lazy(() => import('./pages/TimeAuditor'));
const PayCalculator = lazy(() => import('./pages/PayCalculator'));
const CartCommand   = lazy(() => import('./pages/CartCommand'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 size={22} className="animate-spin" style={{ color: '#22c55e' }} />
    </div>
  );
}

// ─── Auth Guards ──────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d1117' }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
          >
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <path d="M4 6L13 26H16H19L28 6H23L16 20L9 6H4Z" fill="white" />
            </svg>
          </div>
          <p className="text-sm" style={{ color: '#7d8590' }}>Loading…</p>
        </div>
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequireManager({ children }: { children: React.ReactNode }) {
  const { isManager } = useAuth();
  return isManager ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function RequireSupervisor({ children }: { children: React.ReactNode }) {
  const { isSupervisor } = useAuth();
  return isSupervisor ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public — no auth required */}
      <Route
        path="/login"
        element={user ? <Navigate to="/cart-command" replace /> : <LoginScreen />}
      />

      {/* Public — CartCommand loads immediately without login */}
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/cart-command" replace />} />
        <Route
          path="/cart-command"
          element={<Suspense fallback={<PageLoader />}><CartCommand /></Suspense>}
        />
      </Route>

      {/* Protected — all other pages require auth */}
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/dashboard"      element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
        <Route path="/production"     element={<Suspense fallback={<PageLoader />}><Production /></Suspense>} />
        <Route path="/my-profile"     element={<Suspense fallback={<PageLoader />}><MyProfile /></Suspense>} />
        <Route path="/carts"          element={<Suspense fallback={<PageLoader />}><Carts /></Suspense>} />
        <Route path="/scrap"          element={<Suspense fallback={<PageLoader />}><ScrapLog /></Suspense>} />
        <Route path="/pay-calculator" element={<Suspense fallback={<PageLoader />}><PayCalculator /></Suspense>} />

        {/* Supervisor + Manager */}
        <Route path="/inventory" element={<RequireSupervisor><Suspense fallback={<PageLoader />}><Inventory /></Suspense></RequireSupervisor>} />
        <Route path="/reports"   element={<RequireSupervisor><Suspense fallback={<PageLoader />}><Reports /></Suspense></RequireSupervisor>} />
        <Route path="/settings"  element={<RequireSupervisor><Suspense fallback={<PageLoader />}><Settings /></Suspense></RequireSupervisor>} />

        {/* Manager only */}
        <Route path="/employees"    element={<RequireManager><Suspense fallback={<PageLoader />}><Employees /></Suspense></RequireManager>} />
        <Route path="/payroll"      element={<RequireManager><Suspense fallback={<PageLoader />}><Payroll /></Suspense></RequireManager>} />
        <Route path="/time-auditor" element={<RequireManager><Suspense fallback={<PageLoader />}><TimeAuditor /></Suspense></RequireManager>} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/cart-command" replace />} />
    </Routes>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const isMobile = useIsMobile();

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
