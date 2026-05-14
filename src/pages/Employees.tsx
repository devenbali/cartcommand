import React, { useState, useMemo, useEffect } from 'react';
import {
  Users, Clock, ChevronLeft, ChevronRight, Pencil, Trash2,
  Plus, Check, X, AlertTriangle, Loader2, UserCheck, UserX, LogOut,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { useTimeRecords } from '../hooks/useTimeRecords';
import {
  updateUserName, updateUserRole, setUserActive, setUserCanQC, setUserBonusEligible, setUserManagerBonus, setUserBasePayOnly,
  addManualTimeEntry, adjustTimeRecord, deleteTimeRecord, deleteAppUser,
  clockOutAll, forceClockOutUser,
} from '../lib/firestore';
import type { AppUser, UserRole, TimeRecord } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<UserRole, { bg: string; color: string }> = {
  worker:         { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
  administration: { bg: 'rgba(168,85,247,0.12)',  color: '#a855f7' },
  manager:        { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
  owner:          { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24' },
};

function fmtTime(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(s: string): string {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtDuration(mins: number | null): string {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function toDatetimeLocal(d: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function weekBounds(offset = 0): { start: Date; end: Date; label: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const start = new Date(now);
  start.setDate(now.getDate() - (day + 6) % 7 + offset * 7); // Monday start
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const dateRange = `${fmt(start)} – ${fmt(end)}`;
  const label = offset === 0 ? `This Week  (${dateRange})` : offset === -1 ? `Last Week  (${dateRange})` : dateRange;
  return { start, end, label };
}

function toTimeStr(d: Date | null | undefined): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeStrToDate(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

// ─── Name editor ─────────────────────────────────────────────────────────────

function NameEditor({ user, onOpenTimesheet }: { user: AppUser; onOpenTimesheet?: (uid: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(user.name);
  const [saving,  setSaving]  = useState(false);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === user.name) { setEditing(false); setValue(user.name); return; }
    setSaving(true);
    try { await updateUserName(user.uid, trimmed); }
    finally { setSaving(false); setEditing(false); }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setValue(user.name); } }}
        className="font-medium text-sm rounded px-1 outline-none"
        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.4)', color: '#e6edf3', minWidth: '120px' }}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5 group/name">
      <button
        onClick={() => onOpenTimesheet?.(user.uid)}
        className="font-medium text-sm text-left hover:underline"
        style={{ color: '#e6edf3' }}
      >
        {saving ? <Loader2 size={13} className="animate-spin" style={{ color: '#22c55e' }} /> : user.name}
      </button>
      <button
        onClick={() => { setValue(user.name); setEditing(true); }}
        title="Edit name"
        className="opacity-0 group-hover/name:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded"
        style={{ color: '#7d8590' }}
      >
        <Pencil size={11} />
      </button>
    </div>
  );
}

// ─── Role picker ──────────────────────────────────────────────────────────────

function RolePicker({ user, disabled }: { user: AppUser; disabled?: boolean }) {
  const [saving, setSaving] = useState(false);

  async function change(role: UserRole) {
    if (role === user.role) return;
    setSaving(true);
    try { await updateUserRole(user.uid, role); }
    finally { setSaving(false); }
  }

  const roles: UserRole[] = ['worker', 'administration', 'manager', 'owner'];
  const c = ROLE_COLORS[user.role];

  if (disabled) {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ background: c.bg, color: c.color }}>
        {user.role === 'administration' ? 'Staff' : user.role === 'manager' ? 'Manager' : user.role === 'owner' ? 'Admin' : 'Worker'}
      </span>
    );
  }

  return (
    <div className="relative inline-block">
      {saving
        ? <Loader2 size={14} className="animate-spin" style={{ color: '#22c55e' }} />
        : (
          <select
            value={user.role}
            onChange={e => change(e.target.value as UserRole)}
            className="px-2.5 py-1 rounded-full text-xs font-medium capitalize appearance-none cursor-pointer outline-none pr-6"
            style={{ background: c.bg, color: c.color, border: 'none' }}
          >
            {roles.map(r => (
              <option key={r} value={r}
                      style={{ background: '#1c2333', color: '#e6edf3' }}>
                {r === 'administration' ? 'Staff' : r === 'manager' ? 'Manager' : r === 'owner' ? 'Admin' : 'Worker'}
              </option>
            ))}
          </select>
        )
      }
    </div>
  );
}

// ─── Active toggle ────────────────────────────────────────────────────────────

function ActiveToggle({ user }: { user: AppUser }) {
  const [saving, setSaving] = useState(false);
  const { user: me } = useAuth();

  async function toggle() {
    if (user.uid === me?.uid) return; // can't deactivate yourself
    setSaving(true);
    try { await setUserActive(user.uid, !user.active); }
    finally { setSaving(false); }
  }

  const isSelf = user.uid === me?.uid;

  return (
    <button
      onClick={toggle}
      disabled={saving || isSelf}
      title={isSelf ? "Can't deactivate yourself" : user.active ? 'Deactivate' : 'Activate'}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity disabled:opacity-40"
      style={user.active
        ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
        : { background: 'rgba(248,81,73,0.12)', color: '#f85149' }}
    >
      {saving
        ? <Loader2 size={11} className="animate-spin" />
        : user.active ? <UserCheck size={11} /> : <UserX size={11} />
      }
      {user.active ? 'Active' : 'Inactive'}
    </button>
  );
}

// ─── QC toggle ───────────────────────────────────────────────────────────────

function QCToggle({ user }: { user: AppUser }) {
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try { await setUserCanQC(user.uid, !user.canQC); }
    finally { setSaving(false); }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={user.canQC ? 'Remove QC permission' : 'Grant QC permission'}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity disabled:opacity-40"
      style={user.canQC
        ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
        : { background: 'rgba(125,133,144,0.12)', color: '#7d8590' }}
    >
      {saving ? <Loader2 size={11} className="animate-spin" /> : null}
      {user.canQC ? 'QC ✓' : 'QC —'}
    </button>
  );
}

// ─── Bonus Eligible toggle ────────────────────────────────────────────────────

function BonusToggle({ user }: { user: AppUser }) {
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try { await setUserBonusEligible(user.uid, !user.bonusEligible); }
    finally { setSaving(false); }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={user.bonusEligible ? 'Remove bonus eligibility' : 'Grant bonus eligibility'}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity disabled:opacity-40"
      style={user.bonusEligible
        ? { background: 'rgba(210,153,34,0.12)', color: '#d29922' }
        : { background: 'rgba(125,133,144,0.12)', color: '#7d8590' }}
    >
      {saving ? <Loader2 size={11} className="animate-spin" /> : null}
      {user.bonusEligible ? 'Bonus ✓' : 'Bonus —'}
    </button>
  );
}

// ─── Manager Bonus toggle ─────────────────────────────────────────────────────

function ManagerBonusToggle({ user }: { user: AppUser }) {
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try { await setUserManagerBonus(user.uid, !user.managerBonus); }
    finally { setSaving(false); }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={user.managerBonus ? 'Remove manager bonus (+$100)' : 'Grant manager bonus (+$100)'}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity disabled:opacity-40"
      style={user.managerBonus
        ? { background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }
        : { background: 'rgba(125,133,144,0.12)', color: '#7d8590' }}
    >
      {saving ? <Loader2 size={11} className="animate-spin" /> : null}
      {user.managerBonus ? '+$100 ✓' : '+$100 —'}
    </button>
  );
}

// ─── Base Pay Only toggle ─────────────────────────────────────────────────────

function BasePayToggle({ user }: { user: AppUser }) {
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try { await setUserBasePayOnly(user.uid, !user.basePayOnly); }
    finally { setSaving(false); }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={user.basePayOnly ? 'Remove base-pay-only (new hire mode)' : 'Set to base pay only (new hire — no bonus)'}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity disabled:opacity-40"
      style={user.basePayOnly
        ? { background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }
        : { background: 'rgba(125,133,144,0.12)', color: '#7d8590' }}
    >
      {saving ? <Loader2 size={11} className="animate-spin" /> : null}
      {user.basePayOnly ? 'Base Only ✓' : 'Base Only —'}
    </button>
  );
}

// ─── Delete user button ───────────────────────────────────────────────────────

function DeleteUserButton({ user }: { user: AppUser }) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try { await deleteAppUser(user.uid); }
    finally { setDeleting(false); }
  }

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        title="Delete user"
        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-opacity hover:opacity-80"
        style={{ background: 'rgba(248,81,73,0.08)', color: '#f85149' }}
      >
        <Trash2 size={10} /> Delete
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs" style={{ color: '#f85149' }}>Sure?</span>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="px-2 py-0.5 rounded text-xs font-semibold disabled:opacity-40"
        style={{ background: 'rgba(248,81,73,0.15)', color: '#f85149' }}
      >
        {deleting ? '…' : 'Yes'}
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="px-2 py-0.5 rounded text-xs"
        style={{ color: '#7d8590' }}
      >
        No
      </button>
    </div>
  );
}

// ─── Time entry modal ─────────────────────────────────────────────────────────

interface TimeModalProps {
  record?: TimeRecord;
  users: AppUser[];
  onClose: () => void;
}

function TimeModal({ record, users, onClose }: TimeModalProps) {
  const { user } = useAuth();
  const [userId,    setUserId]    = useState(record?.userId ?? '');
  const [clockInV,  setClockInV]  = useState(toDatetimeLocal(record?.clockIn ?? null));
  const [clockOutV, setClockOutV] = useState(toDatetimeLocal(record?.clockOut ?? null));
  const [notes,     setNotes]     = useState(record?.adjustNotes ?? '');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const isEdit = !!record;

  async function save() {
    if (!user) return;
    if (!userId) { setError('Select an employee.'); return; }
    if (!clockInV) { setError('Clock In time is required.'); return; }
    const clockIn  = new Date(clockInV);
    const clockOut = clockOutV ? new Date(clockOutV) : null;
    if (clockOut && clockOut <= clockIn) { setError('Clock Out must be after Clock In.'); return; }
    if (!notes.trim() && isEdit) { setError('Notes are required for adjustments.'); return; }

    setSaving(true); setError('');
    try {
      if (isEdit) {
        await adjustTimeRecord(record!.id, clockIn, clockOut, notes, user.uid, user.name);
      } else {
        if (!clockOut) { setError('Clock Out time is required for manual entries.'); setSaving(false); return; }
        const emp = users.find(u => u.uid === userId)!;
        await addManualTimeEntry({ userId, userName: emp.name, clockIn, clockOut, addedBy: user.uid, addedByName: user.name, notes });
      }
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Save failed.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl"
           style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between px-5 py-4"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-semibold" style={{ color: '#e6edf3' }}>
            {isEdit ? 'Adjust Time Entry' : 'Add Manual Entry'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: '#7d8590' }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          {/* Employee */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>Employee</label>
            {isEdit
              ? <p className="text-sm font-medium" style={{ color: '#e6edf3' }}>{record!.userName}</p>
              : (
                <select
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
                >
                  <option value="">Select employee…</option>
                  {users.filter(u => u.active && u.role !== 'administration').map(u => (
                    <option key={u.uid} value={u.uid}>{u.name} ({u.role})</option>
                  ))}
                </select>
              )
            }
          </div>

          {/* Clock In */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>Clock In</label>
            <input
              type="datetime-local"
              value={clockInV}
              onChange={e => setClockInV(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3', colorScheme: 'dark' }}
            />
          </div>

          {/* Clock Out */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>
              Clock Out {isEdit && <span style={{ color: '#7d8590' }}>(leave blank if still clocked in)</span>}
            </label>
            <input
              type="datetime-local"
              value={clockOutV}
              onChange={e => setClockOutV(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3', colorScheme: 'dark' }}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#7d8590' }}>
              Notes {isEdit && <span style={{ color: '#f85149' }}>*</span>}
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isEdit ? 'Reason for adjustment…' : 'Optional notes…'}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.08)', color: '#e6edf3' }}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                 style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
              <AlertTriangle size={12} /> {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#7d8590' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Day Row (inside TimesheetDrawer) ────────────────────────────────────────

interface DayRowProps {
  dayLabel: string;
  dateStr: string;
  dateDisplay: string;
  records: TimeRecord[]; // up to 2: [morning shift, lunch-return shift]
  emp: AppUser;
  me: AppUser;
}

function DayRow({ dayLabel, dateStr, dateDisplay, records, emp, me }: DayRowProps) {
  const r1 = records[0] ?? null;
  const r2 = records[1] ?? null;

  const [ci1, setCi1] = useState(() => toTimeStr(r1?.clockIn));
  const [co1, setCo1] = useState(() => toTimeStr(r1?.clockOut));
  const [ci2, setCi2] = useState(() => toTimeStr(r2?.clockIn));
  const [co2, setCo2] = useState(() => toTimeStr(r2?.clockOut));
  const [dirty,  setDirty]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Re-sync when Firestore records update
  useEffect(() => {
    setCi1(toTimeStr(r1?.clockIn));
    setCo1(toTimeStr(r1?.clockOut));
    setCi2(toTimeStr(r2?.clockIn));
    setCo2(toTimeStr(r2?.clockOut));
    setDirty(false);
    setError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r1?.id, r1?.clockIn?.toISOString(), r1?.clockOut?.toISOString(),
      r2?.id, r2?.clockIn?.toISOString(), r2?.clockOut?.toISOString()]);

  function change(setter: (v: string) => void, val: string) {
    setter(val);
    setDirty(true);
    setError('');
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      // ── Shift 1 ──
      if (ci1) {
        const clockIn  = timeStrToDate(dateStr, ci1);
        const clockOut = co1 ? timeStrToDate(dateStr, co1) : null;
        if (clockOut && clockOut <= clockIn) { setError('Shift 1: out must be after in'); return; }
        if (r1) {
          await adjustTimeRecord(r1.id, clockIn, clockOut, 'Edited via timesheet view', me.uid, me.name);
        } else if (clockOut) {
          await addManualTimeEntry({ userId: emp.uid, userName: emp.name, clockIn, clockOut, addedBy: me.uid, addedByName: me.name, notes: 'Added via timesheet view' });
        }
      }
      // ── Shift 2 (lunch return) ──
      if (ci2) {
        const clockIn  = timeStrToDate(dateStr, ci2);
        const clockOut = co2 ? timeStrToDate(dateStr, co2) : null;
        if (clockOut && clockOut <= clockIn) { setError('Shift 2: out must be after in'); return; }
        if (r2) {
          await adjustTimeRecord(r2.id, clockIn, clockOut, 'Edited via timesheet view', me.uid, me.name);
        } else if (clockOut) {
          await addManualTimeEntry({ userId: emp.uid, userName: emp.name, clockIn, clockOut, addedBy: me.uid, addedByName: me.name, notes: 'Lunch return – added via timesheet view' });
        }
      }
      setDirty(false);
    } catch {
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  }

  const totalMins = (r1?.durationMinutes ?? 0) + (r2?.durationMinutes ?? 0);
  const r1Active  = r1 && !r1.clockOut;
  const r2Active  = r2 && !r2.clockOut;

  const inp = (d: boolean) => ({
    background: '#0d1117',
    border: `1px solid ${d ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)'}`,
    color: '#e6edf3',
    colorScheme: 'dark' as const,
  });

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Day / Date */}
      <td className="px-4 py-3 text-sm font-medium whitespace-nowrap" style={{ color: '#e6edf3' }}>{dayLabel}</td>
      <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: '#7d8590' }}>{dateDisplay}</td>

      {/* ── Shift 1 ── */}
      <td className="px-2 py-3">
        <input type="time" value={ci1} onChange={e => change(setCi1, e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
          style={inp(dirty)} />
      </td>
      <td className="px-2 py-3">
        {r1Active && !dirty
          ? <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#22c55e' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: '#22c55e' }} />In
            </span>
          : <input type="time" value={co1} onChange={e => change(setCo1, e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
              style={inp(dirty)} />
        }
      </td>

      {/* ── Shift 2 (lunch return) ── */}
      <td className="px-2 py-3" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
        <input type="time" value={ci2} onChange={e => change(setCi2, e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
          style={inp(dirty)} />
      </td>
      <td className="px-2 py-3">
        {r2Active && !dirty
          ? <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#22c55e' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: '#22c55e' }} />In
            </span>
          : <input type="time" value={co2} onChange={e => change(setCo2, e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg text-xs outline-none"
              style={inp(dirty)} />
        }
      </td>

      {/* Total */}
      <td className="px-4 py-3 text-xs font-mono font-semibold whitespace-nowrap"
          style={{ color: totalMins > 0 ? '#e6edf3' : '#3d4451', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
        {totalMins > 0 ? fmtDuration(totalMins) : '—'}
      </td>

      {/* Save / Error */}
      <td className="px-3 py-3 w-16">
        {error
          ? <span className="text-xs leading-tight" style={{ color: '#f85149' }}>{error}</span>
          : dirty && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Save
            </button>
          )
        }
      </td>
    </tr>
  );
}

// ─── Timesheet Drawer ─────────────────────────────────────────────────────────

interface TimesheetDrawerProps {
  users: AppUser[];
  initialUserId: string;
  onClose: () => void;
}

function TimesheetDrawer({ users, initialUserId, onClose }: TimesheetDrawerProps) {
  const { user: me } = useAuth();
  const [userIdx,     setUserIdx]     = useState(() => Math.max(0, users.findIndex(u => u.uid === initialUserId)));
  const [weekOffset,  setWeekOffset]  = useState(0);

  const emp = users[userIdx];
  const { start, end, label } = weekBounds(weekOffset);
  const { records, loading }  = useTimeRecords(start, end);

  const empRecords = records.filter(r => r.userId === emp.uid);

  // Build Mon–Sun grid — up to 2 records per day (morning + lunch return), sorted by clockIn
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr     = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayRecords  = empRecords
      .filter(r => r.date === dateStr)
      .sort((a, b) => (a.clockIn?.getTime() ?? 0) - (b.clockIn?.getTime() ?? 0))
      .slice(0, 2);
    const dayLabel    = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dateDisplay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { dayLabel, dateStr, dateDisplay, records: dayRecords };
  });

  const totalMins = empRecords.reduce((s, r) => s + (r.durationMinutes ?? 0), 0);
  const rc = ROLE_COLORS[emp.role];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full flex flex-col rounded-2xl shadow-2xl"
        style={{ maxWidth: 920, maxHeight: '92vh', background: '#161b27', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* ── Employee nav ── */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setUserIdx(i => Math.max(0, i - 1))}
            disabled={userIdx === 0}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-25"
            style={{ color: '#7d8590' }}
            title="Previous employee"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                 style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
              {emp.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-base truncate" style={{ color: '#e6edf3' }}>{emp.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                      style={{ background: rc.bg, color: rc.color }}>{emp.role}</span>
                <span className="text-xs" style={{ color: emp.active ? '#22c55e' : '#f85149' }}>
                  {emp.active ? '● Active' : '○ Inactive'}
                </span>
                <span className="text-xs" style={{ color: '#3d4451' }}>{userIdx + 1} / {users.length}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setUserIdx(i => Math.min(users.length - 1, i + 1))}
            disabled={userIdx === users.length - 1}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-25"
            style={{ color: '#7d8590' }}
            title="Next employee"
          >
            <ChevronRight size={18} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 ml-1" style={{ color: '#7d8590' }}>
            <X size={18} />
          </button>
        </div>

        {/* ── Week nav ── */}
        <div className="flex items-center justify-between px-5 py-2.5"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
            style={{ color: '#7d8590' }}
          >
            <ChevronLeft size={13} /> Prev
          </button>
          <span className="text-sm font-medium" style={{ color: '#e6edf3' }}>{label}</span>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
            style={{ color: '#7d8590' }}
          >
            Next <ChevronRight size={13} />
          </button>
        </div>

        {/* ── Daily grid ── */}
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={20} className="animate-spin" style={{ color: '#7d8590' }} />
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ background: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: '#7d8590' }}>Day</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: '#7d8590' }}>Date</th>
                  <th colSpan={2} className="px-2 py-2.5 text-center text-xs font-medium uppercase tracking-wider"
                      style={{ color: '#60a5fa', background: 'rgba(96,165,250,0.04)' }}>Morning</th>
                  <th colSpan={2} className="px-2 py-2.5 text-center text-xs font-medium uppercase tracking-wider"
                      style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.04)', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>Afternoon</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: '#7d8590', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>Total</th>
                  <th className="px-3 py-2.5" />
                </tr>
                <tr style={{ background: '#0a0f1a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th /><th />
                  <th className="px-2 pb-2 text-center text-xs" style={{ color: '#3d4451' }}>In</th>
                  <th className="px-2 pb-2 text-center text-xs" style={{ color: '#3d4451' }}>Out</th>
                  <th className="px-2 pb-2 text-center text-xs" style={{ color: '#3d4451', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>In</th>
                  <th className="px-2 pb-2 text-center text-xs" style={{ color: '#3d4451' }}>Out</th>
                  <th style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }} /><th />
                </tr>
              </thead>
              <tbody>
                {days.map(({ dayLabel, dateStr, dateDisplay, records }) => (
                  <DayRow
                    key={`${emp.uid}-${dateStr}`}
                    dayLabel={dayLabel}
                    dateStr={dateStr}
                    dateDisplay={dateDisplay}
                    records={records}
                    emp={emp}
                    me={me!}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Weekly total footer ── */}
        <div className="flex items-center justify-between px-5 py-3"
             style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: '#0d1117', borderRadius: '0 0 1rem 1rem' }}>
          <span className="text-sm font-medium" style={{ color: '#7d8590' }}>Total Weekly Hours</span>
          <span className="text-base font-bold font-mono" style={{ color: totalMins > 0 ? '#e6edf3' : '#3d4451' }}>
            {totalMins > 0 ? fmtDuration(totalMins) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Employees tab ────────────────────────────────────────────────────────────

function useEmployeeTimeStats() {
  // Today
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
  const { records: todayRecords } = useTimeRecords(todayStart, todayEnd);

  // This week
  const { start: thisWeekStart, end: thisWeekEnd } = weekBounds(0);
  const { records: thisWeekRecords } = useTimeRecords(thisWeekStart, thisWeekEnd);

  // Last week
  const { start: lastWeekStart, end: lastWeekEnd } = weekBounds(-1);
  const { records: lastWeekRecords } = useTimeRecords(lastWeekStart, lastWeekEnd);

  // Build per-user maps
  const todayMap    = new Map<string, { clockIn: Date | null; clockOut: Date | null; mins: number; openRecordId: string | null }>();
  const thisWeekMap = new Map<string, number>();
  const lastWeekMap = new Map<string, number>();

  todayRecords.forEach(r => {
    const existing = todayMap.get(r.userId);
    const mins = (existing?.mins ?? 0) + (r.durationMinutes ?? 0);
    // Most recent clock-in for today
    if (!existing || (r.clockIn && r.clockIn > (existing.clockIn ?? new Date(0)))) {
      todayMap.set(r.userId, {
        clockIn: r.clockIn,
        clockOut: r.clockOut,
        mins,
        openRecordId: r.clockOut === null ? r.id : null,
      });
    } else {
      todayMap.set(r.userId, { ...existing, mins });
    }
  });

  thisWeekRecords.forEach(r => {
    thisWeekMap.set(r.userId, (thisWeekMap.get(r.userId) ?? 0) + (r.durationMinutes ?? 0));
  });

  lastWeekRecords.forEach(r => {
    lastWeekMap.set(r.userId, (lastWeekMap.get(r.userId) ?? 0) + (r.durationMinutes ?? 0));
  });

  return { todayMap, thisWeekMap, lastWeekMap };
}

function EmployeesTab({ users, onOpenTimesheet }: { users: AppUser[]; onOpenTimesheet: (uid: string) => void }) {
  const { todayMap, thisWeekMap, lastWeekMap } = useEmployeeTimeStats();
  const [clockingOut,   setClockingOut]   = useState<string | null>(null); // userId being clocked out
  const [clockOutAllBusy, setClockOutAllBusy] = useState(false);
  const [confirmAll,    setConfirmAll]    = useState(false);

  const clockedInCount = [...todayMap.values()].filter(v => v.clockOut === null && v.clockIn !== null).length;

  async function handleForceClockOut(userId: string) {
    setClockingOut(userId);
    try { await forceClockOutUser(userId); }
    finally { setClockingOut(null); }
  }

  async function handleClockOutAll() {
    setClockOutAllBusy(true);
    setConfirmAll(false);
    try { await clockOutAll(); }
    finally { setClockOutAllBusy(false); }
  }

  return (
    <div>
      {/* Clock Out All banner */}
      {clockedInCount > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
             style={{ background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.2)' }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#f85149' }} />
            <span className="text-sm font-medium" style={{ color: '#e6edf3' }}>
              {clockedInCount} employee{clockedInCount !== 1 ? 's' : ''} still clocked in
            </span>
          </div>
          {confirmAll ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs" style={{ color: '#7d8590' }}>Clock everyone out?</span>
              <button
                onClick={handleClockOutAll}
                disabled={clockOutAllBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
                style={{ background: 'rgba(248,81,73,0.2)', color: '#f85149', border: '1px solid rgba(248,81,73,0.35)' }}
              >
                {clockOutAllBusy ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                Confirm
              </button>
              <button onClick={() => setConfirmAll(false)} className="text-xs px-2 py-1.5 rounded-lg" style={{ color: '#7d8590' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmAll(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0"
              style={{ background: 'rgba(248,81,73,0.15)', color: '#f85149', border: '1px solid rgba(248,81,73,0.3)' }}
            >
              <LogOut size={12} />
              Clock Out All
            </button>
          )}
        </div>
      )}

      <div className="text-xs mb-4 px-1 flex items-start gap-2 p-3 rounded-lg"
           style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', color: '#7d8590' }}>
        <span>New employees can request access from the login screen. They'll appear here as <strong style={{ color: '#e6edf3' }}>Inactive</strong> — click their status to activate them and set their role.</span>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Employee', 'Email', 'Role', 'Status', 'Today', 'This Week', 'Last Week'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                    style={{ color: '#7d8590' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const today    = todayMap.get(u.uid);
              const thisWeek = thisWeekMap.get(u.uid) ?? 0;
              const lastWeek = lastWeekMap.get(u.uid) ?? 0;
              const isClockedInNow = today?.clockOut === null && today?.clockIn != null;
              return (
                <tr key={u.uid} style={{ background: i % 2 === 0 ? '#0d1117' : 'rgba(28,35,51,0.4)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onOpenTimesheet(u.uid)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 hover:opacity-80 transition-opacity"
                        style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}
                        title="View timesheet"
                      >
                        {u.name.charAt(0).toUpperCase()}
                      </button>
                      <NameEditor user={u} onOpenTimesheet={onOpenTimesheet} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#7d8590' }}>{u.email}</td>
                  <td className="px-4 py-3"><RolePicker user={u} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <ActiveToggle user={u} />
                      <QCToggle user={u} />
                      <BonusToggle user={u} />
                      <BasePayToggle user={u} />
                      <ManagerBonusToggle user={u} />
                      {!u.active && <DeleteUserButton user={u} />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {today ? (
                      <div className="flex flex-col gap-1">
                        {isClockedInNow ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#22c55e' }}>
                              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22c55e' }} />
                              {fmtTime(today.clockIn)}
                            </span>
                            <button
                              onClick={() => handleForceClockOut(u.uid)}
                              disabled={clockingOut === u.uid}
                              title="Clock out this employee"
                              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-all disabled:opacity-40"
                              style={{ background: 'rgba(248,81,73,0.12)', color: '#f85149', border: '1px solid rgba(248,81,73,0.25)' }}
                            >
                              {clockingOut === u.uid ? <Loader2 size={10} className="animate-spin" /> : <LogOut size={10} />}
                              Out
                            </button>
                          </div>
                        ) : today.clockIn ? (
                          <span className="text-xs font-mono" style={{ color: '#e6edf3' }}>
                            {fmtTime(today.clockIn)} – {fmtTime(today.clockOut)}
                          </span>
                        ) : null}
                        {today.mins > 0 && (
                          <span className="text-xs" style={{ color: '#7d8590' }}>{fmtDuration(today.mins)}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs" style={{ color: '#3d4451' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono font-semibold" style={{ color: thisWeek > 0 ? '#e6edf3' : '#3d4451' }}>
                      {thisWeek > 0 ? fmtDuration(thisWeek) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono" style={{ color: lastWeek > 0 ? '#7d8590' : '#3d4451' }}>
                      {lastWeek > 0 ? fmtDuration(lastWeek) : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {users.map(u => {
          const today    = todayMap.get(u.uid);
          const thisWeek = thisWeekMap.get(u.uid) ?? 0;
          const lastWeek = lastWeekMap.get(u.uid) ?? 0;
          const isClockedInNow = today?.clockOut === null && today?.clockIn != null;
          return (
          <div key={u.uid} className="rounded-xl p-4"
               style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold"
                   style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <NameEditor user={u} onOpenTimesheet={onOpenTimesheet} />
                <p className="text-xs truncate" style={{ color: '#7d8590' }}>{u.email}</p>
              </div>
              {isClockedInNow && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#22c55e' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22c55e' }} />
                    In
                  </span>
                  <button
                    onClick={() => handleForceClockOut(u.uid)}
                    disabled={clockingOut === u.uid}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-all disabled:opacity-40"
                    style={{ background: 'rgba(248,81,73,0.12)', color: '#f85149', border: '1px solid rgba(248,81,73,0.25)' }}
                  >
                    {clockingOut === u.uid ? <Loader2 size={10} className="animate-spin" /> : <LogOut size={10} />}
                    Out
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <RolePicker user={u} />
              <ActiveToggle user={u} />
              <QCToggle user={u} />
              <BonusToggle user={u} />
              <ManagerBonusToggle user={u} />
              {!u.active && <DeleteUserButton user={u} />}
            </div>
            <div className="flex gap-4 pt-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div>
                <p className="text-xs" style={{ color: '#7d8590' }}>Today</p>
                <p className="text-xs font-semibold" style={{ color: today?.mins ? '#e6edf3' : '#3d4451' }}>
                  {today?.mins ? fmtDuration(today.mins) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: '#7d8590' }}>This Week</p>
                <p className="text-xs font-semibold" style={{ color: thisWeek > 0 ? '#e6edf3' : '#3d4451' }}>
                  {thisWeek > 0 ? fmtDuration(thisWeek) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: '#7d8590' }}>Last Week</p>
                <p className="text-xs font-semibold" style={{ color: lastWeek > 0 ? '#7d8590' : '#3d4451' }}>
                  {lastWeek > 0 ? fmtDuration(lastWeek) : '—'}
                </p>
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Timesheets tab ────────────────────────────────────────────────────────────

function TimesheetsTab({ users, onOpenTimesheet }: { users: AppUser[]; onOpenTimesheet: (uid: string) => void }) {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset]   = useState(0);
  const [filterUser, setFilterUser]   = useState('all');
  const [editRecord, setEditRecord]   = useState<TimeRecord | undefined>();
  const [showAdd,    setShowAdd]      = useState(false);
  const [deleting,   setDeleting]     = useState<string | null>(null);

  const { start, end, label } = weekBounds(weekOffset);
  const { records, loading }  = useTimeRecords(start, end);

  const filtered = filterUser === 'all'
    ? records
    : records.filter(r => r.userId === filterUser);

  // Per-employee totals
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach(r => {
      if (r.durationMinutes) map.set(r.userId, (map.get(r.userId) ?? 0) + r.durationMinutes);
    });
    return map;
  }, [records]);

  const grandTotal = [...totals.values()].reduce((s, m) => s + m, 0);

  async function handleDelete(record: TimeRecord) {
    setDeleting(record.id);
    try { await deleteTimeRecord(record.id); }
    finally { setDeleting(null); }
  }

  return (
    <div>
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Week navigator */}
        <div className="flex items-center gap-1 rounded-xl overflow-hidden"
             style={{ border: '1px solid rgba(255,255,255,0.06)', background: '#161b27' }}>
          <button onClick={() => setWeekOffset(w => w - 1)}
                  className="px-3 py-2 hover:bg-white/5 transition-colors"
                  style={{ color: '#7d8590' }}>
            <ChevronLeft size={15} />
          </button>
          <span className="px-3 text-sm font-medium" style={{ color: '#e6edf3' }}>{label}</span>
          <button onClick={() => setWeekOffset(w => Math.min(0, w + 1))}
                  disabled={weekOffset >= 0}
                  className="px-3 py-2 hover:bg-white/5 transition-colors disabled:opacity-30"
                  style={{ color: '#7d8590' }}>
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Employee filter */}
        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm outline-none"
          style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)', color: '#e6edf3' }}
        >
          <option value="all">All Employees</option>
          {users.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
        </select>

        <button
          onClick={() => setShowAdd(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
          style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
        >
          <Plus size={14} /> Add Entry
        </button>
      </div>

      {/* Summary bar */}
      {records.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="px-4 py-2.5 rounded-xl text-sm"
               style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: '#7d8590' }}>Total this period: </span>
            <span className="font-semibold" style={{ color: '#e6edf3' }}>{fmtDuration(grandTotal)}</span>
          </div>
          {totals.size > 1 && (
            <div className="px-4 py-2.5 rounded-xl text-sm"
                 style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ color: '#7d8590' }}>Employees: </span>
              <span className="font-semibold" style={{ color: '#e6edf3' }}>{totals.size}</span>
            </div>
          )}
        </div>
      )}

      {/* Grouped records */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 size={20} className="animate-spin" style={{ color: '#7d8590' }} />
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <p className="text-sm text-center py-16" style={{ color: '#7d8590' }}>No time records for this period.</p>
      )}
      {!loading && filtered.length > 0 && (() => {
        // Build unique employee IDs sorted alphabetically by last name
        const seen = new Set<string>();
        const empIds: string[] = [];
        filtered.forEach(r => { if (!seen.has(r.userId)) { seen.add(r.userId); empIds.push(r.userId); } });
        const lastName = (uid: string) => {
          const name = users.find(u => u.uid === uid)?.name ?? filtered.find(r => r.userId === uid)?.userName ?? '';
          const parts = name.trim().split(' ');
          return parts[parts.length - 1].toLowerCase();
        };
        empIds.sort((a, b) => lastName(a).localeCompare(lastName(b)));

        return (
          <div className="flex flex-col gap-4">
            {empIds.map(uid => {
              const empUser  = users.find(u => u.uid === uid);
              const empRecs  = filtered.filter(r => r.userId === uid);
              const empTotal = totals.get(uid) ?? 0;
              const rc       = empUser ? ROLE_COLORS[empUser.role] : ROLE_COLORS.worker;

              return (
                <div key={uid} className="rounded-xl overflow-hidden"
                     style={{ border: '1px solid rgba(255,255,255,0.06)' }}>

                  {/* Employee group header */}
                  <div className="flex items-center gap-3 px-4 py-3"
                       style={{ background: '#161b27', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                         style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                      {(empUser?.name ?? empRecs[0].userName).charAt(0).toUpperCase()}
                    </div>
                    <button
                      onClick={() => onOpenTimesheet(uid)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity group"
                    >
                      <span className="font-semibold text-sm group-hover:underline truncate"
                            style={{ color: '#e6edf3' }}>
                        {empUser?.name ?? empRecs[0].userName}
                      </span>
                      {empUser && (
                        <span className="text-xs px-2 py-0.5 rounded-full shrink-0 capitalize"
                              style={{ background: rc.bg, color: rc.color }}>{empUser.role}</span>
                      )}
                    </button>
                    <span className="text-sm font-bold font-mono shrink-0"
                          style={{ color: empTotal > 0 ? '#e6edf3' : '#3d4451' }}>
                      {empTotal > 0 ? fmtDuration(empTotal) : '—'}
                    </span>
                  </div>

                  {/* Records for this employee — desktop table */}
                  <div className="hidden md:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {['Date', 'Clock In', 'Clock Out', 'Duration', 'Notes', ''].map(h => (
                            <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider"
                                style={{ color: '#7d8590' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {empRecs.map((r, i) => (
                          <tr key={r.id} style={{ background: i % 2 === 0 ? '#0d1117' : 'rgba(28,35,51,0.35)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td className="px-4 py-2.5 text-xs" style={{ color: '#7d8590' }}>{fmtDate(r.date)}</td>
                            <td className="px-4 py-2.5 font-mono text-xs" style={{ color: '#e6edf3' }}>{fmtTime(r.clockIn)}</td>
                            <td className="px-4 py-2.5">
                              {r.clockOut
                                ? <span className="font-mono text-xs" style={{ color: '#e6edf3' }}>{fmtTime(r.clockOut)}</span>
                                : <span className="text-xs px-2 py-0.5 rounded-full font-medium animate-pulse"
                                         style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>● Active</span>
                              }
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs font-semibold"
                                style={{ color: r.durationMinutes ? '#e6edf3' : '#7d8590' }}>
                              {fmtDuration(r.durationMinutes)}
                            </td>
                            <td className="px-4 py-2.5 text-xs max-w-[160px] truncate"
                                style={{ color: r.adjustedBy ? '#d29922' : '#7d8590' }}
                                title={r.adjustNotes}>
                              {r.adjustNotes ? <span>✎ {r.adjustNotes}</span> : '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1">
                                <button onClick={() => setEditRecord(r)}
                                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                                        title="Edit" style={{ color: '#7d8590' }}>
                                  <Pencil size={12} />
                                </button>
                                <button onClick={() => handleDelete(r)} disabled={deleting === r.id}
                                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40"
                                        title="Delete" style={{ color: '#f85149' }}>
                                  {deleting === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Records — mobile */}
                  <div className="flex flex-col gap-2 p-3 md:hidden">
                    {empRecs.map(r => (
                      <div key={r.id} className="rounded-lg p-3"
                           style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs" style={{ color: '#7d8590' }}>{fmtDate(r.date)}</span>
                          <span className="text-xs font-semibold font-mono" style={{ color: '#e6edf3' }}>
                            {fmtDuration(r.durationMinutes)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs mb-2" style={{ color: '#7d8590' }}>
                          <span>In: <span style={{ color: '#e6edf3' }}>{fmtTime(r.clockIn)}</span></span>
                          <span>Out: {r.clockOut
                            ? <span style={{ color: '#e6edf3' }}>{fmtTime(r.clockOut)}</span>
                            : <span style={{ color: '#22c55e' }}>● Active</span>
                          }</span>
                        </div>
                        {r.adjustNotes && (
                          <p className="text-xs mb-2" style={{ color: '#d29922' }}>✎ {r.adjustNotes}</p>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => setEditRecord(r)}
                                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs"
                                  style={{ background: 'rgba(255,255,255,0.05)', color: '#7d8590' }}>
                            <Pencil size={10} /> Edit
                          </button>
                          <button onClick={() => handleDelete(r)} disabled={deleting === r.id}
                                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs disabled:opacity-40"
                                  style={{ background: 'rgba(248,81,73,0.08)', color: '#f85149' }}>
                            {deleting === r.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Modals */}
      {(editRecord || showAdd) && (
        <TimeModal
          record={editRecord}
          users={users}
          onClose={() => { setEditRecord(undefined); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Employees() {
  const { users } = useUsers();
  const [tab,             setTab]             = useState<'employees' | 'timesheets'>('employees');
  const [timesheetUserId, setTimesheetUserId] = useState<string | null>(null);

  const TABS = [
    { id: 'employees',  label: 'Employees', icon: <Users size={15} /> },
    { id: 'timesheets', label: 'Timesheets', icon: <Clock size={15} /> },
  ] as const;

  function openTimesheet(uid: string) {
    setTimesheetUserId(uid);
  }

  return (
    <div className="p-4 md:p-8 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
          Employee Management
        </h1>
        <p className="text-sm mt-1" style={{ color: '#7d8590' }}>
          {users.length} employee{users.length !== 1 ? 's' : ''} · manage roles, status, and time records
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
           style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === t.id
              ? { background: '#1c2333', color: '#e6edf3', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }
              : { color: '#7d8590' }
            }
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'employees'  && <EmployeesTab  users={users} onOpenTimesheet={openTimesheet} />}
      {tab === 'timesheets' && <TimesheetsTab users={users} onOpenTimesheet={openTimesheet} />}

      {timesheetUserId && users.length > 0 && (
        <TimesheetDrawer
          users={users}
          initialUserId={timesheetUserId}
          onClose={() => setTimesheetUserId(null)}
        />
      )}
    </div>
  );
}
