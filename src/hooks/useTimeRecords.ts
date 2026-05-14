import { useEffect, useState } from 'react';
import { subscribeToTimeRecords } from '../lib/firestore';
import type { TimeRecord } from '../types';

export function useTimeRecords(startDate: Date, endDate: Date) {
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToTimeRecords(
      data => { setRecords(data); setLoading(false); },
      startDate,
      endDate
    );
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10)]);

  return { records, loading };
}
