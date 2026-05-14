import { useEffect, useState } from 'react';
import { subscribeToAuditLog } from '../lib/firestore';
import type { AuditLogEntry } from '../types';

export function useAuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToAuditLog((data) => {
      setEntries(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { entries, loading };
}
