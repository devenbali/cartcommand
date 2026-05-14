import React, { useEffect, useRef, useState } from 'react';
import { Search, Filter, Plus, X, Loader2, ChevronRight, Camera, ImageIcon, ScanLine, AlertCircle, Pencil, Trash2 } from 'lucide-react';
import { subscribeToAllCarts, createCartManual, uploadVINPhoto, subscribeToDealers, updateCartDetails, deleteCart } from '../lib/firestore';
import { extractVinFromPhoto } from '../lib/openrouter';
import StatusUpdateModal from '../components/production/StatusUpdateModal';
import { CART_MODEL_LABELS, CART_STATUS_LABELS, CART_MODELS, SHELL_COLORS, SEAT_COLORS } from '../types';
import type { Cart, CartStatus, CartModel, ShellColor, SeatColor, Dealer } from '../types';
import { useAuth } from '../contexts/AuthContext';

const STATUS_STYLE: Record<CartStatus, { bg: string; color: string }> = {
  intake:        { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
  built:         { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
  in_queue:      { bg: 'rgba(210,153,34,0.12)',  color: '#d29922' },
  qc_fail:       { bg: 'rgba(248,81,73,0.12)',   color: '#f85149' },
  qc_pass:       { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e' },
  painted:       { bg: 'rgba(168,85,247,0.12)',  color: '#a855f7' },
  ready_to_ship: { bg: 'rgba(6,182,212,0.12)',   color: '#06b6d4' },
  shipped:       { bg: 'rgba(34,197,94,0.08)',   color: '#16a34a' },
  incomplete:    { bg: 'rgba(249,115,22,0.12)',  color: '#f97316' },
};

const COLOR_DOT: Record<string, string> = {
  Red: '#ef4444', White: '#f1f5f9', Blue: '#3b82f6', Black: '#1e293b',
  'Matte Grey': '#6b7280', 'Cloud Blue': '#7dd3fc', Burgundy: '#9f1239',
  Silver: '#c0c0c0', Brown: '#92400e', Grey: '#6b7280',
};

const ALL_STATUSES: CartStatus[] = [
  'intake', 'built', 'in_queue', 'qc_fail', 'qc_pass', 'painted', 'ready_to_ship', 'shipped', 'incomplete',
];

function fmtDate(val: unknown): string {
  if (!val) return '—';
  const d = (val as { toDate?: () => Date }).toDate?.() ?? new Date(val as string);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function completedDate(cart: Cart): string {
  if (cart.shippedAt) return fmtDate(cart.shippedAt);
  if (cart.readyToShipAt) return fmtDate(cart.readyToShipAt);
  if (cart.paintedAt) return fmtDate(cart.paintedAt);
  if (cart.qcPassedAt) return fmtDate(cart.qcPassedAt);
  return '—';
}

// ─── Manual entry modal ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  vin: '', model: 'ECO4' as CartModel, shellColor: 'White' as ShellColor,
  seatColor: 'Black' as SeatColor, dealerId: '', dealerName: '', status: 'intake' as CartStatus,
};

function AddCartModal({ dealers, onClose }: { dealers: Dealer[]; onClose: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [vinPhoto, setVinPhoto] = useState<File | null>(null);
  const [vinPhotoPreview, setVinPhotoPreview] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanFailed, setScanFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVinPhoto(file);
    setVinPhotoPreview(URL.createObjectURL(file));
    setScanFailed(false);
    setScanning(true);
    try {
      const extracted = await extractVinFromPhoto(file);
      if (extracted) {
        setForm(f => ({ ...f, vin: extracted }));
        setScanFailed(false);
      } else {
        setScanFailed(true);
      }
    } catch {
      setScanFailed(true);
    } finally {
      setScanning(false);
    }
  }

  async function handleSubmit() {
    if (!user) return;
    if (!form.vin.trim()) { setError('VIN is required.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const dealerId = form.dealerId || 'unknown';
      const dealerName = form.dealerId
        ? (dealers.find(d => d.id === form.dealerId)?.name ?? 'Unknown / TBD')
        : 'Unknown / TBD';
      const tempId = `manual-${Date.now()}`;
      const vinPhotoUrl = vinPhoto ? await uploadVINPhoto(vinPhoto, tempId) : '';
      await createCartManual({
        vin: form.vin.trim().toUpperCase(),
        model: form.model,
        shellColor: form.shellColor,
        seatColor: form.seatColor,
        dealerId,
        dealerName,
        status: form.status,
        vinPhotoUrl,
        createdBy: user.uid,
        createdByName: user.name,
      });
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to create cart.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = { background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' };
  const labelStyle = { color: '#7d8590' };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-backdrop"
         style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl animate-scale-in"
           style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '94dvh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between px-6 py-5"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-semibold" style={{ color: '#e6edf3' }}>Add Cart Manually</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 press-active focus-ring" style={{ color: '#7d8590' }}>
            <X size={18} />
          </button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-5">
          {/* VIN + Photo */}
          <div className="col-span-2">
            <label className="text-sm font-medium block mb-2" style={labelStyle}>
              VIN <span style={{ color: '#f85149' }}>*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. VC-2024-0099"
                value={form.vin}
                onChange={e => setForm(f => ({ ...f, vin: e.target.value }))}
                className="flex-1 px-3 py-2.5 rounded-lg text-base outline-none font-mono"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach VIN photo"
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                style={vinPhoto
                  ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }
                  : { background: '#1c2333', color: '#7d8590', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {vinPhoto ? <ImageIcon size={13} /> : <Camera size={13} />}
                {vinPhoto ? 'Photo ✓' : 'Photo'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>
            {vinPhotoPreview && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="relative inline-block">
                  <img src={vinPhotoPreview} alt="VIN preview"
                       className="h-20 rounded-lg object-cover"
                       style={{ border: '1px solid rgba(255,255,255,0.08)' }} />
                  <button
                    type="button"
                    onClick={() => { setVinPhoto(null); setVinPhotoPreview(''); setForm(f => ({ ...f, vin: '' })); setScanFailed(false); }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: '#f85149', color: '#fff' }}
                  >
                    <X size={10} />
                  </button>
                </div>
                {scanning && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                       style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                    <Loader2 size={12} className="animate-spin shrink-0" />
                    Scanning VIN from photo…
                  </div>
                )}
                {!scanning && form.vin && !scanFailed && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                       style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                    <ScanLine size={12} className="shrink-0" />
                    VIN detected: <strong className="font-mono ml-1">{form.vin}</strong>
                  </div>
                )}
                {!scanning && scanFailed && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                       style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)', color: '#f85149' }}>
                    <AlertCircle size={12} className="shrink-0" />
                    Couldn't read VIN — enter it manually below.
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Model */}
          <div>
            <label className="text-sm font-medium block mb-2" style={labelStyle}>Model</label>
            <select value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value as CartModel }))}
                    className="w-full px-3 py-2.5 rounded-lg text-base outline-none" style={inputStyle}>
              {CART_MODELS.map(m => <option key={m} value={m} style={{ background: '#1c2333' }}>{CART_MODEL_LABELS[m]}</option>)}
            </select>
          </div>
          {/* Status */}
          <div>
            <label className="text-sm font-medium block mb-2" style={labelStyle}>Initial Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as CartStatus }))}
                    className="w-full px-3 py-2.5 rounded-lg text-base outline-none" style={inputStyle}>
              {ALL_STATUSES.map(s => <option key={s} value={s} style={{ background: '#1c2333' }}>{CART_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          {/* Shell Color */}
          <div>
            <label className="text-sm font-medium block mb-2" style={labelStyle}>Shell Color</label>
            <select value={form.shellColor} onChange={e => setForm(f => ({ ...f, shellColor: e.target.value as ShellColor }))}
                    className="w-full px-3 py-2.5 rounded-lg text-base outline-none" style={inputStyle}>
              {SHELL_COLORS.map(c => <option key={c} value={c} style={{ background: '#1c2333' }}>{c}</option>)}
            </select>
          </div>
          {/* Seat Color */}
          <div>
            <label className="text-sm font-medium block mb-2" style={labelStyle}>Seat Color</label>
            <select value={form.seatColor} onChange={e => setForm(f => ({ ...f, seatColor: e.target.value as SeatColor }))}
                    className="w-full px-3 py-2.5 rounded-lg text-base outline-none" style={inputStyle}>
              {SEAT_COLORS.map(c => <option key={c} value={c} style={{ background: '#1c2333' }}>{c}</option>)}
            </select>
          </div>
          {/* Dealer */}
          <div className="col-span-2">
            <label className="text-sm font-medium block mb-2" style={labelStyle}>Dealer</label>
            <select value={form.dealerId} onChange={e => setForm(f => ({ ...f, dealerId: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-base outline-none" style={inputStyle}>
              <option value="" style={{ background: '#1c2333' }}>Unknown / TBD</option>
              {dealers.map(d => <option key={d.id} value={d.id} style={{ background: '#1c2333' }}>{d.name}</option>)}
            </select>
          </div>

          {error && <p className="col-span-2 text-xs" style={{ color: '#f85149' }}>{error}</p>}

          <div className="col-span-2 flex gap-3 pt-1">
            <button
              onClick={handleSubmit}
              disabled={submitting || scanning}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: '#22c55e', color: '#0d1117' }}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {submitting ? 'Adding…' : scanning ? 'Scanning…' : 'Add Cart'}
            </button>
            <button onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm"
                    style={{ background: '#1c2333', color: '#7d8590' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit cart modal ──────────────────────────────────────────────────────────

function EditCartModal({ cart, dealers, onClose }: { cart: Cart; dealers: Dealer[]; onClose: () => void }) {
  const [newVin,     setNewVin]     = useState(cart.newVin ?? '');
  const [model,      setModel]      = useState<CartModel>(cart.model);
  const [shellColor, setShellColor] = useState<ShellColor>(cart.shellColor);
  const [seatColor,  setSeatColor]  = useState<SeatColor>(cart.seatColor);
  const [dealerId,   setDealerId]   = useState(cart.dealerId);
  const [dealerName, setDealerName] = useState(cart.dealerName);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  const inputStyle = { background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' };
  const labelStyle = { color: '#7d8590' };

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const selectedDealer = dealers.find(d => d.id === dealerId);
      await updateCartDetails(cart.id, {
        newVin:     newVin.trim().toUpperCase() || undefined,
        model,
        shellColor,
        seatColor,
        dealerId:   dealerId || 'unknown',
        dealerName: (selectedDealer?.name ?? dealerName) || 'Unknown / TBD',
      });
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-backdrop"
         style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl animate-scale-in"
           style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '94dvh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between px-6 py-5"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-semibold" style={{ color: '#e6edf3' }}>Edit Cart Details</h2>
            <p className="text-xs mt-0.5 font-mono" style={{ color: '#7d8590' }}>{cart.newVin ?? cart.vin}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 press-active focus-ring" style={{ color: '#7d8590' }}>
            <X size={18} />
          </button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-5">

          {/* Legacy VIN (readonly) */}
          <div className="col-span-2">
            <label className="text-sm font-medium block mb-2" style={labelStyle}>Legacy VIN</label>
            <div className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                 style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#7d8590' }}>
              {cart.vin}
            </div>
          </div>

          {/* New VIN */}
          <div className="col-span-2">
            <label className="text-sm font-medium block mb-2" style={labelStyle}>
              New VIN <span className="opacity-60">(leave blank if unchanged)</span>
            </label>
            <input
              type="text"
              placeholder="Enter corrected VIN…"
              value={newVin}
              onChange={e => setNewVin(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
              style={inputStyle}
            />
          </div>

          {/* Model */}
          <div>
            <label className="text-sm font-medium block mb-2" style={labelStyle}>Model</label>
            <select value={model} onChange={e => setModel(e.target.value as CartModel)}
                    className="w-full px-3 py-2.5 rounded-lg text-base outline-none" style={inputStyle}>
              {CART_MODELS.map(m => <option key={m} value={m} style={{ background: '#1c2333' }}>{CART_MODEL_LABELS[m]}</option>)}
            </select>
          </div>

          {/* Shell Color */}
          <div>
            <label className="text-sm font-medium block mb-2" style={labelStyle}>Shell Color</label>
            <select value={shellColor} onChange={e => setShellColor(e.target.value as ShellColor)}
                    className="w-full px-3 py-2.5 rounded-lg text-base outline-none" style={inputStyle}>
              {SHELL_COLORS.map(c => <option key={c} value={c} style={{ background: '#1c2333' }}>{c}</option>)}
            </select>
          </div>

          {/* Seat Color */}
          <div>
            <label className="text-sm font-medium block mb-2" style={labelStyle}>Seat Color</label>
            <select value={seatColor} onChange={e => setSeatColor(e.target.value as SeatColor)}
                    className="w-full px-3 py-2.5 rounded-lg text-base outline-none" style={inputStyle}>
              {SEAT_COLORS.map(c => <option key={c} value={c} style={{ background: '#1c2333' }}>{c}</option>)}
            </select>
          </div>

          {/* Dealer */}
          <div>
            <label className="text-sm font-medium block mb-2" style={labelStyle}>Dealer</label>
            <select value={dealerId}
                    onChange={e => {
                      const d = dealers.find(d => d.id === e.target.value);
                      setDealerId(e.target.value);
                      setDealerName(d?.name ?? '');
                    }}
                    className="w-full px-3 py-2.5 rounded-lg text-base outline-none" style={inputStyle}>
              <option value="" style={{ background: '#1c2333' }}>Unknown / TBD</option>
              {dealers.map(d => <option key={d.id} value={d.id} style={{ background: '#1c2333' }}>{d.name}</option>)}
            </select>
          </div>

          {error && <p className="col-span-2 text-xs" style={{ color: '#f85149' }}>{error}</p>}

          <div className="col-span-2 flex gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: '#22c55e', color: '#0d1117' }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm"
                    style={{ background: '#1c2333', color: '#7d8590' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteConfirmModal({ cart, onClose }: { cart: Cart; onClose: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCart(cart.id);
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to delete cart.');
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-backdrop"
         style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl animate-scale-in p-6"
           style={{ background: '#161b27', border: '1px solid rgba(248,81,73,0.25)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
               style={{ background: 'rgba(248,81,73,0.12)' }}>
            <Trash2 size={18} style={{ color: '#f85149' }} />
          </div>
          <div>
            <h2 className="font-semibold" style={{ color: '#e6edf3' }}>Delete Cart</h2>
            <p className="text-xs font-mono mt-0.5" style={{ color: '#7d8590' }}>{cart.newVin ?? cart.vin}</p>
          </div>
        </div>
        <p className="text-sm mb-5" style={{ color: '#7d8590' }}>
          This will permanently remove this cart from the master list. This action cannot be undone.
        </p>
        {error && <p className="text-xs mb-4" style={{ color: '#f85149' }}>{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: '#f85149', color: '#fff' }}
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? 'Deleting…' : 'Delete Cart'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm"
                  style={{ background: '#1c2333', color: '#7d8590' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Carts() {
  const { isSupervisor, isManager, isOwner } = useAuth();
  const [carts, setCarts]     = useState<Cart[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [statusFilter, setStatusFilter] = useState<CartStatus | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCart, setSelectedCart]           = useState<Cart | null>(null);
  const [editCart, setEditCart]                   = useState<Cart | null>(null);
  const [deleteConfirmCart, setDeleteConfirmCart] = useState<Cart | null>(null);

  useEffect(() => {
    return subscribeToAllCarts(
      data => { setCarts(data); setLoading(false); },
      () => setLoading(false)
    );
  }, []);

  useEffect(() => subscribeToDealers(setDealers), []);

  const filtered = carts.filter(c => {
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || c.vin.toLowerCase().includes(q) || c.model.toLowerCase().includes(q) ||
      c.shellColor.toLowerCase().includes(q) || c.dealerName.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div className="p-4 md:p-8 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
            Master Carts List
          </h1>
          <p className="text-sm mt-1" style={{ color: '#7d8590' }}>
            {loading ? 'Loading…' : `${carts.length} total cart${carts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {isSupervisor && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: '#22c55e', color: '#0d1117' }}
          >
            <Plus size={16} />
            Add Cart
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl flex-1 min-w-[200px]"
             style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Search size={15} style={{ color: '#7d8590' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search VIN, model, color, dealer…"
            className="bg-transparent outline-none text-base flex-1"
            style={{ color: '#e6edf3' }}
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
             style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Filter size={15} style={{ color: '#7d8590' }} />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as CartStatus | 'all')}
            className="bg-transparent outline-none text-base"
            style={{ color: '#e6edf3' }}
          >
            <option value="all" style={{ background: '#1c2333' }}>All Statuses</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s} style={{ background: '#1c2333' }}>{CART_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-2 mb-6">
        {ALL_STATUSES.map(s => {
          const count = carts.filter(c => c.status === s).length;
          if (count === 0) return null;
          const st = STATUS_STYLE[s];
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: statusFilter === s ? st.bg : 'rgba(255,255,255,0.04)', color: statusFilter === s ? st.color : '#7d8590', border: `1px solid ${statusFilter === s ? st.color + '40' : 'rgba(255,255,255,0.06)'}` }}
            >
              <span className="font-bold">{count}</span> {CART_STATUS_LABELS[s]}
            </button>
          );
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <th className="px-4 py-4 text-left text-xs font-medium uppercase tracking-wider w-32" style={{ color: '#7d8590' }}>VIN</th>
              <th className="px-4 py-4 text-left text-xs font-medium uppercase tracking-wider w-28" style={{ color: '#7d8590' }}>Model</th>
              <th className="px-4 py-4 text-left text-xs font-medium uppercase tracking-wider w-44" style={{ color: '#7d8590' }}>Shell / Seat Color</th>
              <th className="px-4 py-4 text-left text-xs font-medium uppercase tracking-wider w-36" style={{ color: '#7d8590' }}>Dealer</th>
              <th className="px-4 py-4 text-left text-xs font-medium uppercase tracking-wider w-32" style={{ color: '#7d8590' }}>Status</th>
              <th className="px-4 py-4 text-left text-xs font-medium uppercase tracking-wider w-32" style={{ color: '#7d8590' }}>Created</th>
              <th className="px-4 py-4 text-left text-xs font-medium uppercase tracking-wider w-32" style={{ color: '#7d8590' }}>Ship Date</th>
              <th className="px-4 py-4 w-20" style={{ color: '#7d8590' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: '#7d8590', background: '#0d1117' }}>
                  Loading carts…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: '#7d8590', background: '#0d1117' }}>
                  {carts.length === 0 ? 'No carts found.' : 'No carts match your filter.'}
                </td>
              </tr>
            )}
            {!loading && filtered.map((cart, i) => {
              const s = STATUS_STYLE[cart.status] ?? { bg: 'rgba(125,133,144,0.12)', color: '#7d8590' };
              const shipDateDisplay = cart.shippingDate
                ? new Date(cart.shippingDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : completedDate(cart) !== '—' && cart.status === 'shipped' ? completedDate(cart) : '—';
              return (
                <tr key={cart.id}
                    className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                    onClick={() => setSelectedCart(cart)}
                    style={{ background: i % 2 === 0 ? '#0d1117' : 'rgba(28,35,51,0.4)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-0.5">
                      {cart.newVin ? (
                        <>
                          <span className="font-mono font-medium text-base" style={{ color: '#e6edf3' }}>{cart.newVin}</span>
                          <span className="font-mono text-sm" style={{ color: '#7d8590' }}>Legacy: {cart.vin}</span>
                        </>
                      ) : (
                        <span className="font-mono font-medium text-base" style={{ color: '#e6edf3' }}>{cart.vin}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm font-medium px-2.5 py-1 rounded-md"
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                      {CART_MODEL_LABELS[cart.model]}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border shrink-0"
                            style={{ background: COLOR_DOT[cart.shellColor] ?? '#888', borderColor: 'rgba(255,255,255,0.15)' }} />
                      <span className="text-sm" style={{ color: '#e6edf3' }}>{cart.shellColor}</span>
                      <span style={{ color: '#30363d' }}>/</span>
                      <span className="w-3 h-3 rounded-full border shrink-0"
                            style={{ background: COLOR_DOT[cart.seatColor] ?? '#888', borderColor: 'rgba(255,255,255,0.15)' }} />
                      <span className="text-sm" style={{ color: '#7d8590' }}>{cart.seatColor}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm truncate block" style={{ color: '#7d8590' }}>{cart.dealerName}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap"
                          style={{ background: s.bg, color: s.color }}>
                      {CART_STATUS_LABELS[cart.status]}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm" style={{ color: '#7d8590' }}>{fmtDate(cart.createdAt)}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm" style={{ color: cart.status === 'shipped' ? '#22c55e' : '#7d8590' }}>
                      {shipDateDisplay}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedCart(cart); }}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-all"
                      style={{ color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                    >
                      Status <ChevronRight size={14} />
                    </button>
                    {isSupervisor && (
                      <button
                        onClick={e => { e.stopPropagation(); setEditCart(cart); }}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-all mt-1"
                        style={{ color: '#7d8590', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        <Pencil size={13} /> Details
                      </button>
                    )}
                    {isManager && (
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirmCart(cart); }}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-all mt-1"
                        style={{ color: '#f85149', border: '1px solid rgba(248,81,73,0.2)' }}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="flex flex-col gap-4 md:hidden">
        {loading && <p className="text-sm text-center py-10" style={{ color: '#7d8590' }}>Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-center py-10" style={{ color: '#7d8590' }}>No carts match your filter.</p>
        )}
        {!loading && filtered.map(cart => {
          const s = STATUS_STYLE[cart.status] ?? { bg: 'rgba(125,133,144,0.12)', color: '#7d8590' };
          return (
            <div key={cart.id} className="rounded-xl p-5 cursor-pointer hover:bg-white/[0.01] transition-all"
                 onClick={() => setSelectedCart(cart)}
                 style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono font-bold" style={{ color: '#e6edf3' }}>{cart.newVin ?? cart.vin}</span>
                  {cart.newVin && (
                    <span className="font-mono text-xs" style={{ color: '#7d8590' }}>Legacy: {cart.vin}</span>
                  )}
                </div>
                <span className="px-2.5 py-1 rounded-full text-sm font-medium"
                      style={{ background: s.bg, color: s.color }}>
                  {CART_STATUS_LABELS[cart.status]}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: '#7d8590' }}>
                <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                  {CART_MODEL_LABELS[cart.model]}
                </span>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full border" style={{ background: COLOR_DOT[cart.shellColor] ?? '#888', borderColor: 'rgba(255,255,255,0.15)' }} />
                  {cart.shellColor}
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full border" style={{ background: COLOR_DOT[cart.seatColor] ?? '#888', borderColor: 'rgba(255,255,255,0.15)' }} />
                  {cart.seatColor}
                </div>
                <span>{cart.dealerName}</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 text-sm"
                   style={{ borderTop: '1px solid rgba(255,255,255,0.04)', color: '#7d8590' }}>
                <span>Created {fmtDate(cart.createdAt)}</span>
                <div className="flex items-center gap-2">
                  {cart.shippingDate && (
                    <span style={{ color: '#22c55e' }}>Ships {new Date(cart.shippingDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  )}
                  {isSupervisor && (
                    <button
                      onClick={e => { e.stopPropagation(); setEditCart(cart); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all"
                      style={{ color: '#7d8590', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                  )}
                  {isOwner && (
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteConfirmCart(cart); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all"
                      style={{ color: '#f85149', border: '1px solid rgba(248,81,73,0.2)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && (
        <p className="text-xs mt-3" style={{ color: '#7d8590' }}>
          {filtered.length} of {carts.length} cart{carts.length !== 1 ? 's' : ''} shown
        </p>
      )}

      {showAddModal && <AddCartModal dealers={dealers} onClose={() => setShowAddModal(false)} />}
      {selectedCart && <StatusUpdateModal cart={selectedCart} onClose={() => setSelectedCart(null)} />}
      {editCart && <EditCartModal cart={editCart} dealers={dealers} onClose={() => setEditCart(null)} />}
      {deleteConfirmCart && <DeleteConfirmModal cart={deleteConfirmCart} onClose={() => setDeleteConfirmCart(null)} />}
    </div>
  );
}
