import { useEffect, useState } from 'react';
import { subscribeToActiveCarts, subscribeToTodaysPasses, subscribeToAllCarts } from '../lib/firestore';
import type { Cart, CartStatus } from '../types';

export function useCarts() {
  const [carts, setCarts]   = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToActiveCarts(
      (data) => { setCarts(data); setLoading(false); },
      (err)  => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, []);

  const flagged       = carts.filter(c => c.status === 'qc_fail');
  const inQueue       = carts.filter(c => c.status === 'in_queue');
  const readyToPaint  = carts.filter(c => c.status === 'qc_pass');
  const painting      = carts.filter(c => c.status === 'painted');
  const readyToShip   = carts.filter(c => c.status === 'ready_to_ship');
  const incomplete    = carts.filter(c => c.status === 'incomplete');
  const active        = carts.filter(c => ['intake', 'built'].includes(c.status));

  return { carts, flagged, inQueue, readyToPaint, painting, readyToShip, incomplete, active, loading, error };
}

export function useTodaysPasses() {
  const [count, setCount] = useState(0);
  useEffect(() => subscribeToTodaysPasses(setCount), []);
  return count;
}

export function useWeeklyPasses() {
  const [allCarts, setAllCarts] = useState<Cart[]>([]);
  useEffect(() => subscribeToAllCarts(setAllCarts), []);

  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day + 6) % 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const count = allCarts.filter(c => {
    const ms = toMs(c.qcPassedAt);
    return ms !== null && ms >= monday.getTime() && ms <= sunday.getTime();
  }).length;

  return { count, weekStart: monday, weekEnd: sunday };
}

// ─── Build time analytics ─────────────────────────────────────────────────────

function toMs(val: unknown): number | null {
  if (!val) return null;
  const d = (val as any).toDate?.() ?? new Date(val as string);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function avgHours(carts: Cart[], getEnd: (c: Cart) => unknown): number | null {
  const durations = carts
    .map(c => {
      const s = toMs(c.createdAt);
      const e = toMs(getEnd(c));
      return s && e && e > s ? (e - s) / 3600000 : null;
    })
    .filter((v): v is number => v !== null);
  return durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
}

function inPeriod(val: unknown, period: 'day' | 'week' | 'month'): boolean {
  const ms = toMs(val);
  if (!ms) return false;
  const now = new Date();
  if (period === 'day') {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    return ms >= s.getTime();
  }
  if (period === 'week') {
    const s = new Date(now); s.setDate(now.getDate() - 6); s.setHours(0, 0, 0, 0);
    return ms >= s.getTime();
  }
  const s = new Date(now.getFullYear(), now.getMonth(), 1);
  return ms >= s.getTime();
}

export function useCartMetrics() {
  const [allCarts, setAllCarts] = useState<Cart[]>([]);
  useEffect(() => subscribeToAllCarts(setAllCarts), []);

  const builtCarts  = allCarts.filter(c => c.builtAt);
  const passedCarts = allCarts.filter(c => c.qcPassedAt);

  return {
    intakeToBuilt: {
      day:   avgHours(builtCarts.filter(c => inPeriod(c.builtAt, 'day')),   c => c.builtAt),
      week:  avgHours(builtCarts.filter(c => inPeriod(c.builtAt, 'week')),  c => c.builtAt),
      month: avgHours(builtCarts.filter(c => inPeriod(c.builtAt, 'month')), c => c.builtAt),
    },
    intakeToQCPass: {
      day:   avgHours(passedCarts.filter(c => inPeriod(c.qcPassedAt, 'day')),   c => c.qcPassedAt),
      week:  avgHours(passedCarts.filter(c => inPeriod(c.qcPassedAt, 'week')),  c => c.qcPassedAt),
      month: avgHours(passedCarts.filter(c => inPeriod(c.qcPassedAt, 'month')), c => c.qcPassedAt),
    },
  };
}
