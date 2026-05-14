import { useEffect, useState } from 'react';
import { subscribeToInventory } from '../lib/firestore';
import type { InventoryItem } from '../types';

export function useInventory() {
  const [items, setItems]     = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToInventory((data) => {
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const lowStock = items.filter(i => i.quantityOnHand <= i.minimumStockLevel);

  return { items, lowStock, loading };
}
