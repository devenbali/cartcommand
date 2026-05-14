import React, { useState } from 'react';
import {
  CheckCircle2, Clock, AlertTriangle, Wrench, TrendingUp, Package,
  Truck, ArrowRight, Activity, Timer, CalendarDays,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCarts, useTodaysPasses, useCartMetrics, useWeeklyPasses } from '../hooks/useCarts';
import { useInventory } from '../hooks/useInventory';
import { WEEKLY_TIERS } from '../types';
import type { CartStatus } from '../types';

// ─── Color maps ───────────────────────────────────────────────────────────────

const COLOR_DOT: Record<string, string> = {
  Red: '#ef4444', White: '#f1f5f9', Blue: '#3b82f6', Black: '#374151',
  'Matte Grey': '#6b7280', 'Cloud Blue': '#7dd3fc', Burgundy: '#9f1239',
  Silver: '#c0c0c0', Brown: '#92400e', Grey: '#6b7280',
};

const COLOR_TEXT: Record<string, string> = {
  Red: '#f87171', White: '#e2e8f0', Blue: '#60a5fa', Black: '#9ca3af',
  'Matte Grey': '#b0b7bf', 'Cloud Blue': '#93c5fd', Burgundy: '#fb7185',
  Silver: '#d1d5db', Brown: '#d4a574', Grey: '#b0b7bf',
};

function ColorChip({ color }: { color: string }) {
  const dot  = COLOR_DOT[color]  ?? '#7d8590';
  const text = COLOR_TEXT[color] ?? '#7d8590';
  const needsBorder = color === 'White' || color === 'Silver';
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: dot, border: needsBorder ? '1px solid rgba(255,255,255,0.25)' : undefined }} />
      <span style={{ color: text }}>{color}</span>
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <div className="rounded-xl p-6 flex items-start gap-4"
         style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
           style={{ background: color + '1a', color }}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#7d8590' }}>{label}</p>
        <p className="text-3xl font-bold" style={{ color: '#e6edf3' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: '#7d8590' }}>{sub}</p>}
      </div>
    </div>
  );
}

interface PipelineStageProps {
  label: string;
  count: number;
  color: string;
  isLast?: boolean;
}

function PipelineStage({ label, count, color, isLast }: PipelineStageProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
        <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold"
             style={{ background: count > 0 ? color + '20' : '#1c2333', color: count > 0 ? color : '#3d4451', border: `1px solid ${count > 0 ? color + '40' : 'rgba(255,255,255,0.04)'}` }}>
          {count}
        </div>
        <span className="text-sm text-center leading-tight" style={{ color: count > 0 ? '#7d8590' : '#3d4451' }}>{label}</span>
      </div>
      {!isLast && <ArrowRight size={14} style={{ color: '#3d4451', flexShrink: 0 }} />}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, isManager } = useAuth();
  const todaysPasses = useTodaysPasses();
  const { count: weeklyPasses, weekStart } = useWeeklyPasses();
  const { carts, flagged, inQueue, readyToPaint, painting, readyToShip, active, loading } = useCarts();

  // Group ready_to_ship carts by shippingDate — each group is an "order"
  const shipOrders = React.useMemo(() => {
    const withDate = readyToShip.filter(c => c.shippingDate);
    const map = new Map<string, typeof readyToShip>();
    for (const c of withDate) {
      const d = c.shippingDate as string;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(c);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, carts]) => ({ date, carts }));
  }, [readyToShip]);
  const { lowStock } = useInventory();
  const metrics = useCartMetrics();
  const [metricPeriod, setMetricPeriod] = useState<'day' | 'week' | 'month'>('week');

  const monthTotal = carts.filter(c => {
    if (c.status !== 'qc_pass' || !c.qcPassedAt) return false;
    const d = (c.qcPassedAt as unknown as { toDate?: () => Date }).toDate?.() ?? new Date(c.qcPassedAt as unknown as string);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const pipelineStages: { label: string; count: number; color: string; status: CartStatus }[] = [
    { label: 'Intake',       count: active.filter(c => c.status === 'intake').length, color: '#7d8590', status: 'intake' },
    { label: 'Building',     count: active.filter(c => c.status === 'built').length,  color: '#3b82f6', status: 'built' },
    { label: 'QC Queue',     count: inQueue.length,                                   color: '#d29922', status: 'in_queue' },
    { label: 'QC Fail',      count: flagged.length,                                   color: '#f85149', status: 'qc_fail' },
    { label: 'QC Pass',      count: readyToPaint.length,                              color: '#22c55e', status: 'qc_pass' },
    { label: 'Painting',     count: painting.length,                                  color: '#a855f7', status: 'painted' },
    { label: 'Ship Queue',   count: readyToShip.length,                               color: '#06b6d4', status: 'ready_to_ship' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-screen-2xl mx-auto">

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
            {greeting}, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#7d8590' }}>{dateStr}</p>
        </div>
        {flagged.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
               style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.2)', color: '#f85149' }}>
            <AlertTriangle size={14} />
            <span>{flagged.length} cart{flagged.length > 1 ? 's' : ''} flagged</span>
          </div>
        )}
      </div>

      {/* ─── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard label="QC Pass Today"  value={todaysPasses}   sub="carts completed"  icon={<CheckCircle2 size={20}/>} color="#22c55e" />
        <StatCard label="In Production"  value={carts.length}   sub="active builds"    icon={<Wrench size={20}/>}       color="#3b82f6" />
        <StatCard label="QC Flagged"     value={flagged.length} sub="need rework"      icon={<AlertTriangle size={20}/>} color="#f85149" />
        <StatCard label="Month Total"    value={monthTotal}     sub="carts this month" icon={<TrendingUp size={20}/>}   color="#d29922" />
      </div>

      {/* ─── Weekly Cart Counter ────────────────────────────────────────────── */}
      {(() => {
        const sorted = [...WEEKLY_TIERS].sort((a, b) => b.cartsPerWeek - a.cartsPerWeek);
        const currentTier = sorted.find(t => weeklyPasses >= t.cartsPerWeek) ?? null;
        const nextTier = WEEKLY_TIERS.find(t => t.cartsPerWeek > (currentTier?.cartsPerWeek ?? 0)) ?? null;
        const cartsToNext = nextTier ? nextTier.cartsPerWeek - weeklyPasses : 0;
        const topTier = WEEKLY_TIERS[WEEKLY_TIERS.length - 1];
        const barMax = topTier.cartsPerWeek + 5;
        const barPct = Math.min(weeklyPasses / barMax * 100, 100);
        const weekLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const pool = currentTier ? weeklyPasses * currentTier.ratePerCart : 0;
        const atTop = currentTier?.cartsPerWeek === topTier.cartsPerWeek;

        return (
          <div className="rounded-xl p-6 mb-6 relative overflow-hidden"
               style={{ background: '#161b27', border: `1px solid ${currentTier ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
            <div className="absolute inset-0 pointer-events-none"
                 style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(34,197,94,0.05) 0%, transparent 60%)' }} />

            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#7d8590' }}>
                  Team Carts This Week — {weekLabel}
                </p>
                <div className="flex items-end gap-3">
                  <span className="text-5xl font-bold leading-none" style={{ color: '#e6edf3', fontFamily: 'Outfit, Inter, sans-serif' }}>
                    {weeklyPasses}
                  </span>
                  <div className="mb-1">
                    {currentTier ? (
                      <span className="text-sm font-bold px-2.5 py-1 rounded-full"
                            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                        Tier {WEEKLY_TIERS.indexOf(currentTier) + 1} — ${currentTier.ratePerCart}/cart
                      </span>
                    ) : (
                      <span className="text-sm font-bold px-2.5 py-1 rounded-full"
                            style={{ background: 'rgba(125,133,144,0.12)', color: '#7d8590' }}>
                        Below Tier 1
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-xs mb-1" style={{ color: '#7d8590' }}>Bonus Pool So Far</p>
                <p className="text-2xl font-bold" style={{ color: currentTier ? '#22c55e' : '#7d8590', fontFamily: 'Outfit, Inter, sans-serif' }}>
                  {pool > 0 ? pool.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—'}
                </p>
                {currentTier && (
                  <p className="text-xs mt-0.5" style={{ color: '#7d8590' }}>
                    {weeklyPasses} × ${currentTier.ratePerCart}
                  </p>
                )}
              </div>
            </div>

            {/* Progress bar across all tiers */}
            <div className="mb-3">
              <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${barPct}%`, background: atTop ? 'linear-gradient(90deg, #16a34a, #22c55e, #4ade80)' : 'linear-gradient(90deg, #16a34a, #22c55e)' }} />
                {/* Tier tick marks */}
                {WEEKLY_TIERS.map(t => (
                  <div key={t.cartsPerWeek}
                       className="absolute top-0 bottom-0 w-px"
                       style={{ left: `${t.cartsPerWeek / barMax * 100}%`, background: 'rgba(255,255,255,0.15)' }} />
                ))}
              </div>
              {/* Tier labels */}
              <div className="relative mt-1.5" style={{ height: '16px' }}>
                {WEEKLY_TIERS.map((t, i) => {
                  const isActive = currentTier?.cartsPerWeek === t.cartsPerWeek;
                  const isPassed = weeklyPasses >= t.cartsPerWeek;
                  return (
                    <span key={t.cartsPerWeek}
                          className="absolute text-xs font-semibold transform -translate-x-1/2"
                          style={{ left: `${t.cartsPerWeek / barMax * 100}%`, color: isActive ? '#22c55e' : isPassed ? '#4ade80' : '#3d4451' }}>
                      T{i + 1}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Call to action */}
            <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              {atTop ? (
                <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>
                  MAX TIER — every extra cart adds to the bonus pool
                </p>
              ) : nextTier ? (
                <p className="text-sm" style={{ color: '#7d8590' }}>
                  <strong style={{ color: '#e6edf3' }}>{cartsToNext} more cart{cartsToNext !== 1 ? 's' : ''}</strong> to unlock{' '}
                  <span style={{ color: '#22c55e' }}>Tier {WEEKLY_TIERS.indexOf(nextTier) + 1} (${nextTier.ratePerCart}/cart — {(nextTier.cartsPerWeek * nextTier.ratePerCart).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} pool)</span>
                </p>
              ) : (
                <p className="text-sm" style={{ color: '#7d8590' }}>Build {WEEKLY_TIERS[0].cartsPerWeek} carts to unlock Tier 1</p>
              )}
              <span className="text-xs shrink-0 ml-4" style={{ color: '#7d8590' }}>
                Today: {todaysPasses} QC pass{todaysPasses !== 1 ? 'es' : ''}
              </span>
            </div>
          </div>
        );
      })()}

      {/* ─── Pipeline ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl p-6 mb-6"
           style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-base" style={{ color: '#e6edf3' }}>Production Pipeline</h2>
          <Activity size={16} style={{ color: '#7d8590' }} />
        </div>
        {loading ? (
          <p className="text-sm" style={{ color: '#7d8590' }}>Loading…</p>
        ) : (
          /* Horizontal scroll on mobile so pipeline stays linear */
          <div className="overflow-x-auto -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            <div className="flex items-center gap-2" style={{ minWidth: 'max-content' }}>
              {pipelineStages.map((stage, i) => (
                <PipelineStage
                  key={stage.status}
                  label={stage.label}
                  count={stage.count}
                  color={stage.color}
                  isLast={i === pipelineStages.length - 1}
                />
              ))}
              <ArrowRight size={14} style={{ color: '#3d4451', flexShrink: 0 }} />
              <div className="flex flex-col items-center gap-1.5 min-w-[64px]">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                     style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <Truck size={20} style={{ color: '#06b6d4' }} />
                </div>
                <span className="text-xs text-center" style={{ color: '#3d4451' }}>Ship</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── QC Queue ───────────────────────────────────────────────────────── */}
      {inQueue.length > 0 && (
        <div className="rounded-xl p-5 mb-6"
             style={{ background: '#161b27', border: '1px solid rgba(210,153,34,0.25)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={15} style={{ color: '#d29922' }} />
            <h2 className="font-semibold text-sm" style={{ color: '#d29922' }}>
              Awaiting QC Inspection
            </h2>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(210,153,34,0.12)', color: '#d29922' }}>
              {inQueue.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {inQueue.map(cart => (
              <div key={cart.id} className="flex items-start gap-3 px-4 py-3 rounded-xl"
                   style={{ background: 'rgba(210,153,34,0.06)', border: '1px solid rgba(210,153,34,0.12)' }}>
                {cart.vinPhotoUrl && (
                  <img src={cart.vinPhotoUrl} alt="VIN"
                       className="w-14 h-10 object-cover rounded-lg shrink-0"
                       style={{ border: '1px solid rgba(255,255,255,0.06)' }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm" style={{ color: '#e6edf3' }}>{cart.vin}</span>
                    <span className="text-xs font-medium" style={{ color: '#7d8590' }}>{cart.model}</span>
                    <ColorChip color={cart.shellColor} />
                    <span style={{ color: '#30363d' }}>/</span>
                    <ColorChip color={cart.seatColor} />
                    {cart.dealerName && (
                      <span className="text-xs" style={{ color: '#7d8590' }}>{cart.dealerName}</span>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: '#d29922' }}>Ready for QC inspection</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── QC Flagged ─────────────────────────────────────────────────────── */}
      {flagged.length > 0 && (
        <div className="rounded-xl p-5 mb-6"
             style={{ background: '#161b27', border: '1px solid rgba(248,81,73,0.25)' }}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={15} style={{ color: '#f85149' }} />
            <h2 className="font-semibold text-sm" style={{ color: '#f85149' }}>
              QC Flagged — Needs Rework
            </h2>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(248,81,73,0.12)', color: '#f85149' }}>
              {flagged.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {flagged.map(cart => (
              <div key={cart.id} className="flex items-start gap-3 px-4 py-3 rounded-xl"
                   style={{ background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.12)' }}>
                {cart.vinPhotoUrl && (
                  <img src={cart.vinPhotoUrl} alt="VIN"
                       className="w-14 h-10 object-cover rounded-lg shrink-0"
                       style={{ border: '1px solid rgba(255,255,255,0.06)' }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm" style={{ color: '#e6edf3' }}>{cart.vin}</span>
                    <span className="text-xs font-medium" style={{ color: '#7d8590' }}>{cart.model}</span>
                    <ColorChip color={cart.shellColor} />
                    <span style={{ color: '#30363d' }}>/</span>
                    <ColorChip color={cart.seatColor} />
                    {cart.dealerName && (
                      <span className="text-xs" style={{ color: '#7d8590' }}>{cart.dealerName}</span>
                    )}
                  </div>
                  {cart.qcFailReason && (
                    <p className="text-xs mt-1.5 leading-snug"
                       style={{ color: '#f85149' }}>
                      <span style={{ color: '#7d8590' }}>Fail reason: </span>{cart.qcFailReason}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Upcoming Shipments ─────────────────────────────────────────────── */}
      {shipOrders.length > 0 && (
        <div className="rounded-xl p-5 mb-6"
             style={{ background: '#161b27', border: '1px solid rgba(6,182,212,0.25)' }}>
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays size={15} style={{ color: '#06b6d4' }} />
            <h2 className="font-semibold text-sm" style={{ color: '#06b6d4' }}>Upcoming Shipments</h2>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4' }}>
              {shipOrders.reduce((n, o) => n + o.carts.length, 0)} cart{shipOrders.reduce((n, o) => n + o.carts.length, 0) !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex flex-col gap-4">
            {shipOrders.map(({ date, carts: orderCarts }) => {
              const d = new Date(date + 'T12:00:00');
              const today = new Date(); today.setHours(0,0,0,0);
              const isPast = d < today;
              const isToday = d.toDateString() === new Date().toDateString();
              const label = isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const dealers = [...new Set(orderCarts.map(c => c.dealerName).filter(Boolean))].join(', ');
              return (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="px-2.5 py-1 rounded-lg text-xs font-bold"
                         style={{ background: isPast ? 'rgba(248,81,73,0.12)' : isToday ? 'rgba(34,197,94,0.12)' : 'rgba(6,182,212,0.12)',
                                  color: isPast ? '#f85149' : isToday ? '#22c55e' : '#06b6d4' }}>
                      {label}
                    </div>
                    <span className="text-xs" style={{ color: '#7d8590' }}>{dealers}</span>
                    <span className="ml-auto text-xs font-medium"
                          style={{ color: '#7d8590' }}>{orderCarts.length} cart{orderCarts.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {orderCarts.map(c => (
                      <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs"
                           style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
                        {c.vinPhotoUrl && (
                          <img src={c.vinPhotoUrl} alt="" className="w-8 h-6 object-cover rounded shrink-0" />
                        )}
                        <span className="font-mono font-bold" style={{ color: '#e6edf3' }}>{c.vin}</span>
                        <span className="font-medium" style={{ color: '#7d8590' }}>{c.model}</span>
                        <ColorChip color={c.shellColor} />
                        <span style={{ color: '#30363d' }}>/</span>
                        <ColorChip color={c.seatColor} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Two-column: Low Stock + Build Metrics ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* Low Stock — compact */}
        {isManager && (
          <div className="rounded-xl p-4" style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm" style={{ color: '#e6edf3' }}>Low Stock Alerts</h2>
              <Package size={15} style={{ color: '#7d8590' }} />
            </div>
            {lowStock.length === 0 ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: '#7d8590' }}>
                <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
                All inventory levels are healthy.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {lowStock.slice(0, 8).map(item => (
                  <div key={item.id} className="flex items-center justify-between text-xs">
                    <span className="truncate pr-2" style={{ color: '#e6edf3' }}>{item.name}</span>
                    <span className="font-mono font-bold px-1.5 py-0.5 rounded text-xs shrink-0"
                          style={{ background: item.quantityOnHand === 0 ? 'rgba(248,81,73,0.12)' : 'rgba(210,153,34,0.12)', color: item.quantityOnHand === 0 ? '#f85149' : '#d29922' }}>
                      {item.quantityOnHand}
                    </span>
                  </div>
                ))}
                {lowStock.length > 8 && (
                  <p className="text-xs mt-1" style={{ color: '#7d8590' }}>+{lowStock.length - 8} more</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Build Time Metrics */}
        <div className="rounded-xl p-4" style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Timer size={15} style={{ color: '#7d8590' }} />
              <h2 className="font-semibold text-sm" style={{ color: '#e6edf3' }}>Avg Build Times</h2>
            </div>
            <div className="flex gap-1">
              {(['day', 'week', 'month'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setMetricPeriod(p)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold transition-all press-active focus-ring"
                  style={metricPeriod === p
                    ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }
                    : { background: 'rgba(255,255,255,0.04)', color: '#7d8590', border: '1px solid transparent' }}
                >
                  {p === 'day' ? 'Today' : p === 'week' ? '7d' : '30d'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium" style={{ color: '#e6edf3' }}>Intake → Built</p>
                <p className="text-xs" style={{ color: '#7d8590' }}>Assembly time</p>
              </div>
              <span className="text-xl font-bold font-mono"
                    style={{ color: metrics.intakeToBuilt[metricPeriod] !== null ? '#3b82f6' : '#3d4451' }}>
                {fmtDuration(metrics.intakeToBuilt[metricPeriod])}
              </span>
            </div>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)' }} />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium" style={{ color: '#e6edf3' }}>Intake → QC Pass</p>
                <p className="text-xs" style={{ color: '#7d8590' }}>Full cycle time</p>
              </div>
              <span className="text-xl font-bold font-mono"
                    style={{ color: metrics.intakeToQCPass[metricPeriod] !== null ? '#22c55e' : '#3d4451' }}>
                {fmtDuration(metrics.intakeToQCPass[metricPeriod])}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Active builds quick list ────────────────────────────────────────── */}
      {carts.length > 0 && (
        <div className="rounded-xl p-5"
             style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-semibold text-sm mb-4" style={{ color: '#e6edf3' }}>Active Builds</h2>
          <div className="flex flex-wrap gap-2">
            {carts.slice(0, 20).map(cart => {
              const colorMap: Record<string, string> = {
                intake: '#7d8590', built: '#3b82f6', in_queue: '#d29922',
                qc_fail: '#f85149', qc_pass: '#22c55e', painted: '#a855f7',
                ready_to_ship: '#06b6d4',
              };
              const c = colorMap[cart.status] ?? '#7d8590';
              return (
                <span key={cart.id}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full whitespace-nowrap"
                      style={{ background: c + '18', border: `1px solid ${c}30` }}>
                  <span className="font-mono font-bold" style={{ color: c }}>{cart.vin}</span>
                  <span style={{ color: '#7d8590' }}>{cart.model}</span>
                  <ColorChip color={cart.shellColor} />
                  <span style={{ color: '#30363d' }}>/</span>
                  <ColorChip color={cart.seatColor} />
                </span>
              );
            })}
            {carts.length > 20 && (
              <span className="text-xs px-3 py-1.5 rounded-full" style={{ background: '#1c2333', color: '#7d8590' }}>
                +{carts.length - 20} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
