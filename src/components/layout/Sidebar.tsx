import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Wrench,
  ClipboardList,
  DollarSign,
  Package,
  BarChart2,
  Settings,
  LogOut,
  AlertTriangle,
  Users,
  User,
  Clock,
  LogIn,
  LogOut as LogOutIcon,
  Loader2,
  ShoppingCart,
  ShieldCheck,
  Info
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useClockStatus } from '../../hooks/useClockStatus';
import { useLocationSettings } from '../../hooks/useLocationSettings';
import { clockIn, clockOut } from '../../lib/firestore';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  managerOnly?: boolean;
  supervisorOnly?: boolean;
  workerVisible?: boolean; // visible to all roles
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',   icon: <LayoutDashboard size={20} />, label: 'Dashboard',         workerVisible: true },
  { to: '/cart-command', icon: <Info size={20} />, label: 'Cart Command', workerVisible: true },
  { to: '/production',  icon: <Wrench size={20} />,          label: 'Production',        workerVisible: true },
  { to: '/my-profile',      icon: <User size={20} />,            label: 'My Profile',        workerVisible: true },
  { to: '/pay-calculator',  icon: <DollarSign size={20} />,    label: 'Pay Calculator',    workerVisible: true },
  { to: '/carts',           icon: <ShoppingCart size={20} />,  label: 'Master Carts List', workerVisible: true },
  { to: '/scrap',       icon: <Package size={20} />,         label: 'Scrap Log',         workerVisible: true },
  { to: '/inventory',   icon: <ClipboardList size={20} />,   label: 'Master Stock List', supervisorOnly: true },
  { to: '/reports',     icon: <BarChart2 size={20} />,       label: 'Reports',           supervisorOnly: true },
  { to: '/settings',    icon: <Settings size={20} />,        label: 'Settings',          supervisorOnly: true },
  { to: '/employees',    icon: <Users size={20} />,        label: 'Employees',      managerOnly: true },
  { to: '/payroll',      icon: <DollarSign size={20} />,   label: 'Payroll',         managerOnly: true },
  { to: '/time-auditor', icon: <ShieldCheck size={20} />,  label: 'Time Auditor',    managerOnly: true },
];

interface SidebarProps {
  lowStockCount?: number;
  onNavigate?: () => void;
}

// ─── Clock widget ─────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ClockWidget() {
  const { user } = useAuth();
  const { session, isClockedIn } = useClockStatus(user?.uid);
  const { settings: locationSettings, loaded: locationLoaded } = useLocationSettings();
  const [elapsed, setElapsed] = useState('');
  const [busy, setBusy] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [actionError, setActionError] = useState('');

  // Tick the elapsed timer
  useEffect(() => {
    if (!session) { setElapsed(''); return; }
    function tick() {
      const mins = Math.floor((Date.now() - session!.clockIn.getTime()) / 60000);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [session]);

  async function doClockAction() {
    if (!user) return;
    if (isClockedIn && session) {
      await clockOut(session.recordId, user.uid);
    } else {
      await clockIn(user.uid, user.name);
    }
  }

  async function handleClock() {
    if (!user) return;
    if (!locationLoaded) return; // wait for settings to load before allowing clock action
    setGeoError('');
    setActionError('');
    setBusy(true);

    if (locationSettings?.enabled) {
      // Guard: coordinates must be present and non-zero
      if (!locationSettings.lat || !locationSettings.lng) {
        setGeoError('Geofence is enabled but not configured. Contact your manager.');
        setBusy(false);
        return;
      }
      if (!navigator.geolocation) {
        setGeoError('Geolocation not supported by your browser.');
        setBusy(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const dist = haversineMeters(
            pos.coords.latitude, pos.coords.longitude,
            locationSettings.lat, locationSettings.lng
          );
          if (dist > locationSettings.radiusMeters) {
            setGeoError(`Too far from work site (${Math.round(dist)}m away, limit ${locationSettings.radiusMeters}m).`);
            setBusy(false);
            return;
          }
          try { await doClockAction(); }
          catch { setActionError('Something went wrong. Please try again.'); }
          finally { setBusy(false); }
        },
        (err) => {
          const msg = err.code === 1
            ? 'Location access denied. Enable location permission to clock in/out.'
            : err.code === 3
            ? 'Location timed out. Make sure GPS is enabled and try again.'
            : 'Could not get your location. Try again.';
          setGeoError(msg);
          setBusy(false);
        },
        { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
      );
    } else {
      try { await doClockAction(); }
      catch { setActionError('Something went wrong. Please try again.'); }
      finally { setBusy(false); }
    }
  }

  return (
    <div className="mx-3 mb-3 rounded-xl overflow-hidden"
         style={isClockedIn
           ? { background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.35)', boxShadow: '0 0 12px rgba(34,197,94,0.12)' }
           : { background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)' }
         }>

      {/* Status banner */}
      <div className="px-3 pt-2.5 pb-2 flex items-center justify-between"
           style={{ borderBottom: isClockedIn ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2">
          <Clock size={15} style={{ color: isClockedIn ? '#22c55e' : '#7d8590' }} />
          <span className="text-xs font-bold uppercase tracking-wide"
                style={{ color: isClockedIn ? '#22c55e' : '#7d8590' }}>
            {isClockedIn ? 'Clocked In' : 'Not Clocked In'}
          </span>
        </div>
        {isClockedIn && (
          <span className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0" style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
        )}
      </div>

      {/* Elapsed time when clocked in */}
      {isClockedIn && elapsed && (
        <div className="px-3 pt-1.5 pb-0.5">
          <span className="text-lg font-bold font-mono" style={{ color: '#e6edf3' }}>{elapsed}</span>
          <span className="text-xs ml-1.5" style={{ color: '#7d8590' }}>elapsed</span>
        </div>
      )}

      {/* Action button */}
      <div className="px-3 pt-2 pb-2.5">
        <button
          onClick={handleClock}
          disabled={busy || !locationLoaded}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 press-active focus-ring"
          style={isClockedIn
            ? { background: 'rgba(248,81,73,0.2)', color: '#f85149', border: '1px solid rgba(248,81,73,0.4)' }
            : { background: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }
          }
        >
          {busy
            ? <Loader2 size={14} className="animate-spin" />
            : isClockedIn ? <LogOutIcon size={14} /> : <LogIn size={14} />
          }
          {busy ? 'Please wait…' : isClockedIn ? 'Clock Out' : 'Clock In'}
        </button>
      </div>

      {!locationLoaded && !busy && (
        <p className="text-xs px-3 pb-2 leading-tight" style={{ color: '#7d8590' }}>Checking location settings…</p>
      )}
      {geoError && (
        <p className="text-xs px-3 pb-2 leading-tight" style={{ color: '#f85149' }}>{geoError}</p>
      )}
      {actionError && (
        <p className="text-xs px-3 pb-2 leading-tight" style={{ color: '#f85149' }}>{actionError}</p>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar({ lowStockCount = 0, onNavigate }: SidebarProps) {
  const { user, signOut, isManager, isSupervisor, isOwner } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.managerOnly && !isManager) return false;
    if (item.supervisorOnly && !isSupervisor) return false;
    return true;
  });

  return (
    <aside className="flex flex-col h-full" style={{ background: '#0d1117', borderRight: '1px solid rgba(255,255,255,0.06)', width: '260px', minWidth: '260px' }}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
            <path d="M4 6L13 26H16H19L28 6H23L16 20L9 6H4Z" fill="white"/>
          </svg>
        </div>
        <div>
          <div className="font-bold text-base leading-none" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
            V-Carts
          </div>
          <div className="text-xs mt-1" style={{ color: '#7d8590' }}>
            IPPS {isOwner ? 'Admin' : isManager ? 'Manager' : user?.role === 'administration' ? 'Staff' : 'Worker'}
          </div>
        </div>
      </div>

      {/* Low stock alert */}
      {isManager && lowStockCount > 0 && (
        <div className="mx-3 mb-3 px-3 py-2 rounded-lg flex items-center gap-2 text-xs"
             style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.25)', color: '#f85149' }}>
          <AlertTriangle size={13} className="shrink-0" />
          <span><strong>{lowStockCount}</strong> item{lowStockCount > 1 ? 's' : ''} low stock</span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-3 flex-1 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all ${
                isActive ? 'active-nav' : 'inactive-nav'
              }`
            }
            style={({ isActive }) => ({
              background: isActive ? 'rgba(34,197,94,0.1)' : 'transparent',
              color: isActive ? '#22c55e' : '#7d8590',
              borderLeft: isActive ? '2px solid #22c55e' : '2px solid transparent',
            })}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Clock widget */}
      {!isOwner && <ClockWidget />}

      {/* User + Logout */}
      <div className="px-3 pb-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
               style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
            {user?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate" style={{ color: '#e6edf3' }}>{user?.name}</div>
            <div className="text-xs truncate" style={{ color: '#7d8590' }}>
              {isOwner ? 'Admin' : user?.role === 'administration' ? 'Staff' : user?.role === 'manager' ? 'Manager' : 'Worker'}
            </div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all hover:bg-white/5"
          style={{ color: '#7d8590' }}
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
