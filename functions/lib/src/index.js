"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReadyToShipCarts = exports.scheduledTimeAudit = exports.onQCPass = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const bom_1 = require("./bom");
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
exports.onQCPass = (0, firestore_1.onDocumentUpdated)({ document: 'carts/{cartId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    // Only run when status transitions to qc_pass
    if (before.status === 'qc_pass' || after.status !== 'qc_pass')
        return;
    // Idempotency guard
    if (after.bomDeducted === true) {
        v2_1.logger.info(`Cart ${event.params.cartId} BOM already deducted, skipping.`);
        return;
    }
    const cartId = event.params.cartId;
    const model = after.model;
    const shellColor = after.shellColor;
    const seatColor = after.seatColor;
    const vin = after.vin;
    const userId = after.qcPassedBy;
    const userName = (_c = after.qcPassedByName) !== null && _c !== void 0 ? _c : 'System';
    const notePrefix = `QC Pass — ${model} (${shellColor} / ${seatColor})`;
    v2_1.logger.info(`Running BOM deduction for cart ${cartId} (${vin})`);
    const deductions = (0, bom_1.calculateBOM)({ model, shellColor, seatColor });
    // Fetch all inventory items in one query
    const inventorySnap = await db.collection('inventory').get();
    const inventoryMap = new Map();
    inventorySnap.forEach(doc => {
        inventoryMap.set(doc.data().name, {
            id: doc.id,
            qty: doc.data().quantityOnHand,
        });
    });
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    for (const { itemName, quantity } of deductions) {
        const item = inventoryMap.get(itemName);
        if (!item) {
            v2_1.logger.warn(`Inventory item not found: "${itemName}" — skipping deduction.`);
            continue;
        }
        const newQty = Math.max(0, item.qty - quantity);
        batch.update(db.collection('inventory').doc(item.id), {
            quantityOnHand: newQty,
            lastUpdatedAt: now,
            lastUpdatedBy: userId,
        });
        batch.set(db.collection('auditLog').doc(), {
            timestamp: now,
            userId,
            userName,
            action: 'inventory_deduction',
            itemId: item.id,
            itemName,
            fromValue: item.qty,
            toValue: newQty,
            cartVin: vin,
            notes: notePrefix,
        });
    }
    // Mark the cart so this never runs twice
    batch.update(db.collection('carts').doc(cartId), {
        bomDeducted: true,
        bomDeductedAt: now,
    });
    await batch.commit();
    v2_1.logger.info(`BOM deduction complete for ${vin} — ${deductions.length} line items processed.`);
});
// ─── Time Audit Engine ────────────────────────────────────────────────────────
const OPEN_SHIFT_THRESHOLD_HOURS = 10;
const LONG_SHIFT_THRESHOLD_HOURS = 10;
const NO_LUNCH_THRESHOLD_HOURS = 6;
const DEFAULT_SCHEDULE = {
    shiftStartHour: 8, shiftEndHour: 17,
    lunchStartHour: 11, lunchEndHour: 14,
    earlyToleranceMinutes: 15, overtimeCutoffHour: 21,
    workDays: [1, 2, 3, 4, 5],
};
async function runTimeAudit() {
    var _a, _b, _c;
    const now = new Date();
    const lookbackDate = new Date(now);
    lookbackDate.setDate(now.getDate() - 3);
    const lookbackStr = lookbackDate.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);
    const [recordsSnap, existingFlagsSnap, usersSnap, scheduleSnap, holidaysSnap] = await Promise.all([
        db.collection('timeRecords').where('date', '>=', lookbackStr).get(),
        db.collection('auditFlags').where('status', '==', 'pending').get(),
        db.collection('users').where('active', '==', true).get(),
        db.collection('settings').doc('workSchedule').get(),
        db.collection('holidays').get(),
    ]);
    // ── Parse schedule & holidays ─────────────────────────────────────────────
    const schedule = scheduleSnap.exists()
        ? scheduleSnap.data()
        : DEFAULT_SCHEDULE;
    const holidayDates = new Set();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    holidaysSnap.forEach((d) => holidayDates.add(d.data().date));
    const earlyThresholdMins = schedule.shiftStartHour * 60 - schedule.earlyToleranceMinutes;
    const workDaySet = new Set(schedule.workDays);
    // ── Build existing-flag index ─────────────────────────────────────────────
    const alreadyFlagged = new Set();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existingFlagsSnap.forEach((d) => {
        alreadyFlagged.add(`${d.data().type}:${d.data().recordId}`);
        if (d.data().relatedRecordId) {
            alreadyFlagged.add(`${d.data().type}:${d.data().relatedRecordId}`);
        }
    });
    // Build excluded set: inactive users and administration role skip all time tracking
    const excludedUserIds = new Set();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    usersSnap.docs.forEach((d) => {
        if (!d.data().active || d.data().role === 'administration')
            excludedUserIds.add(d.id);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allRecords = recordsSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    const records = allRecords.filter(r => !excludedUserIds.has(r.userId));
    const byUser = new Map();
    for (const r of records) {
        if (!byUser.has(r.userId))
            byUser.set(r.userId, []);
        byUser.get(r.userId).push(r);
    }
    // Dates where any tracked worker clocked in — for weekend/holiday absent logic
    const datesWithActivity = new Set(records.map(r => r.date));
    const batch = db.batch();
    let created = 0;
    let skipped = 0;
    function addFlag(type, record, extra = {}) {
        const key = `${type}:${record.id}`;
        if (alreadyFlagged.has(key)) {
            skipped++;
            return;
        }
        const flagRef = db.collection('auditFlags').doc();
        batch.set(flagRef, Object.assign({ type, userId: record.userId, userName: record.userName, date: record.date, recordId: record.id, detectedAt: admin.firestore.FieldValue.serverTimestamp(), status: 'pending' }, extra));
        created++;
    }
    for (const record of records) {
        const clockIn = record.clockIn.toDate();
        const clockOut = (_b = (_a = record.clockOut) === null || _a === void 0 ? void 0 : _a.toDate()) !== null && _b !== void 0 ? _b : null;
        const clockInMins = clockIn.getHours() * 60 + clockIn.getMinutes();
        // ── Open shift ──────────────────────────────────────────────────────────
        if (!clockOut) {
            const ageHours = (now.getTime() - clockIn.getTime()) / 3600000;
            if (ageHours >= OPEN_SHIFT_THRESHOLD_HOURS) {
                const suggested = new Date(clockIn);
                if (clockIn.getHours() < 13) {
                    suggested.setHours(schedule.shiftEndHour, 0, 0, 0);
                }
                else {
                    suggested.setTime(clockIn.getTime() + 4 * 3600000);
                }
                const suggestedTs = suggested > clockIn
                    ? admin.firestore.Timestamp.fromDate(suggested)
                    : admin.firestore.Timestamp.fromDate(new Date(clockIn.getTime() + 4 * 3600000));
                addFlag('open_shift', record, { suggestedClockOut: suggestedTs });
            }
            continue;
        }
        const durationMs = clockOut.getTime() - clockIn.getTime();
        const durationHours = durationMs / 3600000;
        const durationMins = durationMs / 60000;
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
            const sameDay = ((_c = byUser.get(record.userId)) !== null && _c !== void 0 ? _c : []).filter(r => r.date === record.date && r.id !== record.id);
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
            if (b.clockIn.toDate() < a.clockOut.toDate()) {
                const key = `overlapping:${a.id}`;
                if (!alreadyFlagged.has(key)) {
                    const flagRef = db.collection('auditFlags').doc();
                    batch.set(flagRef, {
                        type: 'overlapping',
                        userId: a.userId,
                        userName: a.userName,
                        date: a.date,
                        recordId: a.id,
                        relatedRecordId: b.id,
                        detectedAt: admin.firestore.FieldValue.serverTimestamp(),
                        status: 'pending',
                    });
                    created++;
                }
                else {
                    skipped++;
                }
            }
        }
    }
    // ── Absent workers ────────────────────────────────────────────────────────
    const coveredDays = new Set();
    for (const r of records)
        coveredDays.add(`${r.userId}_${r.date}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeUsers = usersSnap.docs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((d) => d.data().active && d.data().role !== 'administration')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((d) => ({ uid: d.id, name: d.data().name }));
    const daysToCheck = [];
    const cursor = new Date(lookbackDate);
    while (cursor.toISOString().slice(0, 10) < todayStr) {
        const dateStr = cursor.toISOString().slice(0, 10);
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
            if (coveredDays.has(`${user.uid}_${dateStr}`))
                continue;
            const syntheticId = `absent_${user.uid}_${dateStr}`;
            const key = `absent_unconfirmed:${syntheticId}`;
            if (alreadyFlagged.has(key)) {
                skipped++;
                continue;
            }
            const flagRef = db.collection('auditFlags').doc();
            batch.set(flagRef, {
                type: 'absent_unconfirmed',
                userId: user.uid,
                userName: user.name,
                date: dateStr,
                recordId: syntheticId,
                detectedAt: admin.firestore.FieldValue.serverTimestamp(),
                status: 'pending',
            });
            created++;
        }
    }
    if (created > 0)
        await batch.commit();
    v2_1.logger.info(`Time audit complete — ${created} new flags, ${skipped} skipped (already flagged).`);
    return { created, skipped };
}
/** Nightly scheduled audit — runs at 11:00 PM America/Chicago */
exports.scheduledTimeAudit = (0, scheduler_1.onSchedule)({ schedule: '0 23 * * *', timeZone: 'America/Chicago', region: 'us-central1' }, async () => {
    await runTimeAudit();
});
// ─── Ready-to-Ship Endpoint (read by CartCommand) ────────────────────────────
exports.getReadyToShipCarts = functions.https.onRequest((req, res) => {
    // Allow CartCommand (any origin) to call this
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    const db = admin.firestore();
    db.collection("carts")
        .where("status", "==", "ready_to_ship")
        .get()
        .then(snapshot => {
        const carts = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        res.status(200).json({ carts });
    })
        .catch(err => {
        console.error("Error fetching ready-to-ship carts:", err);
        res.status(500).json({ error: err.message });
    });
});
//# sourceMappingURL=index.js.map