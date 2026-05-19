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
import { Loader2 } from 'lucide-react';

import AppShell from './components/layout/AppShell';
import LoginScreen from './components/auth/LoginScreen';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const CartCommand = lazy(() => import('./pages/CartCommand'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 size={22} className="animate-spin" style={{ color: '#22c55e' }} />
    </div>
  );
}

function AppRoutes() {
  const { user, pendingApproval } = useAuth();

  // Not signed in or pending approval → show login
  if (!user || pendingApproval) {
    return (
      <Routes>
        <Route path="*" element={<LoginScreen />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/cart-command" replace />} />
        <Route
          path="/cart-command"
          element={<Suspense fallback={<PageLoader />}><CartCommand /></Suspense>}
        />
      </Route>
      <Route path="*" element={<Navigate to="/cart-command" replace />} />
    </Routes>
  );
}

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
