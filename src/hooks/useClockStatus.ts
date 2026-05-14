import { useEffect, useState } from 'react';
import { subscribeToClockSession } from '../lib/firestore';

export function useClockStatus(userId: string | undefined) {
  const [session, setSession] = useState<{ recordId: string; clockIn: Date } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const unsub = subscribeToClockSession(userId, s => {
      setSession(s);
      setLoading(false);
    });
    return unsub;
  }, [userId]);

  return { session, loading, isClockedIn: session !== null };
}
