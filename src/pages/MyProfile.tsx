import React, { useMemo } from 'react';
import { User, Clock, DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTimeRecords } from '../hooks/useTimeRecords';
import { useMonthlyPasses } from '../hooks/useMonthlyPasses';
import { useUsers } from '../hooks/useUsers';
import { getPayrollTier } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7) + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function getTodayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end   = new Date(); end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatHours(minutes: number | null): string {
  if (!minutes) return '0h 0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(val: unknown): string {
  if (!val) return '—';
  const d = typeof (val as any).toDate === 'function' ? (val as any).toDate() : new Date(val as string);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(val: unknown): string {
  if (!val) return '—';
  const d = typeof (val as any).toDate === 'function' ? (val as any).toDate() : new Date(val as string);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function sumMinutes(records: { durationMinutes: number | null }[]): number {
  return records.reduce((acc, r) => acc + (r.durationMinutes ?? 0), 0);
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = '#22c55e' }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-2"
         style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
             style={{ background: `${color}18` }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#7d8590' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color: '#e6edf3' }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: '#7d8590' }}>{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyProfile() {
  const { user } = useAuth();

  const today    = getTodayRange();
  const thisWeek = getWeekRange(0);
  const lastWeek = getWeekRange(-1);

  const { records: allTodayRecords }    = useTimeRecords(today.start,    today.end);
  const { records: allThisWeekRecords } = useTimeRecords(thisWeek.start, thisWeek.end);
  const { records: allLastWeekRecords } = useTimeRecords(lastWeek.start, lastWeek.end);

  const todayRecords    = allTodayRecords.filter(r => r.userId === user?.uid);
  const thisWeekRecords = allThisWeekRecords.filter(r => r.userId === user?.uid);
  const lastWeekRecords = allLastWeekRecords.filter(r => r.userId === user?.uid);

  // All records for history (last 30 days)
  const historyStart = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0); return d; }, []);
  const { records: allHistoryRecords } = useTimeRecords(historyStart, new Date());
  const historyRecords = allHistoryRecords.filter(r => r.userId === user?.uid);

  const { count: monthlyPasses } = useMonthlyPasses();
  const { users } = useUsers();

  const todayMins    = sumMinutes(todayRecords);
  const thisWeekMins = sumMinutes(thisWeekRecords);
  const lastWeekMins = sumMinutes(lastWeekRecords);

  const assemblerCount = users.filter(u => u.active && u.bonusEligible).length;

  // Earnings estimate
  const { perMan } = useMemo(() => {
    if (!monthlyPasses) return { perMan: 0 };
    return getPayrollTier(monthlyPasses, assemblerCount);
  }, [monthlyPasses, assemblerCount]);

  const roleLabel: Record<string, string> = {
    worker: 'Worker', qc: 'QC Inspector', supervisor: 'Supervisor', manager: 'Manager',
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0"
             style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
          {user?.name?.charAt(0).toUpperCase() ?? '?'}
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
            {user?.name}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
              {roleLabel[user?.role ?? 'worker'] ?? user?.role}
            </span>
            <span className="text-sm" style={{ color: '#7d8590' }}>{user?.email}</span>
          </div>
        </div>
      </div>

      {/* Hours Stats */}
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: '#7d8590' }}>
        Hours
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <StatCard icon={<Clock size={16} />} label="Today"      value={formatHours(todayMins)}    sub={`${todayRecords.length} session${todayRecords.length !== 1 ? 's' : ''}`} />
        <StatCard icon={<Clock size={16} />} label="This Week"  value={formatHours(thisWeekMins)} sub={`${thisWeekRecords.length} session${thisWeekRecords.length !== 1 ? 's' : ''}`} color="#d29922" />
        <StatCard icon={<Clock size={16} />} label="Last Week"  value={formatHours(lastWeekMins)} sub={`${lastWeekRecords.length} session${lastWeekRecords.length !== 1 ? 's' : ''}`} color="#7d8590" />
      </div>

      {/* Earnings Estimate */}
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: '#7d8590' }}>
        Earnings Estimate
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        <StatCard
          icon={<DollarSign size={16} />}
          label="Est. This Month"
          value={perMan > 0 ? `$${perMan.toFixed(2)}` : '—'}
          sub={monthlyPasses ? `Based on ${monthlyPasses} QC passes this month` : 'No QC passes yet this month'}
          color="#22c55e"
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          label="QC Passes This Month"
          value={monthlyPasses?.toString() ?? '0'}
          sub={`${assemblerCount} active builder${assemblerCount !== 1 ? 's' : ''}`}
          color="#a855f7"
        />
      </div>

      {/* Clock-in History */}
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: '#7d8590' }}>
        Recent Clock-In History <span className="normal-case font-normal ml-1">(last 30 days)</span>
      </h2>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        {historyRecords.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: '#7d8590' }}>No time records found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Date', 'Clock In', 'Clock Out', 'Duration'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: '#7d8590' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historyRecords.slice(0, 30).map((r, i) => (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? '#0d1117' : 'rgba(28,35,51,0.4)',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <td className="px-4 py-3 text-xs" style={{ color: '#7d8590' }}>{formatDate(r.clockIn)}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#e6edf3' }}>{formatTime(r.clockIn)}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: r.clockOut ? '#e6edf3' : '#d29922' }}>
                    {r.clockOut ? formatTime(r.clockOut) : 'In progress'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: '#22c55e' }}>
                    {formatHours(r.durationMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
