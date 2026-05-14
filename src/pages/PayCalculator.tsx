import React, { useMemo, useState } from 'react';
import { TrendingUp, DollarSign, Clock, Zap } from 'lucide-react';
import { WEEKLY_TIERS, calcWeeklyPay, BASE_WEEKLY_PAY, MANAGER_BONUS } from '../types';

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function PayCalculator() {
  const [myHours, setMyHours] = useState(40);
  const [teamSize, setTeamSize] = useState(14);
  const [cartsPerWeek, setCartsPerWeek] = useState(40);
  const [isManager, setIsManager] = useState(false);

  // Simulate team: everyone else works 40 hrs standard
  const workers = useMemo(() => {
    const others = Array.from({ length: teamSize - 1 }, (_, i) => ({
      uid: `other-${i}`,
      name: `Worker ${i + 1}`,
      hours: 40,
      managerBonus: false,
      basePayOnly: false,
    }));
    return [
      { uid: 'me', name: 'You', hours: myHours, managerBonus: isManager, basePayOnly: false },
      ...others,
    ];
  }, [myHours, teamSize, isManager]);

  const payroll = useMemo(() => calcWeeklyPay(cartsPerWeek, workers), [cartsPerWeek, workers]);
  const myResult = payroll.results.find(r => r.uid === 'me')!;

  const activeTierIdx = WEEKLY_TIERS.findIndex(t => t.ratePerCart === payroll.ratePerCart);
  const activeTier = activeTierIdx >= 0 ? WEEKLY_TIERS[activeTierIdx] : null;

  const maxPossible = useMemo(() => {
    const maxWorkers = [
      { uid: 'me', name: 'You', hours: 70, managerBonus: isManager, basePayOnly: false },
      ...Array.from({ length: teamSize - 1 }, (_, i) => ({ uid: `o${i}`, name: `w${i}`, hours: 70, managerBonus: false, basePayOnly: false })),
    ];
    const top = calcWeeklyPay(50, maxWorkers);
    return top.results.find(r => r.uid === 'me')?.totalPay ?? 0;
  }, [teamSize, isManager]);

  const barPct = maxPossible > 0 ? Math.min((myResult?.totalPay ?? 0) / maxPossible * 100, 100) : 0;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
          Pay Calculator
        </h1>
        <p className="text-sm" style={{ color: '#7d8590' }}>
          See exactly what you could earn. Every hour counts.
        </p>
      </div>

      {/* Big money display */}
      <div className="rounded-2xl p-8 mb-6 text-center relative overflow-hidden"
           style={{ background: 'linear-gradient(135deg, #0d1117 0%, #161b27 100%)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(34,197,94,0.08) 0%, transparent 70%)' }} />
        <p className="text-sm font-medium uppercase tracking-widest mb-2" style={{ color: '#22c55e' }}>
          Your Take-Home This Week
        </p>
        <p className="text-6xl font-bold mb-1" style={{ color: '#e6edf3', fontFamily: 'Outfit, Inter, sans-serif' }}>
          {fmt(myResult?.totalPay ?? 0)}
        </p>
        <div className="flex items-center justify-center gap-6 mt-4 text-sm" style={{ color: '#7d8590' }}>
          <span>Base: <strong style={{ color: '#e6edf3' }}>{fmt(myResult?.basePay ?? 0)}</strong></span>
          <span>·</span>
          <span>Bonus: <strong style={{ color: '#22c55e' }}>{fmt(myResult?.bonus ?? 0)}</strong></span>
        </div>

        {/* Progress bar vs max */}
        <div className="mt-6">
          <div className="flex justify-between text-xs mb-1.5" style={{ color: '#7d8590' }}>
            <span>$0</span>
            <span>Max potential: {fmt(maxPossible)}</span>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${barPct}%`, background: 'linear-gradient(90deg, #16a34a, #22c55e)' }}
            />
          </div>
          <p className="text-xs mt-1.5" style={{ color: '#7d8590' }}>
            {Math.round(barPct)}% of your max possible earnings
          </p>
        </div>
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-1 gap-4 mb-6">

        {/* My Hours */}
        <div className="rounded-xl p-5" style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={15} style={{ color: '#22c55e' }} />
              <span className="text-sm font-medium" style={{ color: '#e6edf3' }}>Your Hours This Week</span>
            </div>
            <span className="text-lg font-bold" style={{ color: '#22c55e' }}>{myHours}h</span>
          </div>
          <input
            type="range" min={8} max={70} value={myHours}
            onChange={e => setMyHours(Number(e.target.value))}
            className="w-full accent-green-500"
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: '#7d8590' }}>
            <span>8h</span>
            <span>Standard: 40h</span>
            <span>70h</span>
          </div>
          {myHours < 40 && (
            <p className="text-xs mt-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(248,81,73,0.08)', color: '#f85149' }}>
              Under 40 hrs — base pay prorated to {fmt(Math.min(myHours / 40, 1) * BASE_WEEKLY_PAY + (isManager ? MANAGER_BONUS : 0))}
            </p>
          )}
          {myHours > 40 && (
            <p className="text-xs mt-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e' }}>
              {myHours - 40}h overtime — bigger bonus share, same base
            </p>
          )}
        </div>

        {/* Carts this week */}
        <div className="rounded-xl p-5" style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} style={{ color: '#22c55e' }} />
              <span className="text-sm font-medium" style={{ color: '#e6edf3' }}>Carts Built This Week</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold" style={{ color: '#22c55e' }}>{cartsPerWeek}</span>
              {activeTier && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                  ${activeTier.ratePerCart}/cart
                </span>
              )}
            </div>
          </div>
          <input
            type="range" min={20} max={55} value={cartsPerWeek}
            onChange={e => setCartsPerWeek(Number(e.target.value))}
            className="w-full accent-green-500"
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: '#7d8590' }}>
            <span>20</span>
            {WEEKLY_TIERS.map(t => (
              <span key={t.cartsPerWeek} style={{ color: cartsPerWeek >= t.cartsPerWeek ? '#22c55e' : '#7d8590' }}>
                {t.cartsPerWeek}
              </span>
            ))}
            <span>55</span>
          </div>

          {/* Tier unlock status */}
          <div className="flex gap-2 mt-3 flex-wrap">
            {WEEKLY_TIERS.map((t, i) => {
              const unlocked = cartsPerWeek >= t.cartsPerWeek;
              const isCurrentTier = payroll.ratePerCart === t.ratePerCart && payroll.weeklyPool > 0;
              return (
                <div key={t.cartsPerWeek}
                     className="flex-1 min-w-0 text-center py-1.5 rounded-lg text-xs font-medium"
                     style={{
                       background: isCurrentTier ? 'rgba(34,197,94,0.15)' : unlocked ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)',
                       color: isCurrentTier ? '#22c55e' : unlocked ? '#4ade80' : '#7d8590',
                       border: isCurrentTier ? '1px solid rgba(34,197,94,0.3)' : '1px solid transparent',
                     }}>
                  T{i + 1}<br />
                  <span style={{ opacity: 0.7 }}>{t.cartsPerWeek}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Team size + manager */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl p-5" style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Zap size={15} style={{ color: '#22c55e' }} />
              <span className="text-sm font-medium" style={{ color: '#e6edf3' }}>Team Size</span>
            </div>
            <input
              type="number" min={1} max={30} value={teamSize}
              onChange={e => setTeamSize(Math.max(1, Number(e.target.value)))}
              className="w-full px-3 py-2 rounded-lg text-xl font-bold outline-none text-center"
              style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
            />
            <p className="text-xs mt-1.5 text-center" style={{ color: '#7d8590' }}>workers sharing pool</p>
          </div>

          <div className="rounded-xl p-5" style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={15} style={{ color: '#fbbf24' }} />
              <span className="text-sm font-medium" style={{ color: '#e6edf3' }}>Manager Bonus</span>
            </div>
            <button
              onClick={() => setIsManager(!isManager)}
              className="w-full py-2 rounded-lg text-sm font-semibold transition-all"
              style={isManager
                ? { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }
                : { background: 'rgba(255,255,255,0.04)', color: '#7d8590', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {isManager ? '+$100 ON' : '+$100 OFF'}
            </button>
            <p className="text-xs mt-1.5 text-center" style={{ color: '#7d8590' }}>manager base bonus</p>
          </div>
        </div>
      </div>

      {/* "What if" scenarios */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-4 py-3" style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#e6edf3' }}>What You Could Make — All Tiers</h2>
          <p className="text-xs mt-0.5" style={{ color: '#7d8590' }}>Your pay at {myHours}h with the team at each cart tier</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Tier', 'Carts/Wk', 'Pool', 'Your Bonus', 'Your Total'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#7d8590' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKLY_TIERS.map((t, i) => {
              const sim = calcWeeklyPay(t.cartsPerWeek, workers.map(w => ({ ...w, hours: w.uid === 'me' ? myHours : 40, basePayOnly: false })));
              const me = sim.results.find(r => r.uid === 'me')!;
              const isActive = t.ratePerCart === payroll.ratePerCart && payroll.weeklyPool > 0;
              return (
                <tr key={t.cartsPerWeek}
                    style={{ background: isActive ? 'rgba(34,197,94,0.06)' : i % 2 === 0 ? '#0d1117' : 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: isActive ? '#22c55e' : '#e6edf3' }}>T{i + 1}</td>
                  <td className="px-4 py-3" style={{ color: '#7d8590' }}>{t.cartsPerWeek}</td>
                  <td className="px-4 py-3" style={{ color: '#e6edf3' }}>{fmt(sim.weeklyPool)}</td>
                  <td className="px-4 py-3" style={{ color: '#22c55e' }}>{fmt(me.bonus)}</td>
                  <td className="px-4 py-3 font-bold" style={{ color: isActive ? '#22c55e' : '#e6edf3' }}>{fmt(me.totalPay)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-center mt-4" style={{ color: '#7d8590' }}>
        Simulation assumes all other workers put in 40h. Your actual pay depends on real team hours.
      </p>
    </div>
  );
}
