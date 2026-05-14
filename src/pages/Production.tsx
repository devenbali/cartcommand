import React, { useState } from 'react';
import { QrCode, Search, AlertTriangle, Loader2, RefreshCw, Truck, Wrench } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCarts } from '../hooks/useCarts';
import { CartTableRow, CartCard } from '../components/production/CartRow';
import VINIntakeModal from '../components/production/VINIntakeModal';
import type { Cart } from '../types';

const TABLE_HEADERS = [
  { label: 'Photo',   w: 'w-16' },
  { label: 'VIN',     w: 'w-36' },
  { label: 'Model',   w: 'w-24' },
  { label: 'Colors',  w: 'w-48' },
  { label: 'Dealer',  w: 'w-40' },
  { label: 'Status',  w: 'w-28' },
  { label: 'Updated', w: 'w-28' },
  { label: '',        w: 'w-24' },
];

interface SectionProps {
  carts: Cart[];
  flagged?: boolean;
  accentColor: string;
  borderColor: string;
  headerBg: string;
}

function CartsSection({ carts, flagged, accentColor, borderColor, headerBg }: SectionProps) {
  if (carts.length === 0) return null;

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr style={{ background: headerBg, borderBottom: `1px solid ${borderColor}` }}>
              {TABLE_HEADERS.map(h => (
                <th key={h.label} className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${h.w}`}
                    style={{ color: accentColor, opacity: 0.8 }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ background: '#0d1117' }}>
            {carts.map(c => <CartTableRow key={c.id} cart={c} flagged={flagged} />)}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {carts.map(c => <CartCard key={c.id} cart={c} flagged={flagged} />)}
      </div>
    </>
  );
}

export default function Production() {
  const { isQC } = useAuth();
  const { carts, flagged, inQueue, readyToPaint, painting, readyToShip, incomplete, active, loading, error } = useCarts();
  const [showIntake, setShowIntake] = useState(false);
  const [search, setSearch] = useState('');

  const filter = (list: Cart[]) =>
    search.trim()
      ? list.filter(c =>
          c.vin.toLowerCase().includes(search.toLowerCase()) ||
          c.shellColor.toLowerCase().includes(search.toLowerCase()) ||
          c.dealerName.toLowerCase().includes(search.toLowerCase())
        )
      : list;

  return (
    <div className="p-4 md:p-8 max-w-screen-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
            Production
          </h1>
          <p className="text-sm mt-1" style={{ color: '#7d8590' }}>
            {loading ? 'Loading…' : `${carts.length} active build${carts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowIntake(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: '#22c55e', color: '#0d1117' }}>
          <QrCode size={16} />
          <span className="hidden sm:inline">Scan New VIN</span>
          <span className="sm:hidden">+ VIN</span>
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-5 max-w-sm"
           style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Search size={15} style={{ color: '#7d8590' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search VIN, color, dealer…"
          className="bg-transparent outline-none text-sm flex-1"
          style={{ color: '#e6edf3' }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-5 text-sm"
             style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)', color: '#f85149' }}>
          <RefreshCw size={14} /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: '#22c55e' }} />
        </div>
      )}

      {!loading && carts.length === 0 && flagged.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-5 animate-fade-in-up">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
               style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <QrCode size={36} style={{ color: '#22c55e', opacity: 0.7 }} />
          </div>
          <div className="text-center">
            <p className="font-semibold mb-1" style={{ color: '#e6edf3' }}>No active builds</p>
            <p className="text-sm" style={{ color: '#7d8590' }}>Scan a VIN to start tracking a cart through production.</p>
          </div>
          <button
            onClick={() => setShowIntake(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold press-active focus-ring transition-all"
            style={{ background: '#22c55e', color: '#0d1117' }}>
            <QrCode size={16} /> Scan New VIN
          </button>
        </div>
      )}

      {!loading && (
        <>
          {/* QC Flagged — Needs Rework */}
          {flagged.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#f85149' }}>
                <AlertTriangle size={15} />
                Flagged — Needs Rework
                <span className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'rgba(248,81,73,0.12)', color: '#f85149' }}>
                  {filter(flagged).length}
                </span>
              </h2>
              <CartsSection
                carts={filter(flagged)}
                flagged
                accentColor="#f85149"
                borderColor="rgba(248,81,73,0.2)"
                headerBg="rgba(248,81,73,0.06)"
              />
            </section>
          )}

          {/* Active Builds */}
          <section className="mb-8">
            <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#7d8590' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: '#7d8590' }} />
              Active Builds
              <span className="px-2 py-0.5 rounded-full text-xs"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#7d8590' }}>
                {filter(active).length}
              </span>
            </h2>
            <CartsSection
              carts={filter(active)}
              accentColor="#7d8590"
              borderColor="rgba(255,255,255,0.06)"
              headerBg="#161b27"
            />
          </section>

          {/* In QC Queue */}
          {inQueue.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#d29922' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#d29922' }} />
                In QC Queue
                <span className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'rgba(210,153,34,0.12)', color: '#d29922' }}>
                  {filter(inQueue).length}
                </span>
              </h2>
              <CartsSection
                carts={filter(inQueue)}
                accentColor="#d29922"
                borderColor="rgba(210,153,34,0.2)"
                headerBg="rgba(210,153,34,0.06)"
              />
            </section>
          )}

          {/* Ready to Paint — QC Passed */}
          {readyToPaint.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#22c55e' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
                Ready to Paint — QC Passed
                <span className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                  {filter(readyToPaint).length}
                </span>
              </h2>
              <CartsSection
                carts={filter(readyToPaint)}
                accentColor="#22c55e"
                borderColor="rgba(34,197,94,0.2)"
                headerBg="rgba(34,197,94,0.06)"
              />
            </section>
          )}

          {/* In Painting */}
          {painting.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#a855f7' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#a855f7' }} />
                In Painting
                <span className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>
                  {filter(painting).length}
                </span>
              </h2>
              <CartsSection
                carts={filter(painting)}
                accentColor="#a855f7"
                borderColor="rgba(168,85,247,0.2)"
                headerBg="rgba(168,85,247,0.06)"
              />
            </section>
          )}

          {/* Incomplete / Repair */}
          {incomplete.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#f97316' }}>
                <Wrench size={15} />
                Incomplete / Repair
                <span className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}>
                  {filter(incomplete).length}
                </span>
              </h2>
              <CartsSection
                carts={filter(incomplete)}
                accentColor="#f97316"
                borderColor="rgba(249,115,22,0.2)"
                headerBg="rgba(249,115,22,0.06)"
              />
            </section>
          )}

          {/* Ready to Ship */}
          {readyToShip.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#06b6d4' }}>
                <Truck size={15} />
                Ready to Ship
                <span className="px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4' }}>
                  {filter(readyToShip).length}
                </span>
              </h2>
              <CartsSection
                carts={filter(readyToShip)}
                accentColor="#06b6d4"
                borderColor="rgba(6,182,212,0.2)"
                headerBg="rgba(6,182,212,0.06)"
              />
            </section>
          )}
        </>
      )}

      {showIntake && <VINIntakeModal onClose={() => setShowIntake(false)} />}
    </div>
  );
}
