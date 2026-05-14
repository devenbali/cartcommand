import React, { useState, useEffect } from 'react';
import {
  Users, Store, Save, Trash2, MapPin, Building2, ToggleLeft, ToggleRight,
  ExternalLink, Clock, CalendarDays, Plus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDealers } from '../hooks/useDealers';
import {
  addDealer, deactivateDealer,
  saveLocationSettings, subscribeToLocationSettings,
  saveCompanySettings, subscribeToCompanySettings,
  getWorkSchedule, saveWorkSchedule,
  subscribeToHolidays, addHoliday, deleteHoliday,
} from '../lib/firestore';
import type { LocationSettings, CompanySettings, WorkSchedule, Holiday } from '../types';
import { DEFAULT_WORK_SCHEDULE } from '../types';

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-6 mb-5" style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      {icon}
      <h2 className="font-semibold" style={{ color: '#e6edf3' }}>{title}</h2>
    </div>
  );
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: '#1c2333',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#e6edf3',
    ...extra,
  };
}

export default function Settings() {
  const { user } = useAuth();
  const { dealers } = useDealers();

  const [saveError, setSaveError] = useState('');

  // ─── Dealer list ─────────────────────────────────────────────────────────────
  const [newDealer, setNewDealer]       = useState('');
  const [addingDealer, setAddingDealer] = useState(false);
  const [dealerError, setDealerError]   = useState('');

  async function handleAddDealer() {
    const name = newDealer.trim();
    if (!name) return;
    if (dealers.some(d => d.name.toLowerCase() === name.toLowerCase())) {
      setDealerError('Dealer already exists.');
      return;
    }
    setDealerError('');
    setAddingDealer(true);
    try { await addDealer(name); setNewDealer(''); }
    finally { setAddingDealer(false); }
  }

  // ─── Company Settings ─────────────────────────────────────────────────────────
  const [companyName, setCompanyName]         = useState('');
  const [savingCompany, setSavingCompany]     = useState(false);
  const [companySaved, setCompanySaved]       = useState(false);

  useEffect(() => {
    const unsub = subscribeToCompanySettings((s: CompanySettings | null) => {
      if (s?.companyName) setCompanyName(s.companyName);
    });
    return unsub;
  }, []);

  async function handleSaveCompany() {
    if (!user || !companyName.trim()) return;
    setSavingCompany(true); setSaveError('');
    try {
      await saveCompanySettings(companyName.trim(), user.uid, user.name);
      setCompanySaved(true);
      setTimeout(() => setCompanySaved(false), 2000);
    } catch (e: unknown) {
      setSaveError((e as Error).message ?? 'Save failed.');
    } finally {
      setSavingCompany(false);
    }
  }

  // ─── Location Settings ────────────────────────────────────────────────────────
  const [locEnabled, setLocEnabled]   = useState(false);
  const [locLat, setLocLat]           = useState('');
  const [locLng, setLocLng]           = useState('');
  const [locRadius, setLocRadius]     = useState('100');
  const [locAddress, setLocAddress]   = useState('');
  const [savingLoc, setSavingLoc]     = useState(false);
  const [locSaved, setLocSaved]       = useState(false);
  const [geoLoading, setGeoLoading]   = useState(false);
  const [locToggleSaving, setLocToggleSaving] = useState(false);

  // ─── Work Schedule ────────────────────────────────────────────────────────────
  const [schedule, setSchedule]           = useState<WorkSchedule>({ ...DEFAULT_WORK_SCHEDULE });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSaved, setScheduleSaved]   = useState(false);

  useEffect(() => {
    getWorkSchedule().then(s => setSchedule(s));
  }, []);

  function toggleWorkDay(day: number) {
    setSchedule(prev => ({
      ...prev,
      workDays: prev.workDays.includes(day)
        ? prev.workDays.filter(d => d !== day)
        : [...prev.workDays, day].sort(),
    }));
  }

  async function handleSaveSchedule() {
    if (!user) return;
    setSavingSchedule(true); setSaveError('');
    try {
      await saveWorkSchedule(schedule, user.uid, user.name);
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 2000);
    } catch (e: unknown) {
      setSaveError((e as Error).message ?? 'Save failed.');
    } finally {
      setSavingSchedule(false);
    }
  }

  // ─── Holidays ─────────────────────────────────────────────────────────────────
  const [holidays, setHolidays]         = useState<Holiday[]>([]);
  const [newHolDate, setNewHolDate]     = useState('');
  const [newHolName, setNewHolName]     = useState('');
  const [addingHol, setAddingHol]       = useState(false);

  useEffect(() => {
    const unsub = subscribeToHolidays(setHolidays);
    return unsub;
  }, []);

  async function handleAddHoliday() {
    if (!user || !newHolDate || !newHolName.trim()) return;
    setAddingHol(true);
    try {
      await addHoliday(newHolDate, newHolName.trim(), user.uid);
      setNewHolDate(''); setNewHolName('');
    } finally {
      setAddingHol(false);
    }
  }

  // ─── Save All ─────────────────────────────────────────────────────────────────
  const [savingAll, setSavingAll]   = useState(false);
  const [allSaved, setAllSaved]     = useState(false);

  async function handleSaveAll() {
    if (!user) return;
    setSavingAll(true); setSaveError('');
    try {
      const promises: Promise<void>[] = [];
      if (companyName.trim()) promises.push(saveCompanySettings(companyName.trim(), user.uid, user.name));
      const lat = parseFloat(locLat); const lng = parseFloat(locLng); const radius = parseInt(locRadius, 10);
      if (!isNaN(lat) && !isNaN(lng) && !isNaN(radius) && radius >= 1) {
        promises.push(saveLocationSettings({ enabled: locEnabled, lat, lng, radiusMeters: radius, address: locAddress || undefined }));
      }
      await Promise.all(promises);
      setAllSaved(true);
      setTimeout(() => setAllSaved(false), 2500);
    } catch (e: unknown) {
      setSaveError((e as Error).message ?? 'Save failed.');
    } finally {
      setSavingAll(false);
    }
  }

  useEffect(() => {
    const unsub = subscribeToLocationSettings((s: LocationSettings | null) => {
      if (!s) return;
      setLocEnabled(s.enabled);
      setLocLat(String(s.lat ?? ''));
      setLocLng(String(s.lng ?? ''));
      setLocRadius(String(s.radiusMeters ?? 100));
      if (s.address) setLocAddress(s.address);
    });
    return unsub;
  }, []);

  function handleDetectLocation() {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocLat(pos.coords.latitude.toFixed(6));
        setLocLng(pos.coords.longitude.toFixed(6));
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { timeout: 10000 }
    );
  }

  async function handleSaveLoc() {
    const lat = parseFloat(locLat);
    const lng = parseFloat(locLng);
    const radius = parseInt(locRadius, 10);
    if (isNaN(lat) || isNaN(lng) || isNaN(radius) || radius < 1) return;
    setSavingLoc(true); setSaveError('');
    try {
      await saveLocationSettings({ enabled: locEnabled, lat, lng, radiusMeters: radius, address: locAddress || undefined });
      setLocSaved(true);
      setTimeout(() => setLocSaved(false), 2000);
    } catch (e: unknown) {
      setSaveError((e as Error).message ?? 'Save failed.');
    } finally {
      setSavingLoc(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
          Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: '#7d8590' }}>System configuration — manager only</p>
      </div>

      {saveError && (
        <div className="mb-5 px-4 py-3 rounded-xl text-sm flex items-start gap-2"
             style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
          <span className="font-medium">Save error:</span> {saveError}
          <button onClick={() => setSaveError('')} className="ml-auto shrink-0 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ─── Company ─────────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionHeader icon={<Building2 size={18} style={{ color: '#22c55e' }} />} title="Company Settings" />
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: '#7d8590' }}>
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="V-Carts"
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle()}
            />
          </div>
          <button
            onClick={handleSaveCompany}
            disabled={savingCompany || !companyName.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: companySaved ? '#16a34a' : '#22c55e', color: '#0d1117' }}
          >
            <Save size={14} />
            {companySaved ? 'Saved!' : savingCompany ? 'Saving…' : 'Save'}
          </button>
        </div>
      </SectionCard>

      {/* ─── Location ────────────────────────────────────────────────────────── */}
      <SectionCard>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <MapPin size={18} style={{ color: '#22c55e' }} />
            <h2 className="font-semibold" style={{ color: '#e6edf3' }}>Clock-In Geofence</h2>
          </div>
          <button
            disabled={locToggleSaving}
            onClick={async () => {
              const newEnabled = !locEnabled;
              const lat    = parseFloat(locLat);
              const lng    = parseFloat(locLng);
              const radius = parseInt(locRadius, 10);
              // Require valid coordinates before enabling
              if (newEnabled && (isNaN(lat) || isNaN(lng) || !locLat || !locLng)) {
                setSaveError('Enter latitude and longitude before enabling the geofence.');
                return;
              }
              setLocEnabled(newEnabled);
              if (!isNaN(lat) && !isNaN(lng) && !isNaN(radius) && radius >= 1) {
                setLocToggleSaving(true);
                try {
                  await saveLocationSettings({ enabled: newEnabled, lat, lng, radiusMeters: radius, address: locAddress || undefined });
                } catch (e: unknown) {
                  setLocEnabled(!newEnabled); // revert on error
                  setSaveError((e as Error).message ?? 'Save failed.');
                } finally {
                  setLocToggleSaving(false);
                }
              }
            }}
            className="flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ color: locEnabled ? '#22c55e' : '#7d8590' }}
          >
            {locToggleSaving
              ? <span className="text-xs" style={{ color: '#7d8590' }}>Saving…</span>
              : locEnabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} />
            }
            {!locToggleSaving && (locEnabled ? 'Enabled' : 'Disabled')}
          </button>
        </div>

        <p className="text-xs mb-4" style={{ color: '#7d8590' }}>
          When enabled, employees must be within the set radius of the work site to clock in or out.
          <strong style={{ color: locEnabled ? '#22c55e' : '#f85149' }}>
            {locEnabled ? ' Geofence is active.' : ' Geofence is OFF — all employees can clock in from anywhere.'}
          </strong>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: '#7d8590' }}>
              Latitude
            </label>
            <input
              type="number" step="any"
              value={locLat} onChange={e => setLocLat(e.target.value)}
              placeholder="e.g. 36.1699"
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle()}
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: '#7d8590' }}>
              Longitude
            </label>
            <input
              type="number" step="any"
              value={locLng} onChange={e => setLocLng(e.target.value)}
              placeholder="e.g. -115.1398"
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle()}
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: '#7d8590' }}>
              Allowed Radius (meters)
            </label>
            <div className="flex gap-2">
              <input
                type="number" min={10}
                value={locRadius} onChange={e => setLocRadius(e.target.value)}
                placeholder="100"
                className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle()}
              />
              <button
                onClick={handleSaveLoc}
                disabled={savingLoc || !locLat || !locLng}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                style={{ background: locSaved ? '#16a34a' : '#22c55e', color: '#0d1117' }}
              >
                <Save size={13} />
                {locSaved ? 'Saved!' : savingLoc ? '…' : 'Save'}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: '#7d8590' }}>
              Address / Label (optional)
            </label>
            <input
              type="text"
              value={locAddress} onChange={e => setLocAddress(e.target.value)}
              placeholder="e.g. Main Warehouse"
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle()}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleDetectLocation}
            disabled={geoLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
          >
            <MapPin size={14} />
            {geoLoading ? 'Detecting…' : 'Use My Location'}
          </button>
          <button
            onClick={handleSaveLoc}
            disabled={savingLoc || !locLat || !locLng}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: locSaved ? '#16a34a' : '#22c55e', color: '#0d1117' }}
          >
            <Save size={14} />
            {locSaved ? 'Saved!' : savingLoc ? 'Saving…' : 'Save Location'}
          </button>
        </div>
      </SectionCard>

      {/* ─── Work Schedule ───────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionHeader icon={<Clock size={18} style={{ color: '#22c55e' }} />} title="Work Schedule" />
        <p className="text-xs mb-4" style={{ color: '#7d8590' }}>
          Used by the Time Auditor to detect early clock-ins, suspicious overtime, lunch breaks, and non-workday absences.
        </p>

        {/* Day row */}
        <div className="mb-4">
          <label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: '#7d8590' }}>
            Work Days
          </label>
          <div className="flex gap-2 flex-wrap">
            {(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const).map((label, i) => {
              const active = schedule.workDays.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => toggleWorkDay(i)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: active ? 'rgba(34,197,94,0.15)' : '#1c2333',
                    border: `1px solid ${active ? '#22c55e' : 'rgba(255,255,255,0.08)'}`,
                    color: active ? '#22c55e' : '#7d8590',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hour grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          {([
            { label: 'Shift Start (hour)', key: 'shiftStartHour', min: 0, max: 23 },
            { label: 'Shift End (hour)',   key: 'shiftEndHour',   min: 0, max: 23 },
            { label: 'Lunch Window Start', key: 'lunchStartHour', min: 0, max: 23 },
            { label: 'Lunch Window End',   key: 'lunchEndHour',   min: 0, max: 23 },
            { label: 'Early Tolerance (min)', key: 'earlyToleranceMinutes', min: 0, max: 60 },
            { label: 'OT Cutoff (hour)',   key: 'overtimeCutoffHour', min: 0, max: 23 },
          ] as { label: string; key: keyof WorkSchedule; min: number; max: number }[]).map(({ label, key, min, max }) => (
            <div key={key as string}>
              <label className="text-xs font-medium uppercase tracking-wider block mb-1.5" style={{ color: '#7d8590' }}>
                {label}
              </label>
              <input
                type="number" min={min} max={max}
                value={schedule[key] as number}
                onChange={e => setSchedule(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle()}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSaveSchedule}
            disabled={savingSchedule}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: scheduleSaved ? '#16a34a' : '#22c55e', color: '#0d1117' }}
          >
            <Save size={14} />
            {scheduleSaved ? 'Saved!' : savingSchedule ? 'Saving…' : 'Save Schedule'}
          </button>
        </div>
      </SectionCard>

      {/* ─── Holidays ────────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionHeader icon={<CalendarDays size={18} style={{ color: '#22c55e' }} />} title="Holidays" />
        <p className="text-xs mb-4" style={{ color: '#7d8590' }}>
          Holidays are skipped when checking for absent workers, unless someone clocked in that day.
        </p>

        {/* Existing holidays */}
        <div className="flex flex-col gap-2 mb-4">
          {holidays.length === 0 && (
            <p className="text-sm" style={{ color: '#7d8590' }}>No holidays added yet.</p>
          )}
          {holidays.map(h => (
            <div key={h.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                 style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <span className="text-sm font-medium" style={{ color: '#e6edf3' }}>{h.name}</span>
                <span className="text-xs ml-2" style={{ color: '#7d8590' }}>{h.date}</span>
              </div>
              <button onClick={() => deleteHoliday(h.id)} className="p-1 rounded hover:opacity-80 transition-opacity" title="Remove">
                <Trash2 size={14} style={{ color: '#f85149' }} />
              </button>
            </div>
          ))}
        </div>

        {/* Add holiday */}
        <div className="flex gap-2 flex-wrap">
          <input
            type="date"
            value={newHolDate}
            onChange={e => setNewHolDate(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle({ colorScheme: 'dark' })}
          />
          <input
            type="text"
            placeholder="Holiday name…"
            value={newHolName}
            onChange={e => setNewHolName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddHoliday()}
            className="flex-1 min-w-32 px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle()}
          />
          <button
            onClick={handleAddHoliday}
            disabled={addingHol || !newHolDate || !newHolName.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: '#22c55e', color: '#0d1117' }}
          >
            <Plus size={14} />
            {addingHol ? 'Adding…' : 'Add'}
          </button>
        </div>
      </SectionCard>

      {/* ─── Dealer list ─────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionHeader icon={<Store size={18} style={{ color: '#22c55e' }} />} title="Dealer List" />
        <div className="flex flex-col gap-2 mb-4">
          {dealers.length === 0 && (
            <p className="text-sm" style={{ color: '#7d8590' }}>No dealers yet.</p>
          )}
          {dealers.map(d => (
            <div key={d.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                 style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-sm" style={{ color: '#e6edf3' }}>{d.name}</span>
              <button onClick={() => deactivateDealer(d.id)} className="p-1 rounded hover:opacity-80 transition-opacity" title="Remove dealer">
                <Trash2 size={14} style={{ color: '#f85149' }} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <input
              type="text" placeholder="Add new dealer…"
              value={newDealer}
              onChange={e => { setNewDealer(e.target.value); setDealerError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAddDealer()}
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle()}
            />
            <button
              onClick={handleAddDealer}
              disabled={addingDealer || !newDealer.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: '#22c55e', color: '#0d1117' }}
            >
              {addingDealer ? 'Adding…' : 'Add'}
            </button>
          </div>
          {dealerError && <p className="text-xs" style={{ color: '#f85149' }}>{dealerError}</p>}
        </div>
      </SectionCard>

      {/* ─── Save All ────────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 pb-4 pt-3" style={{ background: 'linear-gradient(to top, #0d1117 70%, transparent)' }}>
        <button
          onClick={handleSaveAll}
          disabled={savingAll}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: allSaved ? '#16a34a' : '#22c55e', color: '#0d1117', boxShadow: '0 4px 20px rgba(34,197,94,0.25)' }}
        >
          <Save size={16} />
          {allSaved ? 'All Changes Saved!' : savingAll ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>

      {/* ─── Quick Links ─────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionHeader icon={<ExternalLink size={18} style={{ color: '#22c55e' }} />} title="Quick Links" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Employee Management', desc: 'Roles, timesheets, clock records', href: '/employees' },
            { label: 'Payroll Report', desc: 'Monthly production & pay calculation', href: '/payroll' },
            { label: 'Scrap Log', desc: 'Log and review scrapped parts', href: '/scrap' },
            { label: 'Reports', desc: 'Production and inventory reports', href: '/reports' },
            { label: 'Master Stock List', desc: 'Inventory levels and adjustments', href: '/inventory' },
          ].map(link => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-start gap-3 px-4 py-3 rounded-lg transition-opacity hover:opacity-80"
              style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none' }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: '#e6edf3' }}>{link.label}</p>
                <p className="text-xs mt-0.5" style={{ color: '#7d8590' }}>{link.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
