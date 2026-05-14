import React, { useState } from 'react';
import { X, CheckCircle2, XCircle, Hammer, Paintbrush, ListChecks, Loader2, AlertCircle, ChevronDown, ChevronUp, Truck, Clock, PackageCheck, Wrench } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useClockStatus } from '../../hooks/useClockStatus';
import { useToast } from '../../contexts/ToastContext';
import { updateCartStatus, setCartShippingDate } from '../../lib/firestore';
import { calculateBOM } from '../../lib/bom';
import { CART_MODEL_LABELS, CART_STATUS_LABELS } from '../../types';
import type { Cart, CartStatus } from '../../types';

interface Props {
  cart: Cart;
  onClose: () => void;
}

// Workflow: intake → built → in_queue → qc_pass/qc_fail → painted → ready_to_ship → shipped
// Any active status → incomplete → in_queue (for QC after repair)
const STATUS_FLOW: Record<CartStatus, CartStatus[]> = {
  intake:        ['built',          'incomplete'],
  built:         ['in_queue',       'incomplete'],
  in_queue:      ['qc_pass', 'qc_fail', 'incomplete'],
  qc_fail:       ['in_queue',       'incomplete'],
  qc_pass:       ['painted',        'incomplete'],
  painted:       ['ready_to_ship',  'incomplete'],
  ready_to_ship: ['shipped',        'incomplete'],
  incomplete:    ['in_queue'],
  shipped:       [],
};

const ACTION_CONFIG: Partial<Record<CartStatus, { label: string; icon: React.ReactNode; color: string; bg: string }>> = {
  built:         { label: 'Mark as Built',       icon: <Hammer size={16} />,       color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  in_queue:      { label: 'Send to QC Queue',    icon: <ListChecks size={16} />,   color: '#d29922', bg: 'rgba(210,153,34,0.15)' },
  qc_pass:       { label: 'QC Pass',             icon: <CheckCircle2 size={16} />, color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  qc_fail:       { label: 'QC Fail',             icon: <XCircle size={16} />,      color: '#f85149', bg: 'rgba(248,81,73,0.15)' },
  painted:       { label: 'Mark as Painted',     icon: <Paintbrush size={16} />,   color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
  ready_to_ship: { label: 'Mark Ready to Ship',     icon: <Truck size={16} />,        color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },
  shipped:       { label: 'Mark as Shipped',         icon: <PackageCheck size={16} />, color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  incomplete:    { label: 'Mark Incomplete / Repair', icon: <Wrench size={16} />,       color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
};

export default function StatusUpdateModal({ cart, onClose }: Props) {
  const { user, isManager } = useAuth();
  const { isClockedIn } = useClockStatus(user?.uid);
  const { addToast } = useToast();
  const [failReason, setFailReason]         = useState('');
  const [repairNotes, setRepairNotes]       = useState(cart.repairNotes ?? '');
  const [shippingDate, setShippingDate]     = useState(
    (cart.shippingDate as string | undefined) ?? new Date().toISOString().slice(0, 10)
  );
  const [savingDate, setSavingDate]         = useState(false);
  const [dateSaved, setDateSaved]           = useState(false);
  const [submitting, setSubmitting]         = useState(false);
  const [error, setError]                   = useState('');
  const [showBOM, setShowBOM]               = useState(false);

  // Managers bypass clock requirement; workers/QC/supervisors must be clocked in
  const clockedInOrManager = isManager || isClockedIn;
  // QC pass/fail requires explicit canQC permission OR manager
  const canDoQC = isManager || !!user?.canQC;

  const nextStatuses = STATUS_FLOW[cart.status] ?? [];
  const bom = calculateBOM({ model: cart.model, shellColor: cart.shellColor, seatColor: cart.seatColor });

  // Filter available actions by role and permissions
  const availableStatuses = nextStatuses.filter(s => {
    if (s === 'qc_pass' || s === 'qc_fail') return canDoQC;
    return true;
  });

  const handleAction = async (newStatus: CartStatus) => {
    if (!user) return;
    if (newStatus === 'qc_fail' && !failReason.trim()) {
      setError('Please enter a reason for QC failure.');
      return;
    }
    if (newStatus === 'incomplete' && !repairNotes.trim()) {
      setError('Please describe what parts are missing or what needs repair.');
      return;
    }
    setSubmitting(true); setError('');
    try {
      await updateCartStatus(cart.id, newStatus, user.uid, user.name,
        newStatus === 'qc_fail' ? failReason : undefined,
        newStatus === 'incomplete' ? repairNotes : undefined);
      if (newStatus === 'shipped' && shippingDate) {
        const { setCartShippingDate } = await import('../../lib/firestore');
        await setCartShippingDate(cart.id, shippingDate);
      }
      // BOM deduction runs server-side via Cloud Function (onQCPass trigger)
      const label = CART_STATUS_LABELS[newStatus] ?? newStatus;
      addToast(`Cart ${cart.newVin ?? cart.vin} → ${label}`, newStatus === 'qc_fail' ? 'error' : 'success');
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Update failed.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-backdrop"
         style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl animate-scale-in"
           style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '92dvh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-semibold" style={{ color: '#e6edf3' }}>Update Cart Status</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5"
                  style={{ color: '#7d8590' }}><X size={18} /></button>
        </div>

        {/* Cart summary */}
        <div className="px-5 pt-4 pb-3 flex gap-4 items-start">
          {cart.vinPhotoUrl && (
            <img src={cart.vinPhotoUrl} alt="VIN"
                 className="w-16 h-12 object-cover rounded-lg shrink-0"
                 style={{ border: '1px solid rgba(255,255,255,0.08)' }} />
          )}
          <div>
            <p className="font-bold text-sm" style={{ color: '#e6edf3' }}>{cart.newVin ?? cart.vin}</p>
            <p className="text-xs mt-0.5" style={{ color: '#7d8590' }}>
              {CART_MODEL_LABELS[cart.model]} · {cart.shellColor} Shell · {cart.seatColor} Seat
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#7d8590' }}>{cart.dealerName}</p>
          </div>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-3">

          {/* Previous QC fail reason */}
          {cart.status === 'qc_fail' && cart.qcFailReason && (
            <div className="rounded-lg px-3 py-2.5 text-xs"
                 style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)', color: '#f85149' }}>
              <strong>Fail reason:</strong> {cart.qcFailReason}
            </div>
          )}

          {/* Existing repair notes (when cart is already incomplete) */}
          {cart.status === 'incomplete' && cart.repairNotes && (
            <div className="rounded-lg px-3 py-2.5 text-xs"
                 style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', color: '#f97316' }}>
              <p className="font-semibold mb-1">Repair / Missing Parts:</p>
              <p className="leading-relaxed whitespace-pre-wrap">{cart.repairNotes}</p>
            </div>
          )}

          {/* BOM preview for QC Pass */}
          {availableStatuses.includes('qc_pass') && (
            <div className="rounded-lg overflow-hidden"
                 style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={() => setShowBOM(v => !v)}
                className="flex items-center justify-between w-full px-3 py-2.5 text-xs font-medium"
                style={{ background: '#1c2333', color: '#7d8590' }}>
                <span>Auto inventory deductions on QC Pass ({bom.length} parts)</span>
                {showBOM ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showBOM && (
                <div className="flex flex-col divide-y" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  {bom.map(({ itemName, quantity }) => (
                    <div key={itemName} className="flex justify-between px-3 py-2 text-xs"
                         style={{ color: '#7d8590' }}>
                      <span>{itemName}</span>
                      <span style={{ color: '#f85149' }}>−{quantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Repair notes input */}
          {availableStatuses.includes('incomplete') && (
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>
                Missing Parts / Repair Notes <span style={{ color: '#f97316' }}>*</span>
              </label>
              <textarea
                rows={3}
                value={repairNotes}
                onChange={e => setRepairNotes(e.target.value)}
                placeholder="List missing parts or describe what needs to be repaired…"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
              />
            </div>
          )}

          {/* QC Fail reason input */}
          {availableStatuses.includes('qc_fail') && (
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>
                QC Fail Reason <span style={{ color: '#f85149' }}>*</span>
              </label>
              <textarea
                rows={3}
                value={failReason}
                onChange={e => setFailReason(e.target.value)}
                placeholder="Describe the issue in detail…"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
              />
            </div>
          )}

          {/* Ship date — editable for ready_to_ship (before and when marking shipped) */}
          {(cart.status === 'ready_to_ship' || availableStatuses.includes('shipped')) && (
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>
                Ship Date
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={shippingDate}
                  onChange={e => { setShippingDate(e.target.value); setDateSaved(false); }}
                  className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3', colorScheme: 'dark' }}
                />
                {cart.status === 'ready_to_ship' && (
                  <button
                    onClick={async () => {
                      setSavingDate(true);
                      try { await setCartShippingDate(cart.id, shippingDate); setDateSaved(true); }
                      finally { setSavingDate(false); }
                    }}
                    disabled={savingDate}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                    style={dateSaved
                      ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }
                      : { background: '#1c2333', color: '#7d8590', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {savingDate ? <Loader2 size={12} className="animate-spin" /> : dateSaved ? '✓ Saved' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Clock-in warning */}
          {!clockedInOrManager && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
                 style={{ background: 'rgba(210,153,34,0.08)', border: '1px solid rgba(210,153,34,0.25)', color: '#d29922' }}>
              <Clock size={13} className="shrink-0" />
              You must be clocked in to update cart status.
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                 style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}

          {availableStatuses.length === 0 && clockedInOrManager && (
            <p className="text-sm text-center py-4" style={{ color: '#7d8590' }}>
              No further status updates available.
            </p>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            {availableStatuses.map(status => {
              const cfg = ACTION_CONFIG[status];
              if (!cfg) return null;
              const blocked = !clockedInOrManager;
              return (
                <button
                  key={status}
                  disabled={submitting || blocked}
                  onClick={() => handleAction(status)}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed press-active focus-ring"
                  style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : cfg.icon}
                  {submitting ? 'Updating…' : cfg.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
