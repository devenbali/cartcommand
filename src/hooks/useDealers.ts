import { useEffect, useState } from 'react';
import { subscribeToDealers } from '../lib/firestore';
import type { Dealer } from '../types';

export function useDealers() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToDealers((data) => {
      setDealers(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { dealers, loading };
}
