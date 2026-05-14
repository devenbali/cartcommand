import { useEffect, useState } from 'react';
import { subscribeToScrapLog } from '../lib/firestore';
import type { ScrapLogEntry } from '../types';

export function useScrapLog() {
  const [entries, setEntries] = useState<ScrapLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToScrapLog((data) => {
      setEntries(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { entries, loading };
}
