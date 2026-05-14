import React, { useState } from 'react';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import { CART_MODEL_LABELS, CART_STATUS_LABELS } from '../../types';
import type { Cart, CartStatus } from '../../types';
import StatusUpdateModal from './StatusUpdateModal';

const STATUS_STYLE: Record<CartStatus, { bg: string; color: string }> = {
  intake:        { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
  built:         { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
  painted:       { bg: 'rgba(168,85,247,0.12)', color: '#a855f7' },
  in_queue:      { bg: 'rgba(210,153,34,0.12)', color: '#d29922' },
  qc_pass:       { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
  qc_fail:       { bg: 'rgba(248,81,73,0.12)',  color: '#f85149' },
  ready_to_ship: { bg: 'rgba(6,182,212,0.12)',  color: '#06b6d4' },
  shipped:       { bg: 'rgba(34,197,94,0.08)',  color: '#16a34a' },
  incomplete:    { bg: 'rgba(249,115,22,0.12)', color: '#f97316' },
};

const COLOR_DOT: Record<string, string> = {
  Red: '#ef4444', White: '#f1f5f9', Blue: '#3b82f6', Black: '#1e293b',
  'Matte Grey': '#6b7280', 'Cloud Blue': '#7dd3fc', Burgundy: '#9f1239',
  Silver: '#c0c0c0',
  Brown: '#92400e', Grey: '#6b7280',
};

function timeAgo(ts: unknown): string {
  if (!ts) return '—';
  const date = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props { cart: Cart; flagged?: boolean; }

/** Desktop table row */
export function CartTableRow({ cart, flagged }: Props) {
  const [showModal, setShowModal] = useState(false);
  const s = STATUS_STYLE[cart.status];

  return (
    <>
      <tr
        className="transition-colors hover:bg-white/[0.02] cursor-pointer"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        onClick={() => setShowModal(true)}
      >
        <td className="px-4 py-3">
          {cart.vinPhotoUrl
            ? <img src={cart.vinPhotoUrl} alt="VIN" className="w-12 h-9 object-cover rounded-md"
                   style={{ border: '1px solid rgba(255,255,255,0.08)' }} />
            : <div className="w-12 h-9 rounded-md" style={{ background: '#1c2333' }} />
          }
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {flagged && <AlertTriangle size={13} style={{ color: '#f85149' }} />}
            <span className="text-sm font-mono font-medium" style={{ color: '#e6edf3' }}>{cart.vin}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs font-medium px-2 py-1 rounded-md"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
            {CART_MODEL_LABELS[cart.model]}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border shrink-0"
                  style={{ background: COLOR_DOT[cart.shellColor] ?? '#888', borderColor: 'rgba(255,255,255,0.15)' }} />
            <span className="text-xs" style={{ color: '#e6edf3' }}>{cart.shellColor}</span>
            <span style={{ color: '#30363d' }}>/</span>
            <span className="w-3 h-3 rounded-full border shrink-0"
                  style={{ background: COLOR_DOT[cart.seatColor] ?? '#888', borderColor: 'rgba(255,255,255,0.15)' }} />
            <span className="text-xs" style={{ color: '#7d8590' }}>{cart.seatColor}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs" style={{ color: '#7d8590' }}>{cart.dealerName}</span>
        </td>
        <td className="px-4 py-3">
          <span className="px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: s.bg, color: s.color }}>
            {CART_STATUS_LABELS[cart.status]}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-xs" style={{ color: '#7d8590' }}>{timeAgo(cart.updatedAt)}</span>
        </td>
        <td className="px-4 py-3">
          <button
            onClick={e => { e.stopPropagation(); setShowModal(true); }}
            className="flex items-center gap-1 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all press-active focus-ring"
            style={{ color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.06)' }}>
            Update <ChevronRight size={13} />
          </button>
        </td>
      </tr>
      {showModal && <StatusUpdateModal cart={cart} onClose={() => setShowModal(false)} />}
    </>
  );
}

/** Mobile card */
export function CartCard({ cart, flagged }: Props) {
  const [showModal, setShowModal] = useState(false);
  const s = STATUS_STYLE[cart.status];

  return (
    <>
      <div
        className="rounded-xl p-4 cursor-pointer transition-all hover:bg-white/[0.02] press-active"
        style={{ background: '#161b27', border: `1px solid ${flagged ? 'rgba(248,81,73,0.2)' : 'rgba(255,255,255,0.06)'}` }}
        onClick={() => setShowModal(true)}
      >
        <div className="flex items-start gap-3">
          {/* Photo */}
          <div className="shrink-0">
            {cart.vinPhotoUrl
              ? <img src={cart.vinPhotoUrl} alt="VIN" className="w-14 h-10 object-cover rounded-lg"
                     style={{ border: '1px solid rgba(255,255,255,0.08)' }} />
              : <div className="w-14 h-10 rounded-lg" style={{ background: '#1c2333' }} />
            }
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {flagged && <AlertTriangle size={12} style={{ color: '#f85149' }} />}
              <span className="font-mono font-bold text-sm" style={{ color: '#e6edf3' }}>{cart.vin}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium ml-auto"
                    style={{ background: s.bg, color: s.color }}>
                {CART_STATUS_LABELS[cart.status]}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                {CART_MODEL_LABELS[cart.model]}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border shrink-0"
                      style={{ background: COLOR_DOT[cart.shellColor] ?? '#888', borderColor: 'rgba(255,255,255,0.15)' }} />
                <span className="text-xs" style={{ color: '#7d8590' }}>{cart.shellColor}</span>
                <span className="text-xs" style={{ color: '#30363d' }}>/</span>
                <span className="w-2.5 h-2.5 rounded-full border shrink-0"
                      style={{ background: COLOR_DOT[cart.seatColor] ?? '#888', borderColor: 'rgba(255,255,255,0.15)' }} />
                <span className="text-xs" style={{ color: '#7d8590' }}>{cart.seatColor}</span>
              </div>
              <span className="text-xs" style={{ color: '#7d8590' }}>{cart.dealerName}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3"
             style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <span className="text-xs" style={{ color: '#7d8590' }}>Updated {timeAgo(cart.updatedAt)}</span>
          <button
            onClick={e => { e.stopPropagation(); setShowModal(true); }}
            className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold press-active focus-ring"
            style={{ color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.08)' }}>
            Update <ChevronRight size={14} />
          </button>
        </div>
      </div>
      {showModal && <StatusUpdateModal cart={cart} onClose={() => setShowModal(false)} />}
    </>
  );
}

/** Default export kept for backward compatibility */
export default CartTableRow;
