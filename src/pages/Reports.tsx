import React, { useState } from 'react';
import { BarChart2, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { useMonthlyPasses } from '../hooks/useMonthlyPasses';
import { useInventory } from '../hooks/useInventory';
import { useScrapLog } from '../hooks/useScrapLog';
import { useAuditLog } from '../hooks/useAuditLog';
import { useUsers } from '../hooks/useUsers';
import { getPayrollTier, PAYROLL_TIERS, CART_MODEL_LABELS } from '../types';

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function downloadCSV(filename: string, header: string, rows: string[]) {
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDate(val: unknown): string {
  if (!val) return '';
  if (typeof (val as any).toDate === 'function') return (val as any).toDate().toLocaleString();
  return new Date(val as string).toLocaleString();
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

// ─── Audit Log Table ──────────────────────────────────────────────────────────

function AuditLogSection() {
  const { entries, loading } = useAuditLog();
  const [search, setSearch]  = useState('');
  const [expanded, setExpanded] = useState(true);

  const filtered = entries.filter(e =>
    (e.itemName ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (e.userName ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (e.cartVin ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (e.action ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const ACTION_LABELS: Record<string, string> = {
    inventory_deduction: 'BOM Deduction',
    inventory_update:    'Manual Update',
    cart_status_change:  'Status Change',
    settings_change:     'Settings Change',
    scrap_logged:        'Scrap Logged',
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center justify-between w-full px-5 py-4"
        style={{ background: '#161b27', borderBottom: expanded ? '1px solid rgba(255,255,255,0.06)' : undefined }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
            <BarChart2 size={16} />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium" style={{ color: '#e6edf3' }}>Audit Log</p>
            <p className="text-xs mt-0.5" style={{ color: '#7d8590' }}>
              Full history of all inventory changes and who made them
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: '#1c2333', color: '#7d8590' }}>
              {entries.length} entries
            </span>
          )}
          {expanded ? <ChevronUp size={16} style={{ color: '#7d8590' }} /> : <ChevronDown size={16} style={{ color: '#7d8590' }} />}
        </div>
      </button>

      {expanded && (
        <div style={{ background: '#0d1117' }}>
          {/* Search + export row */}
          <div className="flex items-center gap-3 px-4 py-3"
               style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <input
              type="text"
              placeholder="Filter by user, item, VIN, action…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)', color: '#e6edf3' }}
            />
            <button
              onClick={() => {
                const header = 'Timestamp,User,Action,Item,From,To,Cart VIN,Notes';
                const rows = entries.map(e => [
                  fmtDate(e.timestamp),
                  e.userName,
                  ACTION_LABELS[e.action] ?? e.action,
                  e.itemName ?? '',
                  e.fromValue ?? '',
                  e.toValue ?? '',
                  e.cartVin ?? '',
                  e.notes ?? '',
                ].map(csvCell).join(','));
                downloadCSV(`vcarts-audit-log-${new Date().toISOString().slice(0,10)}.csv`, header, rows);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
            >
              <Download size={12} />
              Export
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Timestamp', 'User', 'Action', 'Item', 'Qty Change', 'Cart VIN', 'Notes'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium uppercase tracking-wider"
                        style={{ color: '#7d8590', background: '#0d1117' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: '#7d8590' }}>Loading…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: '#7d8590' }}>No audit entries yet.</td></tr>
                )}
                {!loading && filtered.map((e, i) => (
                  <tr key={e.id}
                      style={{
                        background: i % 2 === 0 ? '#0d1117' : 'rgba(28,35,51,0.3)',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                      }}>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: '#7d8590' }}>{fmtDate(e.timestamp)}</td>
                    <td className="px-4 py-2.5" style={{ color: '#e6edf3' }}>{e.userName}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-xs"
                            style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e' }}>
                        {ACTION_LABELS[e.action] ?? e.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5" style={{ color: '#e6edf3' }}>{e.itemName ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: '#7d8590' }}>
                      {e.fromValue != null && e.toValue != null
                        ? <span style={{ color: e.toValue < e.fromValue ? '#f85149' : '#22c55e' }}>
                            {e.fromValue} → {e.toValue}
                          </span>
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: '#7d8590' }}>{e.cartVin ?? '—'}</td>
                    <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: '#7d8590' }}>{e.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Reports Page ────────────────────────────────────────────────────────

export default function Reports() {
  const { carts: monthCarts }         = useMonthlyPasses();
  const { items: inventory }          = useInventory();
  const { entries: scrapEntries }     = useScrapLog();
  const { users }                     = useUsers();

  const assemblerCount = users.filter(u => u.active && u.bonusEligible).length;

  function exportProduction() {
    const header = 'VIN,Model,Shell Color,Seat Color,Dealer,QC Passed At,Passed By';
    const rows = monthCarts.map(c => [
      c.vin,
      CART_MODEL_LABELS[c.model],
      c.shellColor,
      c.seatColor,
      c.dealerName,
      fmtDate(c.qcPassedAt),
      c.qcPassedBy ?? '',
    ].map(csvCell).join(','));
    downloadCSV(`vcarts-production-${new Date().toISOString().slice(0,7)}.csv`, header, rows);
  }

  function exportInventory() {
    const header = 'Category,Part Name,Qty On Hand,Min Stock Level,Status,Last Updated';
    const rows = inventory.map(item => [
      item.category,
      item.name,
      item.quantityOnHand,
      item.minimumStockLevel,
      item.quantityOnHand === 0 ? 'OUT OF STOCK' : item.quantityOnHand <= item.minimumStockLevel ? 'LOW STOCK' : 'OK',
      fmtDate(item.lastUpdatedAt),
    ].map(csvCell).join(','));
    downloadCSV(`vcarts-inventory-${new Date().toISOString().slice(0,10)}.csv`, header, rows);
  }

  function exportPayroll() {
    const { tier } = getPayrollTier(monthCarts.length, assemblerCount);
    const header = 'Carts/Month,Rate/Cart,Pool Total,Assemblers,Per Assembler,Hourly Equiv,Annual';
    const rows = PAYROLL_TIERS.map(t => {
      const pool   = t.cartsPerMonth * t.ratePerCart;
      const perMan = pool / assemblerCount;
      const active = tier?.cartsPerMonth === t.cartsPerMonth ? ' (ACTIVE)' : '';
      return [
        `${t.cartsPerMonth}${active}`,
        `$${t.ratePerCart}`,
        `$${pool.toFixed(0)}`,
        assemblerCount,
        `$${perMan.toFixed(0)}`,
        `$${Math.round(perMan / 160)}/hr`,
        `$${(perMan * 13).toFixed(0)}`,
      ].map(csvCell).join(',');
    });
    downloadCSV(`vcarts-payroll-${new Date().toISOString().slice(0,7)}.csv`, header, rows);
  }

  function exportScrapLog() {
    const header = 'Date,Logged By,Item Name,Part Number,Problem Info,Quantity,VIN';
    const rows = scrapEntries.map(e => [
      fmtDate(e.date),
      e.loggedByName,
      e.itemName,
      e.partNumber ?? '',
      e.problemInfo,
      e.quantity,
      e.associatedVin ?? '',
    ].map(csvCell).join(','));
    downloadCSV(`vcarts-scraplog-${new Date().toISOString().slice(0,10)}.csv`, header, rows);
  }

  const exportHandlers: Record<string, () => void> = {
    'Production Report':             exportProduction,
    'Inventory Report':              exportInventory,
    'Weighted-Bonus Payroll Report': exportPayroll,
    'Scrap & Defective Log Report':  exportScrapLog,
  };

  const REPORT_TYPES = [
    { title: 'Production Report',             desc: 'This month\'s QC-pass list by VIN, model, color, and dealer' },
    { title: 'Inventory Report',              desc: 'Current stock levels, low-stock items, last updated dates' },
    { title: 'Weighted-Bonus Payroll Report', desc: 'Monthly bonus per assembler based on cart output' },
    { title: 'Scrap & Defective Log Report',  desc: 'All logged scrap items with descriptions and VIN associations' },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
          Reports
        </h1>
        <p className="text-sm mt-1" style={{ color: '#7d8590' }}>Export and review operational data</p>
      </div>

      <div className="flex flex-col gap-3 mb-6">
        {REPORT_TYPES.map(({ title, desc }) => (
          <div key={title} className="flex items-center justify-between p-5 rounded-xl"
               style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                   style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                <BarChart2 size={18} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: '#e6edf3' }}>{title}</p>
                <p className="text-xs mt-0.5" style={{ color: '#7d8590' }}>{desc}</p>
              </div>
            </div>
            <button
              onClick={exportHandlers[title]}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
            >
              <Download size={13} />
              Export
            </button>
          </div>
        ))}
      </div>

      {/* Inline audit log */}
      <AuditLogSection />
    </div>
  );
}
