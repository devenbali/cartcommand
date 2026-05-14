import React, { useState, useRef } from 'react';
import { Plus, Search, Camera, Image, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useClockStatus } from '../hooks/useClockStatus';
import { useScrapLog } from '../hooks/useScrapLog';
import { addScrapLogEntry, uploadScrapPhoto } from '../lib/firestore';

const EMPTY_FORM = {
  itemName:      '',
  partNumber:    '',
  problemInfo:   '',
  quantity:      1,
  associatedVin: '',
};

export default function ScrapLog() {
  const { user, isManager } = useAuth();
  const { isClockedIn } = useClockStatus(user?.uid);
  const clockedInOrManager = isManager || isClockedIn;
  const { entries, loading } = useScrapLog();

  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoChange(file: File | null) {
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) handlePhotoChange(file);
  }

  async function handleSubmit() {
    if (!user) return;
    if (!form.itemName.trim()) { setError('Item name is required.'); return; }
    if (!form.problemInfo.trim()) { setError('Problem information is required.'); return; }
    setError('');
    setSubmitting(true);

    try {
      // Upload photo first if present (use a temp ID before doc exists)
      let photoUrl: string | undefined;
      if (photoFile) {
        const tempId = `temp_${Date.now()}`;
        photoUrl = await uploadScrapPhoto(photoFile, tempId);
      }

      await addScrapLogEntry({
        itemName:      form.itemName.trim(),
        partNumber:    form.partNumber.trim() || undefined,
        problemInfo:   form.problemInfo.trim(),
        quantity:      form.quantity,
        photoUrl,
        associatedVin: form.associatedVin.trim() || undefined,
        loggedBy:     user.uid,
        loggedByName: user.name,
      });

      setForm(EMPTY_FORM);
      setPhotoFile(null);
      setPhotoPreview(null);
      setShowForm(false);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to submit. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = entries.filter(e =>
    e.itemName.toLowerCase().includes(search.toLowerCase()) ||
    (e.associatedVin ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Month totals (rough — we don't store a price, so just count qty)
  const now = new Date();
  const monthQty = entries.reduce((sum, e) => {
    const d = (e.date as unknown as { toDate?: () => Date }).toDate?.() ?? new Date(e.date as unknown as string);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) return sum + e.quantity;
    return sum;
  }, 0);

  // Most frequent defect this month
  const defectCounts: Record<string, number> = {};
  entries.forEach(e => {
    const d = (e.date as unknown as { toDate?: () => Date }).toDate?.() ?? new Date(e.date as unknown as string);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      defectCounts[e.itemName] = (defectCounts[e.itemName] ?? 0) + 1;
    }
  });
  const topDefect = Object.entries(defectCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  function formatDate(val: unknown): string {
    if (!val) return '—';
    if (typeof (val as any).toDate === 'function') return (val as any).toDate().toLocaleDateString();
    return new Date(val as string).toLocaleDateString();
  }

  return (
    <div className="p-8 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
            Scrap &amp; Defective Log
          </h1>
          <p className="text-sm mt-1" style={{ color: '#7d8590' }}>Track all damaged and defective parts</p>
        </div>
        <button
          onClick={() => clockedInOrManager && setShowForm(v => !v)}
          disabled={!clockedInOrManager}
          title={!clockedInOrManager ? 'You must be clocked in to log scrap' : ''}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: '#22c55e', color: '#0d1117' }}
        >
          {clockedInOrManager ? <Plus size={16} /> : <Clock size={16} />}
          Log Scrap Part
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#7d8590' }}>Total Scrap Parts This Month</p>
          <p className="text-2xl font-bold" style={{ color: '#22c55e' }}>{monthQty}</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#7d8590' }}>Most Frequent Defect</p>
          <p className="text-2xl font-bold truncate" style={{ color: '#e6edf3' }}>{topDefect}</p>
        </div>
      </div>

      {/* Log form */}
      {showForm && (
        <div className="rounded-xl p-6 mb-6"
             style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-base font-semibold mb-5" style={{ color: '#e6edf3' }}>Log New Scrap Item</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>
                Item Name <span style={{ color: '#f85149' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. LED Headlight Assembly"
                value={form.itemName}
                onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>
                Part Number (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. VC-HL-001"
                value={form.partNumber}
                onChange={e => setForm(f => ({ ...f, partNumber: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>
                Problem Information <span style={{ color: '#f85149' }}>*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Describe the defect in detail…"
                value={form.problemInfo}
                onChange={e => setForm(f => ({ ...f, problemInfo: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>Quantity</label>
              <input
                type="number"
                min={1}
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: Math.max(1, Number(e.target.value)) }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>VIN Association (Optional)</label>
              <input
                type="text"
                placeholder="Scan or type VIN…"
                value={form.associatedVin}
                onChange={e => setForm(f => ({ ...f, associatedVin: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>Defect Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => handlePhotoChange(e.target.files?.[0] ?? null)}
              />
              {photoPreview ? (
                <div className="relative rounded-lg overflow-hidden"
                     style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <img src={photoPreview} alt="Preview" className="w-full max-h-48 object-cover" />
                  <button
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                    className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium"
                    style={{ background: 'rgba(13,17,23,0.8)', color: '#f85149' }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg py-8 cursor-pointer transition-all"
                  style={{ background: '#1c2333', border: '2px dashed rgba(255,255,255,0.1)' }}
                >
                  <Camera size={22} style={{ color: '#7d8590' }} />
                  <span className="text-sm" style={{ color: '#7d8590' }}>
                    Click to upload or drag &amp; drop
                  </span>
                  <span className="text-xs" style={{ color: '#7d8590' }}>JPG, PNG, HEIC accepted</span>
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-sm mt-3" style={{ color: '#f85149' }}>{error}</p>}

          <div className="flex gap-3 mt-5">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: '#22c55e', color: '#0d1117' }}
            >
              {submitting ? 'Submitting…' : 'Submit Log'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setPhotoFile(null); setPhotoPreview(null); setError(''); }}
              className="px-5 py-2 rounded-lg text-sm"
              style={{ background: '#1c2333', color: '#7d8590' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Historical log table */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold" style={{ color: '#e6edf3' }}>Historical Scrap Log</h2>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
               style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Search size={13} style={{ color: '#7d8590' }} />
            <input
              type="text"
              placeholder="Filter entries…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none text-xs w-36"
              style={{ color: '#e6edf3' }}
            />
          </div>
        </div>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Date', 'Logged By', 'Item Name', 'Problem Info', 'Qty', 'Photo', 'VIN'].map(h => (
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
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm"
                      style={{ color: '#7d8590', background: '#0d1117' }}>
                    No scrap entries yet.
                  </td>
                </tr>
              )}
              {!loading && filtered.map((entry, i) => (
                <tr key={entry.id}
                    style={{
                      background: i % 2 === 0 ? '#0d1117' : 'rgba(28,35,51,0.4)',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#7d8590' }}>
                    {formatDate(entry.date)}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#7d8590' }}>
                    {entry.loggedByName}
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: '#e6edf3' }}>
                    {entry.itemName}
                    {entry.partNumber && (
                      <span className="block text-xs font-normal" style={{ color: '#7d8590' }}>{entry.partNumber}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-xs" style={{ color: '#7d8590' }}>
                    <span className="line-clamp-2">{entry.problemInfo}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-center" style={{ color: '#e6edf3' }}>
                    {entry.quantity}
                  </td>
                  <td className="px-4 py-3">
                    {entry.photoUrl ? (
                      <a href={entry.photoUrl} target="_blank" rel="noopener noreferrer"
                         className="inline-flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
                         style={{ color: '#22c55e' }}>
                        <Image size={13} />
                        View
                      </a>
                    ) : (
                      <span style={{ color: '#7d8590' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#7d8590' }}>
                    {entry.associatedVin ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
