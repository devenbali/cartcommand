import { useEffect, useState } from 'react';
import { subscribeToAuditFlags } from '../lib/firestore';
import type { AuditFlag, AuditFlagStatus } from '../types';

export function useAuditFlags(status: AuditFlagStatus | 'all' = 'pending') {
  const [flags, setFlags]     = useState<AuditFlag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToAuditFlags(
      data => { setFlags(data); setLoading(false); },
      status,
      () => { setFlags([]); setLoading(false); } // on error: fail silently
    );
    return unsub;
  }, [status]);

  return { flags, loading };
}
