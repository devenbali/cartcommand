import { useEffect, useState } from 'react';
import { subscribeToUsers } from '../lib/firestore';
import type { AppUser } from '../types';

export function useUsers() {
  const [users, setUsers]     = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToUsers((data) => {
      setUsers(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { users, loading };
}
