import * as admin from 'firebase-admin';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { calculateBOM, CartModel, ShellColor, SeatColor } from './bom';

admin.initializeApp();

const db = admin.firestore();

/**
 * Triggered whenever a cart document is updated.
 * If the status just changed to 'qc_pass' and BOM hasn't been deducted yet,
 * runs the full inventory deduction as a single atomic batch.
 *
 * Idempotency: the `bomDeducted` flag on the cart document prevents
 * double-deductions if the trigger fires more than once.
 */
export const onQCPass = onDocumentUpdated(
  { document: 'carts/{cartId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();

    if (!before || !after) return;

    // Only run when status transitions to qc_pass
    if (before.status === 'qc_pass' || after.status !== 'qc_pass') return;

    // Idempotency guard
    if (after.bomDeducted === true) {
      logger.info(`Cart ${event.params.cartId} BOM already deducted, skipping.`);
      return;
    }

    const cartId      = event.params.cartId;
    const model       = after.model as CartModel;
    const shellColor  = after.shellColor as ShellColor;
    const seatColor   = after.seatColor as SeatColor;
    const vin         = after.vin as string;
    const userId      = after.qcPassedBy as string;
    const userName    = after.qcPassedByName as string ?? 'System';
    const notePrefix  = `QC Pass — ${model} (${shellColor} / ${seatColor})`;

    logger.info(`Running BOM deduction for cart ${cartId} (${vin})`);

    const deductions = calculateBOM({ model, shellColor, seatColor });

    // Fetch all inventory items in one query
    const inventorySnap = await db.collection('inventory').get();
    const inventoryMap  = new Map<string, { id: string; qty: number }>();
    inventorySnap.forEach(doc => {
      inventoryMap.set(doc.data().name as string, {
        id:  doc.id,
        qty: doc.data().quantityOnHand as number,
      });
    });

    const batch = db.batch();
    const now   = admin.firestore.FieldValue.serverTimestamp();

    for (const { itemName, quantity } of deductions) {
      const item = inventoryMap.get(itemName);
      if (!item) {
        logger.warn(`Inventory item not found: "${itemName}" — skipping deduction.`);
        continue;
      }

      const newQty = Math.max(0, item.qty - quantity);

      batch.update(db.collection('inventory').doc(item.id), {
        quantityOnHand: newQty,
        lastUpdatedAt:  now,
        lastUpdatedBy:  userId,
      });

      batch.set(db.collection('auditLog').doc(), {
        timestamp: now,
        userId,
        userName,
        action:    'inventory_deduction',
        itemId:    item.id,
        itemName,
        fromValue: item.qty,
        toValue:   newQty,
        cartVin:   vin,
        notes:     notePrefix,
      });
    }

    // Mark the cart so this never runs twice
    batch.update(db.collection('carts').doc(cartId), {
      bomDeducted:   true,
      bomDeductedAt: now,
    });

    await batch.commit();
    logger.info(`BOM deduction complete for ${vin} — ${deductions.length} line items processed.`);
  }
);

// ─── Time Audit Engine ────────────────────────────────────────────────────────

const OPEN_SHIFT_THRESHOLD_HOURS  = 10;
const LONG_SHIFT_THRESHOLD_HOURS  = 10;
const NO_LUNCH_THRESHOLD_HOURS    = 6;

type FlagType =
  | 'open_shift' | 'no_lunch' | 'long_shift' | 'overlapping'
  | 'absent_unconfirmed' | 'short_punch' | 'invalid_times'
  | 'early_clockin' | 'suspicious_overtime';

interface WorkSchedule {
  shiftStartHour: number;
  shiftEndHour: number;
  lunchStartHour: number;
  lunchEndHour: number;
  earlyToleranceMinutes: number;
  overtimeCutoffHour: number;
  workDays: number[];
}

const DEFAULT_SCHEDULE: WorkSchedule = {
  shiftStartHour: 8, shiftEndHour: 17,
  lunchStartHour: 11, lunchEndHour: 14,
  earlyToleranceMinutes: 15, overtimeCutoffHour: 21,
  workDays: [1, 2, 3, 4, 5],
};

interface TimeRecordRaw {
  id: string;
  userId: string;
  userName: string;
  clockIn: admin.firestore.Timestamp;
  clockOut: admin.firestore.Timestamp | null;
  durationMinutes: number | null;
  date: string;
}

async function runTimeAudit(): Promise<{ created: number; skipped: number }> {
  const now = new Date();

  const lookbackDate = new Date(now);
  lookbackDate.setDate(now.getDate() - 3);
  const lookbackStr = lookbackDate.toISOString().slice(0, 10);
  const todayStr    = now.toISOString().slice(0, 10);

  const [recordsSnap, existingFlagsSnap, usersSnap, scheduleSnap, holidaysSnap] = await Promise.all([
    db.collection('timeRecords').where('date', '>=', lookbackStr).get(),
    db.collection('auditFlags').where('status', '==', 'pending').get(),
    db.collection('users').where('active', '==', true).get(),
    db.collection('settings').doc('workSchedule').get(),
    db.collection('holidays').get(),
  ]);

  // ── Parse schedule & holidays ─────────────────────────────────────────────
  const schedule: WorkSchedule = scheduleSnap.exists
    ? (scheduleSnap.data() as WorkSchedule)
    : DEFAULT_SCHEDULE;

  const holidayDates = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  holidaysSnap.forEach((d: any) => holidayDates.add(d.data().date as string));

  const earlyThresholdMins = schedule.shiftStartHour * 60 - schedule.earlyToleranceMinutes;
  const workDaySet         = new Set<number>(schedule.workDays);

  // ── Build existing-flag index ─────────────────────────────────────────────
  const alreadyFlagged = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingFlagsSnap.forEach((d: any) => {
    alreadyFlagged.add(`${d.data().type}:${d.data().recordId}`);
    if (d.data().relatedRecordId) {
      alreadyFlagged.add(`${d.data().type}:${d.data().relatedRecordId}`);
    }
  });

  // Build excluded set: inactive users and administration role skip all time tracking
  const excludedUserIds = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usersSnap.docs.forEach((d: any) => {
    if (!d.data().active || d.data().role === 'administration') excludedUserIds.add(d.id);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRecords: TimeRecordRaw[] = recordsSnap.docs.map((d: any) => ({
    id: d.id,
    ...(d.data() as Omit<TimeRecordRaw, 'id'>),
  }));

  const records = allRecords.filter(r => !excludedUserIds.has(r.userId));

  const byUser = new Map<string, TimeRecordRaw[]>();
  for (const r of records) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push(r);
  }

  // Dates where any tracked worker clocked in — for weekend/holiday absent logic
  const datesWithActivity = new Set<string>(records.map(r => r.date));

  const batch = db.batch();
  let created = 0;
  let skipped = 0;

  function addFlag(
    type: FlagType,
    record: TimeRecordRaw,
    extra: Record<string, unknown> = {}
  ) {
    const key = `${type}:${record.id}`;
    if (alreadyFlagged.has(key)) { skipped++; return; }
    const flagRef = db.collection('auditFlags').doc();
    batch.set(flagRef, {
      type,
      userId:     record.userId,
      userName:   record.userName,
      date:       record.date,
      recordId:   record.id,
      detectedAt: admin.firestore.FieldValue.serverTimestamp(),
      status:     'pending',
      ...extra,
    });
    created++;
  }

  for (const record of records) {
    const clockIn     = record.clockIn.toDate();
    const clockOut    = record.clockOut?.toDate() ?? null;
    const clockInMins = clockIn.getHours() * 60 + clockIn.getMinutes();

    // ── Open shift ──────────────────────────────────────────────────────────
    if (!clockOut) {
      const ageHours = (now.getTime() - clockIn.getTime()) / 3_600_000;
      if (ageHours >= OPEN_SHIFT_THRESHOLD_HOURS) {
        const suggested = new Date(clockIn);
        if (clockIn.getHours() < 13) {
          suggested.setHours(schedule.shiftEndHour, 0, 0, 0);
        } else {
          suggested.setTime(clockIn.getTime() + 4 * 3_600_000);
        }
        const suggestedTs = suggested > clockIn
          ? admin.firestore.Timestamp.fromDate(suggested)
          : admin.firestore.Timestamp.fromDate(new Date(clockIn.getTime() + 4 * 3_600_000));
        addFlag('open_shift', record, { suggestedClockOut: suggestedTs });
      }
      continue;
    }

    const durationMs    = clockOut.getTime() - clockIn.getTime();
    const durationHours = durationMs / 3_600_000;
    const durationMins  = durationMs / 60_000;

    // ── Invalid times (clockOut ≤ clockIn) ──────────────────────────────────
    if (durationMs <= 0) {
      addFlag('invalid_times', record);
      continue;
    }

    // ── Short punch (<5 min) ────────────────────────────────────────────────
    if (durationMins < 5) {
      addFlag('short_punch', record);
      continue;
    }

    // ── Early clock-in ──────────────────────────────────────────────────────
    if (clockInMins < earlyThresholdMins) {
      const hh = String(clockIn.getHours()).padStart(2, '0');
      const mm = String(clockIn.getMinutes()).padStart(2, '0');
      addFlag('early_clockin', record, { clockInTime: `${hh}:${mm}` });
    }

    // ── Suspicious overtime ─────────────────────────────────────────────────
    if (clockOut.getHours() >= schedule.overtimeCutoffHour) {
      const hh = String(clockOut.getHours()).padStart(2, '0');
      const mm = String(clockOut.getMinutes()).padStart(2, '0');
      addFlag('suspicious_overtime', record, { clockOutTime: `${hh}:${mm}` });
    }

    // ── Long shift ──────────────────────────────────────────────────────────
    if (durationHours > LONG_SHIFT_THRESHOLD_HOURS) {
      addFlag('long_shift', record);
    }

    // ── No lunch (shift >6 hrs spanning lunch window, no break record) ──────
    if (durationHours > NO_LUNCH_THRESHOLD_HOURS) {
      const spansLunch = clockIn.getHours() < schedule.lunchEndHour
        && clockOut.getHours() > schedule.lunchStartHour;
      const sameDay = (byUser.get(record.userId) ?? []).filter(r => r.date === record.date && r.id !== record.id);
      if (spansLunch && sameDay.length === 0) {
        addFlag('no_lunch', record);
      }
    }
  }

  // ── Overlapping records ───────────────────────────────────────────────────
  for (const [, userRecords] of byUser) {
    const closed = userRecords
      .filter(r => r.clockOut != null)
      .sort((a, b) => a.clockIn.toMillis() - b.clockIn.toMillis());

    for (let i = 0; i < closed.length - 1; i++) {
      const a = closed[i];
      const b = closed[i + 1];
      if (b.clockIn.toDate() < a.clockOut!.toDate()) {
        const key = `overlapping:${a.id}`;
        if (!alreadyFlagged.has(key)) {
          const flagRef = db.collection('auditFlags').doc();
          batch.set(flagRef, {
            type:            'overlapping',
            userId:          a.userId,
            userName:        a.userName,
            date:            a.date,
            recordId:        a.id,
            relatedRecordId: b.id,
            detectedAt:      admin.firestore.FieldValue.serverTimestamp(),
            status:          'pending',
          });
          created++;
        } else {
          skipped++;
        }
      }
    }
  }

  // ── Absent workers ────────────────────────────────────────────────────────
  const coveredDays = new Set<string>();
  for (const r of records) coveredDays.add(`${r.userId}_${r.date}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeUsers: { uid: string; name: string }[] = usersSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => d.data().active && d.data().role !== 'administration')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ uid: d.id, name: d.data().name as string }));

  const daysToCheck: string[] = [];
  const cursor = new Date(lookbackDate);
  while (cursor.toISOString().slice(0, 10) < todayStr) {
    const dateStr   = cursor.toISOString().slice(0, 10);
    const dayOfWeek = cursor.getDay();
    const isWorkDay = workDaySet.has(dayOfWeek);
    const isHoliday = holidayDates.has(dateStr);

    if ((isWorkDay && !isHoliday) || datesWithActivity.has(dateStr)) {
      daysToCheck.push(dateStr);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const dateStr of daysToCheck) {
    for (const user of activeUsers) {
      if (coveredDays.has(`${user.uid}_${dateStr}`)) continue;
      const syntheticId = `absent_${user.uid}_${dateStr}`;
      const key = `absent_unconfirmed:${syntheticId}`;
      if (alreadyFlagged.has(key)) { skipped++; continue; }
      const flagRef = db.collection('auditFlags').doc();
      batch.set(flagRef, {
        type:       'absent_unconfirmed',
        userId:     user.uid,
        userName:   user.name,
        date:       dateStr,
        recordId:   syntheticId,
        detectedAt: admin.firestore.FieldValue.serverTimestamp(),
        status:     'pending',
      });
      created++;
    }
  }

  if (created > 0) await batch.commit();
  logger.info(`Time audit complete — ${created} new flags, ${skipped} skipped (already flagged).`);
  return { created, skipped };
}

/** Nightly scheduled audit — runs at 11:00 PM America/Chicago */
export const scheduledTimeAudit = onSchedule(
  { schedule: '0 23 * * *', timeZone: 'America/Chicago', region: 'us-central1' },
  async () => {
    await runTimeAudit();
  }
);

// ─── Ready-to-Ship Endpoint (read by CartCommand) ────────────────────────────
import { onRequest } from "firebase-functions/v2/https";

export const getReadyToShipCarts = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const snapshot = await admin
        .firestore()
        .collection("carts")
        .where("status", "==", "ready_to_ship")
        .get();
      const carts = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      }));
      res.status(200).json({ carts });
    } catch (err: any) {
      console.error("Error fetching ready-to-ship carts:", err);
      res.status(500).json({ error: err.message });
    }
  }
);