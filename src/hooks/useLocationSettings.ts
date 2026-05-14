import { useEffect, useState } from 'react';
import { subscribeToLocationSettings } from '../lib/firestore';
import type { LocationSettings } from '../types';

export function useLocationSettings() {
  const [settings, setSettings] = useState<LocationSettings | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    return subscribeToLocationSettings((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  return { settings, loaded };
}
