import React, { useRef, useState } from 'react';
import { Camera, Upload, X, ChevronRight, ChevronLeft, Check, Loader2, AlertCircle, ScanLine, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useClockStatus } from '../../hooks/useClockStatus';
import { useDealers } from '../../hooks/useDealers';
import { createCart, uploadVINPhoto, addDealer } from '../../lib/firestore';
import { extractVinFromPhoto } from '../../lib/openrouter';
import { CART_MODELS, CART_MODEL_LABELS, SHELL_COLORS, SEAT_COLORS } from '../../types';
import type { CartModel, ShellColor, SeatColor } from '../../types';

interface Props { onClose: () => void; }

const STEPS = ['VIN Photo', 'Cart Specs', 'Confirm'] as const;

const INPUT = 'w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all';
const INPUT_STYLE = { background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' };

export default function VINIntakeModal({ onClose }: Props) {
  const { user, isManager } = useAuth();
  const { isClockedIn } = useClockStatus(user?.uid);
  const clockedInOrManager = isManager || isClockedIn;
  const { dealers } = useDealers();

  const [step, setStep]           = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [dragging, setDragging]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [scanning, setScanning]   = useState(false);
  const [scanFailed, setScanFailed] = useState(false);
  const [newDealerInput, setNewDealerInput] = useState('');
  const [showNewDealer, setShowNewDealer]   = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Step 2 fields
  const [vin, setVin]               = useState('');
  const [model, setModel]           = useState<CartModel>('ECO4');
  const [shellColor, setShellColor] = useState<ShellColor>('Red');
  const [seatColor, setSeatColor]   = useState<SeatColor>('Black');
  const [dealerId, setDealerId]     = useState('');
  const [dealerName, setDealerName] = useState('');

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError('');
    setScanFailed(false);
    setVin('');

    // Auto-extract VIN from photo
    setScanning(true);
    try {
      const extracted = await extractVinFromPhoto(file);
      if (extracted) {
        setVin(extracted);
        setScanFailed(false);
      } else {
        setScanFailed(true);
      }
    } catch {
      setScanFailed(true);
    } finally {
      setScanning(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDealerSelect = (id: string, name: string) => {
    setDealerId(id); setDealerName(name); setShowNewDealer(false);
  };

  const handleAddDealer = async () => {
    if (!newDealerInput.trim()) return;
    const newDealer = await addDealer(newDealerInput.trim());
    handleDealerSelect(newDealer.id, newDealer.name);
    setNewDealerInput('');
    setShowNewDealer(false);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true); setError('');
    try {
      const tempId  = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const photoUrl = photoFile ? await uploadVINPhoto(photoFile, tempId) : '';
      await createCart({
        vin: vin.trim().toUpperCase(),
        vinPhotoUrl: photoUrl,
        model, shellColor, seatColor,
        dealerId, dealerName,
        createdBy: user.uid,
        createdByName: user.name,
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to create cart.');
      setSubmitting(false);
    }
  };

  const canAdvance = [
    true, // photo is optional — can always advance from step 0
    vin.trim().length >= 3,
    true,
  ][step];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-backdrop"
         style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl animate-scale-in overflow-hidden"
           style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '94dvh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-semibold" style={{ color: '#e6edf3' }}>New Build Intake</h2>
            <p className="text-xs mt-0.5" style={{ color: '#7d8590' }}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-all"
                  style={{ color: '#7d8590' }}><X size={18} /></button>
        </div>

        {/* Step indicators */}
        <div className="flex px-6 pt-4 gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                   style={{
                     background: i < step ? '#22c55e' : i === step ? 'rgba(34,197,94,0.2)' : '#1c2333',
                     color: i <= step ? '#22c55e' : '#7d8590',
                     border: `1px solid ${i === step ? '#22c55e' : 'transparent'}`,
                   }}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className="text-xs hidden sm:block" style={{ color: i === step ? '#e6edf3' : '#7d8590' }}>{s}</span>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px" style={{ background: i < step ? '#22c55e' : 'rgba(255,255,255,0.08)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-5">

          {/* ── Step 0: Photo ── */}
          {step === 0 && (
            <div className="flex flex-col gap-4">
              {!photoPreview ? (
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 rounded-xl py-12 cursor-pointer transition-all"
                  style={{
                    background: dragging ? 'rgba(34,197,94,0.06)' : '#1c2333',
                    border: `2px dashed ${dragging ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                  }}>
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center"
                       style={{ background: 'rgba(34,197,94,0.1)' }}>
                    <Upload size={24} style={{ color: '#22c55e' }} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium" style={{ color: '#e6edf3' }}>Upload VIN Tag Photo</p>
                    <p className="text-xs mt-1" style={{ color: '#7d8590' }}>Drag & drop or click to browse</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    <img src={photoPreview} alt="VIN tag" className="w-full object-cover max-h-56" />
                    <button
                      onClick={() => { setPhotoFile(null); setPhotoPreview(''); setVin(''); setScanFailed(false); }}
                      className="absolute top-2 right-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'rgba(0,0,0,0.6)', color: '#e6edf3' }}>
                      Retake
                    </button>
                  </div>

                  {/* Scan status */}
                  {scanning && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm"
                         style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                      <Loader2 size={14} className="animate-spin shrink-0" />
                      Scanning VIN from photo…
                    </div>
                  )}
                  {!scanning && vin && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm"
                         style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                      <ScanLine size={14} className="shrink-0" />
                      VIN detected: <strong className="ml-1 font-mono tracking-wider">{vin}</strong>
                      <span className="ml-auto text-xs opacity-70">Confirm on next step</span>
                    </div>
                  )}
                  {!scanning && scanFailed && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm"
                         style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)', color: '#f85149' }}>
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span>Couldn't read the VIN clearly. You can retake the photo or enter it manually on the next step.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Camera button (mobile) */}
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}>
                <Camera size={16} /> Use Camera
              </button>

              <input ref={fileRef}   type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

              <button
                onClick={() => setStep(1)}
                className="text-xs text-center transition-opacity hover:opacity-80"
                style={{ color: '#7d8590' }}
              >
                Skip photo — enter VIN manually →
              </button>
            </div>
          )}

          {/* ── Step 1: Specs ── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              {/* VIN photo reference — only shown if photo was taken */}
              {photoPreview && (
                <div className="flex gap-3 rounded-xl p-3" style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <img src={photoPreview} alt="VIN tag" className="w-24 h-16 object-cover rounded-lg shrink-0"
                       style={{ border: '1px solid rgba(255,255,255,0.08)' }} />
                  <div className="flex flex-col justify-center gap-1">
                    <p className="text-xs font-medium" style={{ color: '#7d8590' }}>VIN Tag Photo</p>
                    <p className="text-xs" style={{ color: '#7d8590' }}>Enter the VIN number from the tag below</p>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>VIN Number <span style={{ color: '#f85149' }}>*</span></label>
                <input
                  type="text" value={vin} onChange={e => setVin(e.target.value.toUpperCase())}
                  placeholder="e.g. 4V1FB23B5X012345"
                  className={INPUT} style={INPUT_STYLE}
                  onFocus={e => (e.target.style.borderColor = 'rgba(34,197,94,0.5)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>Model</label>
                  <select value={model} onChange={e => setModel(e.target.value as CartModel)}
                          className={INPUT} style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                    {CART_MODELS.map(m => <option key={m} value={m}>{CART_MODEL_LABELS[m]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>Shell Color</label>
                  <select value={shellColor} onChange={e => setShellColor(e.target.value as ShellColor)}
                          className={INPUT} style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                    {SHELL_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>Seat Color</label>
                  <select value={seatColor} onChange={e => setSeatColor(e.target.value as SeatColor)}
                          className={INPUT} style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                    {SEAT_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>Dealer <span style={{ color: '#7d8590', opacity: 0.6 }}>(optional)</span></label>
                  <select
                    value={dealerId}
                    onChange={e => {
                      if (e.target.value === '__new__') { setShowNewDealer(true); return; }
                      if (e.target.value === '') { setDealerId(''); setDealerName(''); return; }
                      const d = dealers.find(d => d.id === e.target.value);
                      if (d) handleDealerSelect(d.id, d.name);
                    }}
                    className={INPUT} style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                    <option value="">Unknown / TBD</option>
                    {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    <option value="__new__">+ Add New Dealer</option>
                  </select>
                </div>
              </div>

              {showNewDealer && (
                <div className="flex gap-2 animate-fade-in-up">
                  <input
                    type="text" value={newDealerInput} onChange={e => setNewDealerInput(e.target.value)}
                    placeholder="New dealer name…"
                    className={`flex-1 ${INPUT}`} style={INPUT_STYLE}
                  />
                  <button onClick={handleAddDealer}
                          className="px-3 py-2 rounded-lg text-sm font-medium"
                          style={{ background: '#22c55e', color: '#0d1117' }}>Add</button>
                  <button onClick={() => setShowNewDealer(false)}
                          className="px-3 py-2 rounded-lg text-sm"
                          style={{ background: '#1c2333', color: '#7d8590' }}>Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Confirm ── */}
          {step === 2 && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-4">
                {photoPreview && (
                  <img src={photoPreview} alt="VIN" className="w-24 h-20 object-cover rounded-lg shrink-0"
                       style={{ border: '1px solid rgba(255,255,255,0.08)' }} />
                )}
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-bold" style={{ color: '#e6edf3' }}>{vin}</p>
                  <p className="text-xs" style={{ color: '#7d8590' }}>
                    {CART_MODEL_LABELS[model]} · {shellColor} Shell · {seatColor} Seat
                  </p>
                  <p className="text-xs" style={{ color: dealerName ? '#7d8590' : 'rgba(210,153,34,0.8)' }}>
                    {dealerName || 'No dealer assigned'}
                  </p>
                </div>
              </div>
              <div className="rounded-lg px-4 py-3 text-xs" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', color: '#7d8590' }}>
                Cart will be created with status <strong style={{ color: '#22c55e' }}>Intake</strong>. Inventory deductions happen automatically on QC Pass.
              </div>
            </div>
          )}

          {!clockedInOrManager && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2.5 rounded-lg text-xs"
                 style={{ background: 'rgba(210,153,34,0.08)', border: '1px solid rgba(210,153,34,0.25)', color: '#d29922' }}>
              <Clock size={13} className="shrink-0" /> You must be clocked in to add a new cart.
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg text-xs"
                 style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between px-6 pb-5 gap-3">
          <button
            onClick={step === 0 ? onClose : () => setStep(s => s - 1)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
            style={{ background: '#1c2333', color: '#7d8590' }}>
            {step === 0 ? 'Cancel' : <><ChevronLeft size={15} /> Back</>}
          </button>
          {step < 2 ? (
            <button
              disabled={!canAdvance || !clockedInOrManager}
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: canAdvance && clockedInOrManager ? '#22c55e' : 'rgba(34,197,94,0.2)',
                color: canAdvance && clockedInOrManager ? '#0d1117' : 'rgba(255,255,255,0.3)',
                cursor: canAdvance && clockedInOrManager ? 'pointer' : 'not-allowed',
              }}>
              Next <ChevronRight size={15} />
            </button>
          ) : (
            <button
              disabled={submitting || !clockedInOrManager}
              onClick={handleSubmit}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#22c55e', color: '#0d1117' }}>
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><Check size={14} /> Create Cart</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
