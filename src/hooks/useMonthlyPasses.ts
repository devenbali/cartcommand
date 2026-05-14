import { useEffect, useState } from 'react';
import { subscribeToMonthlyPasses } from '../lib/firestore';
import type { Cart } from '../types';

export function useMonthlyPasses() {
  const [carts, setCarts]   = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToMonthlyPasses((data) => {
      setCarts(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { carts, count: carts.length, loading };
}
