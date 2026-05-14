import React, { useEffect, useMemo, useState } from 'react';
import { Download, Users, TrendingUp } from 'lucide-react';
import { PAYROLL_TIERS, WEEKLY_TIERS, calcWeeklyPay, BASE_WEEKLY_PAY, MANAGER_BONUS } from '../types';
import { useMonthlyPasses } from '../hooks/useMonthlyPasses';
import { useUsers } from '../hooks/useUsers';
import { useTimeRecords } from '../hooks/useTimeRecords';

function weekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const start = new Date(now);
  start.setDate(now.getDate() - (day + 6) % 7); // Monday start
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function exportCSV(results: ReturnType<typeof calcWeeklyPay>) {
  const header = 'Name,Hours,Base Pay,Bonus,Total Pay\n';
  const rows = results.results.map(r =>
    `${r.name},${r.hours},$${r.basePay.toFixed(2)},$${r.bonus.toFixed(2)},$${r.totalPay.toFixed(2)}`
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vcarts-payroll-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Payroll() {
  const { count: liveCount, loading: passesLoading } = useMonthlyPasses();
  const { users } = useUsers();
  const { start, end } = useMemo(weekBounds, []);
  const { records, loading: recordsLoading } = useTimeRecords(start, end);

  const [cartsThisWeek, setCartsThisWeek] = useState(0);

  // Seed cart count from live monthly data ÷ 4
  useEffect(() => {
    if (!passesLoading && liveCount > 0) {
      setCartsThisWeek(Math.round(liveCount / 4));
    }
  }, [liveCount, passesLoading]);

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  // Build worker list: bonus-eligible active users only, with their hours this week
  const workers = useMemo(() => {
    return users
      .filter(u => u.active && (u.bonusEligible || u.basePayOnly))
      .map(u => {
        const userRecords = records.filter(r => r.userId === u.uid && r.durationMinutes != null);
        const totalMins = userRecords.reduce((s, r) => s + (r.durationMinutes ?? 0), 0);
        const hours = parseFloat((totalMins / 60).toFixed(1));
        return {
          uid: u.uid,
          name: u.name,
          hours,
          managerBonus: u.managerBonus ?? false,
          basePayOnly: u.basePayOnly ?? false,
        };
      });
  }, [users, records]);

  const payroll = useMemo(() => calcWeeklyPay(cartsThisWeek, workers), [cartsThisWeek, workers]);

  const currentTier = WEEKLY_TIERS.find(t => t.cartsPerWeek <= cartsThisWeek &&
    cartsThisWeek < (WEEKLY_TIERS[WEEKLY_TIERS.indexOf(t) + 1]?.cartsPerWeek ?? Infinity));

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
            Payroll
          </h1>
          <p className="text-sm mt-1" style={{ color: '#7d8590' }}>Weekly weighted-bonus payroll</p>
        </div>
        <button
          onClick={() => exportCSV(payroll)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl p-5" style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
          <label className="text-xs font-medium uppercase tracking-wider block mb-3" style={{ color: '#7d8590' }}>
            QC-Passed Carts This Week
          </label>
          <input
            type="number"
            min={0}
            value={cartsThisWeek}
            onChange={e => setCartsThisWeek(Number(e.target.value))}
            className="w-full px-4 py-2.5 rounded-lg text-lg font-bold outline-none"
            style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#22c55e' }}
          />
          <p className="text-xs mt-1.5" style={{ color: '#7d8590' }}>
            {!passesLoading ? `Monthly live: ${liveCount} (÷4 = ~${Math.round(liveCount/4)}/wk)` : 'Loading…'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Rate/Cart', value: payroll.ratePerCart > 0 ? `$${payroll.ratePerCart}` : '—' },
            { label: 'Weekly Pool', value: fmt(payroll.weeklyPool) },
            { label: 'Bonus Pool', value: fmt(payroll.bonusPool) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl p-4 flex flex-col justify-between"
                 style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#7d8590' }}>{label}</p>
              <p className="text-lg font-bold" style={{ color: '#22c55e' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tier reference */}
      <div className="rounded-xl overflow-hidden mb-8" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-4 py-3" style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#e6edf3' }}>
            <TrendingUp size={15} style={{ color: '#22c55e' }} />
            Weekly Pay Tiers
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Carts/Week', 'Rate/Cart', 'Weekly Pool'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#7d8590' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKLY_TIERS.map((t, i) => {
              const isActive = payroll.ratePerCart === t.ratePerCart && payroll.weeklyPool > 0;
              return (
                <tr key={t.cartsPerWeek}
                    style={{ background: isActive ? 'rgba(34,197,94,0.06)' : i % 2 === 0 ? '#0d1117' : 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: isActive ? '#22c55e' : '#e6edf3' }}>{t.cartsPerWeek}</td>
                  <td className="px-4 py-3" style={{ color: '#e6edf3' }}>${t.ratePerCart}</td>
                  <td className="px-4 py-3" style={{ color: '#e6edf3' }}>{fmt(t.cartsPerWeek * t.ratePerCart)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-worker breakdown */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-4 py-3 flex items-center justify-between"
             style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#e6edf3' }}>
            <Users size={15} style={{ color: '#22c55e' }} />
            Bonus Eligible Workers
          </h2>
          {recordsLoading && <span className="text-xs" style={{ color: '#7d8590' }}>Loading hours…</span>}
        </div>
        {payroll.results.filter(r => !r.basePayOnly).length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: '#7d8590' }}>
            No bonus-eligible workers found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Name', 'Hours', 'Base Pay', 'Bonus', 'Total Pay'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#7d8590' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...payroll.results].filter(r => !r.basePayOnly).sort((a, b) => b.totalPay - a.totalPay).map((r, i) => (
                <tr key={r.uid}
                    style={{ background: i % 2 === 0 ? '#0d1117' : 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: '#e6edf3' }}>
                    {r.name}
                    {r.managerBonus && <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>+$100</span>}
                  </td>
                  <td className="px-4 py-3" style={{ color: '#7d8590' }}>{r.hours}h</td>
                  <td className="px-4 py-3" style={{ color: '#e6edf3' }}>{fmt(r.basePay)}</td>
                  <td className="px-4 py-3" style={{ color: '#22c55e' }}>{fmt(r.bonus)}</td>
                  <td className="px-4 py-3 font-bold text-base" style={{ color: '#22c55e' }}>{fmt(r.totalPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Base pay only workers */}
      {payroll.results.some(r => r.basePayOnly) && (
        <div className="rounded-xl overflow-hidden mt-6" style={{ border: '1px solid rgba(59,130,246,0.2)' }}>
          <div className="px-4 py-3" style={{ background: 'rgba(59,130,246,0.06)', borderBottom: '1px solid rgba(59,130,246,0.15)' }}>
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#e6edf3' }}>
              <Users size={15} style={{ color: '#3b82f6' }} />
              Base Pay Only — New Hires
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#7d8590' }}>Not included in bonus pool. Base pay deducted from weekly pool.</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Name', 'Hours', 'Base Pay', 'Bonus', 'Total Pay'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#7d8590' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payroll.results.filter(r => r.basePayOnly).sort((a, b) => b.totalPay - a.totalPay).map((r, i) => (
                <tr key={r.uid}
                    style={{ background: i % 2 === 0 ? '#0d1117' : 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: '#e6edf3' }}>
                    {r.name}
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>New Hire</span>
                  </td>
                  <td className="px-4 py-3" style={{ color: '#7d8590' }}>{r.hours}h</td>
                  <td className="px-4 py-3" style={{ color: '#e6edf3' }}>{fmt(r.basePay)}</td>
                  <td className="px-4 py-3" style={{ color: '#7d8590' }}>—</td>
                  <td className="px-4 py-3 font-bold" style={{ color: '#e6edf3' }}>{fmt(r.totalPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
