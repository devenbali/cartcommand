import React, { useState } from 'react';
import { Search, Pencil, Check, X, AlertTriangle } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { useAuth } from '../contexts/AuthContext';
import { updateInventoryQty } from '../lib/firestore';
import type { InventoryItem, InventoryCategory } from '../types';

const CATEGORIES: Array<'All' | Capitalize<InventoryCategory>> = ['All', 'Frame', 'Tire', 'Shell', 'Seat'];

function EditableQty({ item }: { item: InventoryItem }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(item.quantityOnHand);
  const [saving, setSaving]   = useState(false);

  async function save() {
    if (!user || value === item.quantityOnHand) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateInventoryQty(item.id, value, user.uid, user.name);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(item.quantityOnHand);
    setEditing(false);
  }

  const isLow = item.quantityOnHand <= item.minimumStockLevel;

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={value}
          onChange={e => setValue(Math.max(0, Number(e.target.value)))}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          autoFocus
          className="w-20 px-2 py-1 rounded text-sm outline-none font-mono"
          style={{ background: '#1c2333', border: '1px solid rgba(34,197,94,0.4)', color: '#e6edf3' }}
        />
        <button onClick={save} disabled={saving} className="p-1 rounded hover:opacity-80">
          <Check size={14} style={{ color: '#22c55e' }} />
        </button>
        <button onClick={cancel} className="p-1 rounded hover:opacity-80">
          <X size={14} style={{ color: '#7d8590' }} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono font-semibold"
            style={{ color: isLow ? (item.quantityOnHand === 0 ? '#f85149' : '#d29922') : '#e6edf3' }}>
        {item.quantityOnHand}
      </span>
      {isLow && <AlertTriangle size={13} style={{ color: item.quantityOnHand === 0 ? '#f85149' : '#d29922' }} />}
    </div>
  );
}

function EditActions({ item }: { item: InventoryItem }) {
  const { isManager } = useAuth();
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(item.quantityOnHand);
  const { user } = useAuth();
  const [saving, setSaving]   = useState(false);

  if (!isManager) return null;

  async function save() {
    if (!user || value === item.quantityOnHand) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateInventoryQty(item.id, value, user.uid, user.name);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={value}
          onChange={e => setValue(Math.max(0, Number(e.target.value)))}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          className="w-20 px-2 py-1 rounded text-sm outline-none font-mono"
          style={{ background: '#1c2333', border: '1px solid rgba(34,197,94,0.4)', color: '#e6edf3' }}
        />
        <button onClick={save} disabled={saving} className="p-1 rounded hover:opacity-80">
          <Check size={14} style={{ color: '#22c55e' }} />
        </button>
        <button onClick={() => setEditing(false)} className="p-1 rounded hover:opacity-80">
          <X size={14} style={{ color: '#7d8590' }} />
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => { setValue(item.quantityOnHand); setEditing(true); }}
            className="p-1.5 rounded hover:opacity-80 transition-opacity" title="Edit quantity">
      <Pencil size={14} style={{ color: '#7d8590' }} />
    </button>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  frame: 'Frame', tire: 'Tire', shell: 'Shell', seat: 'Seat',
};

/** Derives which cart models use a given inventory item based on its name. */
function getItemModels(name: string): string {
  const n = name.toLowerCase();
  // Strip color suffix like "(Red)" for matching
  const base = n.replace(/\s*\([^)]+\)\s*$/, '').trim();

  // Frames
  if (base === 'frame: eco 2')    return 'ECO 2';
  if (base === 'frame: eco 4')    return 'ECO 4';
  if (base === 'frame: eco 6')    return 'ECO 6';
  if (base === 'frame: lifted 4') return 'LIFTED 4';
  if (base === 'frame: lifted 6') return 'LIFTED 6';
  if (base === 'frame: f4')       return 'F4';

  // Tires
  if (base === 'tire: eco')    return 'ECO 2/4/6';
  if (base === 'tire: lifted') return 'LIFTED 4/6';
  if (base === 'tire: f4')     return 'F4';

  // Shells
  if (base === 'shell: front')                   return 'All Models';
  if (base === 'shell: middle f4')               return 'F4';
  if (base === 'shell: middle lifted/eco6')      return 'ECO 6, LIFTED 6';
  if (base === 'shell: rear f4')                 return 'F4';
  if (base === 'shell: rear multi-model')        return 'ECO 2/4/6, LIFTED 4';

  // Seats
  if (base === 'seat: backrest')                 return 'ECO 2/4/6';
  if (base === 'seat: battery eco')              return 'ECO 2/4/6';
  if (base === 'seat: battery lifted')           return 'LIFTED 4/6';
  if (base === 'seat: battery')                  return 'ECO 2/4/6, LIFTED 4/6'; // legacy
  if (base === 'seat: flipseat eco')             return 'ECO 4, ECO 6';
  if (base === 'seat: flipseat lifted')          return 'LIFTED 4/6';
  if (base === 'seat: flipseat')                 return 'ECO 4/6, LIFTED 4/6'; // legacy
  if (base === 'seat: front eco')                return 'ECO 6';
  if (base === 'seat: front lifted')             return 'LIFTED 6';
  if (base === 'seat: front')                    return 'ECO 6, LIFTED 6'; // legacy
  if (base === 'seat: f4 front')                 return 'F4';
  if (base === 'seat: f4 backseat')              return 'F4';
  if (base === 'seat: f4 bottom')                return 'F4';
  if (base === 'seat: backrest w/ headrest')     return 'LIFTED 4/6';
  if (base === 'seat: backrest w/o headrest')    return 'LIFTED 4/6';

  return '—';
}

export default function Inventory() {
  const { items, lowStock, loading } = useInventory();
  const { isManager } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');

  const filtered = items.filter(item => {
    const matchCat  = activeCategory === 'All' || item.category === activeCategory.toLowerCase();
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  function formatDate(val: unknown): string {
    if (!val) return '—';
    if (typeof (val as any).toDate === 'function') return (val as any).toDate().toLocaleDateString();
    return new Date(val as string).toLocaleDateString();
  }

  return (
    <div className="p-4 md:p-8 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 md:mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
            Master Stock List
          </h1>
          <p className="text-sm mt-1" style={{ color: '#7d8590' }}>
            F-Series Parts Inventory — live quantities
          </p>
        </div>
        {lowStock.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
               style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.2)', color: '#f85149' }}>
            <AlertTriangle size={13} />
            <span className="hidden sm:inline">{lowStock.length} low stock item{lowStock.length !== 1 ? 's' : ''}</span>
            <span className="sm:hidden">{lowStock.length}</span>
          </div>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 mb-5 md:mb-6">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: activeCategory === cat ? 'rgba(34,197,94,0.12)' : '#161b27',
                color: activeCategory === cat ? '#22c55e' : '#7d8590',
                border: `1px solid ${activeCategory === cat ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg w-full sm:w-auto"
             style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Search size={14} style={{ color: '#7d8590' }} />
          <input
            type="text"
            placeholder="Search parts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent outline-none text-sm flex-1 sm:w-48"
            style={{ color: '#e6edf3' }}
          />
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Category', 'Part Name', 'Used On', 'Qty On Hand', 'Min Stock Level', 'Last Updated', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                    style={{ color: '#7d8590' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm"
                    style={{ color: '#7d8590', background: '#0d1117' }}>
                  Loading inventory…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm"
                    style={{ color: '#7d8590', background: '#0d1117' }}>
                  {items.length === 0
                    ? 'No inventory items found. Seed your Firestore "inventory" collection to get started.'
                    : 'No items match your filter.'}
                </td>
              </tr>
            )}
            {!loading && filtered.map((item, i) => {
              const isLow = item.quantityOnHand <= item.minimumStockLevel;
              return (
                <tr key={item.id}
                    style={{
                      background: i % 2 === 0 ? '#0d1117' : 'rgba(28,35,51,0.4)',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: 'rgba(125,133,144,0.12)', color: '#7d8590' }}>
                      {CATEGORY_LABEL[item.category] ?? item.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: '#e6edf3' }}>{item.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs" style={{ color: '#7d8590' }}>{getItemModels(item.name)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold"
                            style={{ color: isLow ? (item.quantityOnHand === 0 ? '#f85149' : '#d29922') : '#e6edf3' }}>
                        {item.quantityOnHand}
                      </span>
                      {isLow && <AlertTriangle size={13} style={{ color: item.quantityOnHand === 0 ? '#f85149' : '#d29922' }} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#7d8590' }}>{item.minimumStockLevel}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#7d8590' }}>{formatDate(item.lastUpdatedAt)}</td>
                  <td className="px-4 py-3">
                    <EditActions item={item} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden flex flex-col gap-2">
        {loading && (
          <p className="text-sm text-center py-10" style={{ color: '#7d8590' }}>Loading inventory…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-center py-10" style={{ color: '#7d8590' }}>
            {items.length === 0 ? 'No inventory items found.' : 'No items match your filter.'}
          </p>
        )}
        {!loading && filtered.map(item => {
          const isLow = item.quantityOnHand <= item.minimumStockLevel;
          return (
            <div key={item.id} className="rounded-xl p-4"
                 style={{ background: '#161b27', border: `1px solid ${isLow ? (item.quantityOnHand === 0 ? 'rgba(248,81,73,0.3)' : 'rgba(210,153,34,0.3)') : 'rgba(255,255,255,0.06)'}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#e6edf3' }}>{item.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block"
                        style={{ background: 'rgba(125,133,144,0.12)', color: '#7d8590' }}>
                    {CATEGORY_LABEL[item.category] ?? item.category}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-lg font-bold font-mono"
                        style={{ color: isLow ? (item.quantityOnHand === 0 ? '#f85149' : '#d29922') : '#e6edf3' }}>
                    {item.quantityOnHand}
                  </span>
                  {isLow && <AlertTriangle size={14} style={{ color: item.quantityOnHand === 0 ? '#f85149' : '#d29922' }} />}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs" style={{ color: '#7d8590' }}>Min: {item.minimumStockLevel}</span>
                <EditActions item={item} />
              </div>
            </div>
          );
        })}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs mt-3" style={{ color: '#7d8590' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''} shown
          {lowStock.length > 0 && ` · ${lowStock.length} below minimum`}
        </p>
      )}

    </div>
  );
}
