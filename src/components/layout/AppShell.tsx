import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, WifiOff,
  LayoutDashboard, Wrench, ShoppingCart, Package, MoreHorizontal,
} from 'lucide-react';
import Sidebar from './Sidebar';
import AIAssistant from '../AIAssistant';
import { useInventory } from '../../hooks/useInventory';
import { useCarts } from '../../hooks/useCarts';
import { useUsers } from '../../hooks/useUsers';
import { useDealers } from '../../hooks/useDealers';
import { useAuth } from '../../contexts/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/production': 'Production',
  '/my-profile': 'My Profile',
  '/carts': 'Carts',
  '/scrap': 'Scrap Log',
  '/inventory': 'Stock List',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/employees': 'Employees',
  '/payroll': 'Payroll',
  '/time-auditor': 'Time Auditor',
};

const BOTTOM_NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/production', icon: Wrench, label: 'Production' },
  { to: '/carts', icon: ShoppingCart, label: 'Carts' },
  { to: '/scrap', icon: Package, label: 'Scrap' },
] as const;

type CartCommandMode = 'Manager' | 'Warehouse' | 'Pro';

export default function AppShell() {
  const { isManager } = useAuth();
  const { lowStock, items } = useInventory();
  const { carts } = useCarts();
  const { users } = useUsers();
  const { dealers } = useDealers();
  const isOnline = useOnlineStatus();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Default to 'Manager' if nothing is stored — no access gate screen needed
  const [cartCommandMode, setCartCommandMode] = useState<CartCommandMode>(() => {
    const stored = localStorage.getItem('cartCommandMode') as CartCommandMode | null;
    if (!stored) {
      localStorage.setItem('cartCommandMode', 'Manager');
      return 'Manager';
    }
    return stored;
  });

  const location = useLocation();
  const navigate = useNavigate();

  // ── Auto-navigate to /cart-command on first load ──────────────────────────
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '') {
      navigate('/cart-command', { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync mode from localStorage / custom events ───────────────────────────
  const syncMode = useCallback(() => {
    const stored = localStorage.getItem('cartCommandMode') as CartCommandMode | null;
    setCartCommandMode(stored || 'Manager');
  }, []);

  useEffect(() => {
    const handleModeChange = (e: CustomEvent<{ mode: CartCommandMode }>) => {
      setCartCommandMode(e.detail.mode);
    };

    window.addEventListener('cartCommandModeChange', handleModeChange as EventListener);
    window.addEventListener('focus', syncMode);

    return () => {
      window.removeEventListener('cartCommandModeChange', handleModeChange as EventListener);
      window.removeEventListener('focus', syncMode);
    };
  }, [syncMode]);

  // ── Listen for the Pro-Mode sign-in button event from CartCommand ─────────
  // Navigates to /login so the user can sign in via the standard login route.
  useEffect(() => {
    const handleOpenLogin = () => navigate('/login');
    window.addEventListener('openVCartsLogin', handleOpenLogin);
    return () => window.removeEventListener('openVCartsLogin', handleOpenLogin);
  }, [navigate]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const pageTitle = PAGE_TITLES[location.pathname] ?? 'V-Carts';
  const isCartCommand = location.pathname === '/cart-command';
  const hideShell = isCartCommand && cartCommandMode !== 'Pro';

  const lowStockCount = isManager ? lowStock.length : 0;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0d1117' }}>

      {/* Sidebar */}
      {!hideShell && (
        <div className="hidden md:flex h-full shrink-0">
          <Sidebar lowStockCount={lowStockCount} />
        </div>
      )}

      {/* Mobile Sidebar */}
      {!hideShell && mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-10">
            <Sidebar
              lowStockCount={lowStockCount}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </div>
          <button
            className="absolute top-4 right-4 z-20 p-2.5 rounded-xl"
            style={{ background: '#1c2333', color: '#e6edf3' }}
            onClick={() => setMobileSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        {!hideShell && (
          <div
            className="flex md:hidden items-center justify-between px-4 py-3"
            style={{
              background: '#0d1117',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {/* Title (centered properly) */}
            <div className="flex-1 flex justify-center">
              <span
                className="text-sm font-bold"
                style={{
                  fontFamily: 'Outfit, Inter, sans-serif',
                  color: '#e6edf3',
                }}
              >
                {pageTitle}
              </span>
            </div>

            {/* Menu button (absolute-right feel without layout shift) */}
            <div className="absolute right-4">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="px-3 py-2 rounded-xl"
                style={{ background: '#1c2333', color: '#7d8590' }}
              >
                <Menu size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Offline banner */}
        {!isOnline && (
          <div
            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium"
            style={{
              background: 'rgba(248,81,73,0.12)',
              borderBottom: '1px solid rgba(248,81,73,0.25)',
              color: '#f85149',
            }}
          >
            <WifiOff size={13} />
            No internet connection — changes will sync when you're back online
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="pb-20 md:pb-0">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom Nav */}
      {!hideShell && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden"
          style={{
            background: '#0d1117',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {BOTTOM_NAV.map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to;
            return (
              <button
                key={to}
                onClick={() => navigate(to)}
                className="flex-1 flex flex-col items-center py-3"
                style={{ color: isActive ? '#22c55e' : '#7d8590' }}
              >
                <Icon size={20} />
                <span className="text-[10px]">{label}</span>
              </button>
            );
          })}

          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="flex-1 flex flex-col items-center py-3"
            style={{ color: '#7d8590' }}
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px]">More</span>
          </button>
        </nav>
      )}

      {/* AI Assistant */}
      {isManager && (
        <AIAssistant inventory={items} carts={carts} users={users} dealers={dealers} />
      )}

    </div>
  );
}
