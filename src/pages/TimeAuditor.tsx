import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, AlertTriangle, Clock, RefreshCw, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Loader2, Info, Trash2, TriangleAlert,
  Sunrise, Moon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAuditFlags } from '../hooks/useAuditFlags';
import { resolveAuditFlag, dismissAuditFlag, runClientAudit, getTimeRecord, resolveAbsentFlag, confirmAbsent, deleteTimeRecord, getLastWeekBounds } from '../lib/firestore';
import { generateFlagExplanations } from '../lib/openrouter';
import type { AuditFlag, AuditFlagType } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(s: string): string {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function toDatetimeLocal(d: Date | null | undefined): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): Date | null {
  if (!s) return null;
  return new Date(s);
}

const FLAG_META: Record<AuditFlagType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  open_shift:           { label: 'Open Shift',            color: '#f85149', bg: 'rgba(248,81,73,0.1)',   icon: <Clock size={14} /> },
  no_lunch:             { label: 'No Lunch Break',         color: '#d29922', bg: 'rgba(210,153,34,0.1)',  icon: <AlertTriangle size={14} /> },
  long_shift:           { label: 'Long Shift (>10h)',      color: '#d29922', bg: 'rgba(210,153,34,0.1)',  icon: <AlertTriangle size={14} /> },
  overlapping:          { label: 'Overlapping Punches',    color: '#f85149', bg: 'rgba(248,81,73,0.1)',   icon: <AlertTriangle size={14} /> },
  absent_unconfirmed:   { label: 'No Clock-In',            color: '#a855f7', bg: 'rgba(168,85,247,0.1)',  icon: <Info size={14} /> },
  short_punch:          { label: 'Short Punch (<5 min)',   color: '#d29922', bg: 'rgba(210,153,34,0.1)',  icon: <AlertTriangle size={14} /> },
  invalid_times:        { label: 'Invalid Times',          color: '#f85149', bg: 'rgba(248,81,73,0.1)',   icon: <TriangleAlert size={14} /> },
  early_clockin:        { label: 'Early Clock-In',         color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  icon: <Sunrise size={14} /> },
  suspicious_overtime:  { label: 'Suspicious Overtime',    color: '#f97316', bg: 'rgba(249,115,22,0.1)',  icon: <Moon size={14} /> },
};

// ─── Absent Flag Card ─────────────────────────────────────────────────────────

interface AbsentFlagCardProps {
  flag: AuditFlag;
  managerUid: string;
  managerName: string;
}

function AbsentFlagCard({ flag, managerUid, managerName }: AbsentFlagCardProps) {
  const [mode, setMode]       = useState<'ask' | 'add_hours' | 'confirming_absent'>('ask');
  const [busy, setBusy]       = useState(false);
  const [absentNote, setAbsentNote] = useState('');

  // Default clock-in/out for the flagged date: 7 AM – 4 PM
  const defaultIn  = `${flag.date}T07:00`;
  const defaultOut = `${flag.date}T16:00`;
  const [clockInVal,  setClockInVal]  = useState(defaultIn);
  const [clockOutVal, setClockOutVal] = useState(defaultOut);
  const [note, setNote] = useState('');

  async function handleWasPresent() {
    if (!clockOutVal || !clockInVal) return;
    setBusy(true);
    try {
      const ci = new Date(clockInVal);
      const co = new Date(clockOutVal);
      await resolveAbsentFlag(flag, ci, co, note || 'Added by manager — worker confirmed present', managerUid, managerName);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmAbsent() {
    setBusy(true);
    try {
      await confirmAbsent(flag.id, managerUid, managerName, absentNote || 'Confirmed absent');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#1c2333', border: '1px solid rgba(168,85,247,0.2)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold shrink-0"
              style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
          <Info size={13} />
          No Clock-In
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium" style={{ color: '#e6edf3' }}>{flag.userName}</span>
          <span className="text-xs ml-2" style={{ color: '#7d8590' }}>{fmtDate(flag.date)}</span>
        </div>
      </div>

      <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>

        {/* Step 1 — ask */}
        {mode === 'ask' && (
          <>
            <p className="text-sm mb-4" style={{ color: '#7d8590' }}>
              <span style={{ color: '#e6edf3' }}>{flag.userName}</span> has no time records for this day.
              Were they at work?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('add_hours')}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
              >
                Yes — they worked
              </button>
              <button
                onClick={() => setMode('confirming_absent')}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'rgba(248,81,73,0.08)', color: '#f85149', border: '1px solid rgba(248,81,73,0.15)' }}
              >
                No — mark absent
              </button>
            </div>
          </>
        )}

        {/* Step 2a — add hours */}
        {mode === 'add_hours' && (
          <>
            <p className="text-xs mb-3" style={{ color: '#7d8590' }}>Enter their hours for {fmtDate(flag.date)}:</p>
            <div className="flex flex-wrap gap-3 mb-3">
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs mb-1" style={{ color: '#7d8590' }}>Clock In</label>
                <input type="datetime-local" value={clockInVal} onChange={e => setClockInVal(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3' }} />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs mb-1" style={{ color: '#7d8590' }}>Clock Out</label>
                <input type="datetime-local" value={clockOutVal} onChange={e => setClockOutVal(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3' }} />
              </div>
            </div>
            <input type="text" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm mb-3"
              style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3' }} />
            <div className="flex gap-2">
              <button onClick={handleWasPresent} disabled={busy || !clockInVal || !clockOutVal}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Save Hours
              </button>
              <button onClick={() => setMode('ask')} disabled={busy}
                className="px-4 py-2 rounded-lg text-sm transition-all"
                style={{ color: '#7d8590' }}>
                Back
              </button>
            </div>
          </>
        )}

        {/* Step 2b — confirm absent */}
        {mode === 'confirming_absent' && (
          <>
            <p className="text-xs mb-3" style={{ color: '#7d8590' }}>
              Add a note (optional) then confirm {flag.userName} was absent on {fmtDate(flag.date)}:
            </p>
            <input type="text" placeholder="Reason (e.g. called out, day off…)" value={absentNote}
              onChange={e => setAbsentNote(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm mb-3"
              style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3' }} />
            <div className="flex gap-2">
              <button onClick={handleConfirmAbsent} disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                style={{ background: 'rgba(248,81,73,0.12)', color: '#f85149', border: '1px solid rgba(248,81,73,0.2)' }}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                Confirm Absent
              </button>
              <button onClick={() => setMode('ask')} disabled={busy}
                className="px-4 py-2 rounded-lg text-sm transition-all"
                style={{ color: '#7d8590' }}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Flag Card ────────────────────────────────────────────────────────────────

interface FlagCardProps {
  flag: AuditFlag;
  managerUid: string;
  managerName: string;
  aiExplanation?: string;
}

function FlagCard({ flag, managerUid, managerName, aiExplanation }: FlagCardProps) {
  const meta = FLAG_META[flag.type];
  const [expanded, setExpanded]       = useState(flag.type === 'invalid_times');
  const [busy, setBusy]               = useState(false);
  const [dismissNote, setDismissNote] = useState('');
  const [resolveNote, setResolveNote] = useState('');
  const [showDismiss, setShowDismiss] = useState(false);

  const [clockInVal, setClockInVal]   = useState('');
  const [clockOutVal, setClockOutVal] = useState(
    flag.suggestedClockOut ? toDatetimeLocal(flag.suggestedClockOut) : ''
  );

  // early_clockin / suspicious_overtime: info-only, no time editing needed
  const isInfoOnly   = flag.type === 'early_clockin' || flag.type === 'suspicious_overtime';
  // open_shift only needs clock-out
  const needsClockIn = !isInfoOnly && flag.type !== 'open_shift';
  // invalid_times must be corrected — cannot dismiss
  const canDismiss   = flag.type !== 'invalid_times';

  async function handleResolve() {
    if (!clockOutVal) return;
    setBusy(true);
    try {
      const clockOut = fromDatetimeLocal(clockOutVal)!;

      let clockIn: Date;
      if (needsClockIn && clockInVal) {
        clockIn = fromDatetimeLocal(clockInVal)!;
      } else {
        // open_shift: fetch the actual clock-in from the record
        const record = await getTimeRecord(flag.recordId);
        clockIn = record?.clockIn ?? new Date(clockOut.getTime() - 8 * 3_600_000);
      }

      await resolveAuditFlag(
        flag,
        clockIn,
        clockOut,
        resolveNote || 'Resolved via Time Auditor',
        managerUid,
        managerName
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDismiss() {
    if (!dismissNote.trim()) return;
    setBusy(true);
    try {
      await dismissAuditFlag(flag.id, managerUid, managerName, dismissNote);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRecord() {
    setBusy(true);
    try {
      await deleteTimeRecord(flag.recordId);
      await dismissAuditFlag(flag.id, managerUid, managerName, 'Record deleted — confirmed accidental punch');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold shrink-0"
              style={{ background: meta.bg, color: meta.color }}>
          {meta.icon}
          {meta.label}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium" style={{ color: '#e6edf3' }}>{flag.userName}</span>
          <span className="text-xs ml-2" style={{ color: '#7d8590' }}>{fmtDate(flag.date)}</span>
        </div>
        {flag.suggestedClockOut && (
          <span className="text-xs shrink-0" style={{ color: '#7d8590' }}>
            Suggest: {fmtTime(flag.suggestedClockOut)}
          </span>
        )}
        {expanded ? <ChevronUp size={15} style={{ color: '#7d8590' }} /> : <ChevronDown size={15} style={{ color: '#7d8590' }} />}
      </button>

      {/* Expanded actions */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>

          {/* AI explanation */}
          {aiExplanation && (
            <div className="flex items-start gap-2 mb-3 px-3 py-2.5 rounded-lg"
                 style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)' }}>
              <Info size={12} className="mt-0.5 shrink-0" style={{ color: '#60a5fa' }} />
              <p className="text-xs leading-relaxed" style={{ color: '#93c5fd' }}>{aiExplanation}</p>
            </div>
          )}

          {/* Context info */}
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg"
               style={{ background: flag.type === 'invalid_times' ? 'rgba(248,81,73,0.07)' : 'rgba(125,133,144,0.08)',
                        border:     flag.type === 'invalid_times' ? '1px solid rgba(248,81,73,0.15)' : 'none' }}>
            {flag.type === 'invalid_times'
              ? <TriangleAlert size={13} className="mt-0.5 shrink-0" style={{ color: '#f85149' }} />
              : <Info         size={13} className="mt-0.5 shrink-0" style={{ color: '#7d8590' }} />}
            <p className="text-xs leading-relaxed" style={{ color: flag.type === 'invalid_times' ? '#f85149' : '#7d8590' }}>
              {flag.type === 'open_shift'           && `${flag.userName} clocked in but never clocked out. Set the correct clock-out time below.`}
              {flag.type === 'no_lunch'             && `${flag.userName} worked more than 6 hours through the lunch window with no break record.`}
              {flag.type === 'long_shift'           && `${flag.userName} logged a shift longer than 10 hours. Verify the times are correct.`}
              {flag.type === 'overlapping'          && `${flag.userName} has two overlapping time records on this date. Correct or remove one.`}
              {flag.type === 'short_punch'          && `${flag.userName} clocked in and out in under 5 minutes — likely an accidental tap. Delete the record or edit the times if it was real.`}
              {flag.type === 'invalid_times'        && `Data integrity issue — clock-out is before or equal to clock-in for ${flag.userName}. This must be corrected before payroll runs.`}
              {flag.type === 'early_clockin'        && `${flag.userName} clocked in at ${flag.clockInTime ?? 'an early time'}, more than 15 minutes before the scheduled 8:00 AM shift start. Acknowledge if authorized.`}
              {flag.type === 'suspicious_overtime'  && `${flag.userName} clocked out at ${flag.clockOutTime ?? 'a late time'}, after the 9:00 PM overtime cutoff. Acknowledge if this was approved.`}
            </p>
          </div>

          {/* Info-only flags (early_clockin, suspicious_overtime) — no time editing */}
          {isInfoOnly ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowDismiss(d => !d)}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
              >
                <CheckCircle2 size={13} />
                Acknowledge
              </button>
            </div>
          ) : (
            <>
              {/* Time inputs */}
              <div className="flex flex-wrap gap-3 mb-3">
                {needsClockIn && (
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs mb-1" style={{ color: '#7d8590' }}>Clock In</label>
                    <input
                      type="datetime-local"
                      value={clockInVal}
                      onChange={e => setClockInVal(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3' }}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs mb-1" style={{ color: '#7d8590' }}>
                    {flag.type === 'open_shift' ? 'Clock Out (set this)' : 'Clock Out'}
                  </label>
                  <input
                    type="datetime-local"
                    value={clockOutVal}
                    onChange={e => setClockOutVal(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3' }}
                  />
                </div>
              </div>

              <input
                type="text"
                placeholder="Note (optional)"
                value={resolveNote}
                onChange={e => setResolveNote(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm mb-3"
                style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3' }}
              />

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleResolve}
                  disabled={busy || !clockOutVal || (needsClockIn && !clockInVal)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  {flag.type === 'invalid_times' ? 'Fix & Resolve' : 'Apply & Resolve'}
                </button>

                {flag.type === 'short_punch' && (
                  <button
                    onClick={handleDeleteRecord}
                    disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                    style={{ background: 'rgba(248,81,73,0.1)', color: '#f85149', border: '1px solid rgba(248,81,73,0.2)' }}
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Delete (Accidental)
                  </button>
                )}

                {canDismiss && (
                  <button
                    onClick={() => setShowDismiss(d => !d)}
                    disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                    style={{ background: 'rgba(125,133,144,0.08)', color: '#7d8590', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <XCircle size={13} />
                    Dismiss
                  </button>
                )}
              </div>
            </>
          )}

          {/* Dismiss/acknowledge note input */}
          {canDismiss && showDismiss && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder={isInfoOnly ? 'Note (e.g. authorized early start, approved overtime…)' : 'Reason for dismissing (required)'}
                value={dismissNote}
                onChange={e => setDismissNote(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', color: '#e6edf3' }}
              />
              <button
                onClick={handleDismiss}
                disabled={busy || (!isInfoOnly && !dismissNote.trim())}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : 'Confirm'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Resolved Row ─────────────────────────────────────────────────────────────

function ResolvedRow({ flag }: { flag: AuditFlag }) {
  const meta = FLAG_META[flag.type];
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#1c2333', border: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium shrink-0"
            style={{ background: 'rgba(125,133,144,0.1)', color: '#7d8590' }}>
        {meta.label}
      </span>
      <span className="text-sm flex-1 min-w-0" style={{ color: '#7d8590' }}>{flag.userName} — {fmtDate(flag.date)}</span>
      <span className="text-xs shrink-0 px-2 py-0.5 rounded-full"
            style={flag.confirmedAbsent
              ? { background: 'rgba(248,81,73,0.1)', color: '#f85149' }
              : flag.status === 'resolved'
              ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e' }
              : { background: 'rgba(125,133,144,0.1)', color: '#7d8590' }}>
        {flag.confirmedAbsent ? 'Absent' : flag.status === 'resolved' ? 'Resolved' : 'Dismissed'}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'pending' | 'history';

export default function TimeAuditor() {
  const { user } = useAuth();
  const [tab, setTab]         = useState<Tab>('pending');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ created: number; skipped: number; label: string } | null>(null);
  const [auditRange, setAuditRange] = useState<'recent' | 'last_week'>('recent');

  const lastWeek = getLastWeekBounds();

  const { flags: pendingFlags, loading: pendingLoading } = useAuditFlags('pending');
  const { flags: allFlags,     loading: historyLoading  } = useAuditFlags('all');

  // ── AI explanations (batch-fetched when pending flags load) ──────────────────
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const explainedIds = useRef(new Set<string>());

  useEffect(() => {
    if (!pendingFlags.length) return;
    const toExplain = pendingFlags.filter(f => !explainedIds.current.has(f.id));
    if (!toExplain.length) return;
    toExplain.forEach(f => explainedIds.current.add(f.id));

    generateFlagExplanations(toExplain.map(f => ({
      id:           f.id,
      type:         f.type,
      userName:     f.userName,
      date:         f.date,
      clockInTime:  f.clockInTime,
      clockOutTime: f.clockOutTime,
    }))).then(result => {
      if (Object.keys(result).length) {
        setAiExplanations(prev => ({ ...prev, ...result }));
      }
    }).catch(() => {/* fail silently — explanations are non-critical */});
  }, [pendingFlags]);

  const historyFlags = allFlags.filter(f => f.status !== 'pending');

  async function handleRunAudit() {
    setRunning(true);
    setRunResult(null);
    try {
      const range = auditRange === 'last_week' ? { start: lastWeek.start, end: lastWeek.end } : undefined;
      const result = await runClientAudit(range);
      const label  = auditRange === 'last_week' ? lastWeek.label : 'Last 3 days';
      setRunResult({ ...result, label });
    } finally {
      setRunning(false);
    }
  }

  if (!user) return null;

  return (
    <div className="p-6 max-w-3xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <ShieldCheck size={18} style={{ color: '#22c55e' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
              Time Auditor
            </h1>
            <p className="text-xs" style={{ color: '#7d8590' }}>Review and fix time record anomalies</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={auditRange}
            onChange={e => setAuditRange(e.target.value as 'recent' | 'last_week')}
            disabled={running}
            className="px-3 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#1c2333', color: '#e6edf3', border: '1px solid rgba(255,255,255,0.08)', outline: 'none' }}
          >
            <option value="recent">Last 3 days</option>
            <option value="last_week">Last week ({lastWeek.label})</option>
          </select>
          <button
            onClick={handleRunAudit}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {running ? 'Scanning…' : 'Run Audit'}
          </button>
        </div>
      </div>

      {/* Run result banner */}
      {runResult && (
        <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-sm"
             style={{ background: runResult.created > 0 ? 'rgba(248,81,73,0.08)' : 'rgba(34,197,94,0.08)',
                      border: `1px solid ${runResult.created > 0 ? 'rgba(248,81,73,0.2)' : 'rgba(34,197,94,0.2)'}`,
                      color: runResult.created > 0 ? '#f85149' : '#22c55e' }}>
          {runResult.created > 0
            ? <AlertTriangle size={14} />
            : <CheckCircle2 size={14} />}
          {runResult.created > 0
            ? `Found ${runResult.created} new issue${runResult.created > 1 ? 's' : ''} for ${runResult.label} — review below.`
            : `Audit complete for ${runResult.label} — no new issues found.`}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: '#161b27' }}>
        {(['pending', 'history'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize"
            style={tab === t
              ? { background: '#1c2333', color: '#e6edf3' }
              : { color: '#7d8590' }}
          >
            {t === 'pending' ? `Pending${pendingFlags.length > 0 ? ` (${pendingFlags.length})` : ''}` : 'History'}
          </button>
        ))}
      </div>

      {/* Pending tab */}
      {tab === 'pending' && (
        <>
          {pendingLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={20} className="animate-spin" style={{ color: '#7d8590' }} />
            </div>
          ) : pendingFlags.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-3">
              <CheckCircle2 size={36} style={{ color: '#22c55e', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: '#7d8590' }}>No pending issues. Run an audit to scan for anomalies.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingFlags.map(f =>
                f.type === 'absent_unconfirmed'
                  ? <AbsentFlagCard key={f.id} flag={f} managerUid={user.uid} managerName={user.name} />
                  : <FlagCard       key={f.id} flag={f} managerUid={user.uid} managerName={user.name} aiExplanation={aiExplanations[f.id]} />
              )}
            </div>
          )}
        </>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <>
          {historyLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={20} className="animate-spin" style={{ color: '#7d8590' }} />
            </div>
          ) : historyFlags.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-3">
              <Info size={36} style={{ color: '#7d8590', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: '#7d8590' }}>No resolved or dismissed flags yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {historyFlags.map(f => (
                <ResolvedRow key={f.id} flag={f} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
