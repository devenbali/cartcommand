import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  getDocs,
  setDoc,
  getDoc,
  limit,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { calculateBOM } from './bom';
import type { Cart, CartStatus, CartModel, ShellColor, SeatColor, Dealer, InventoryItem, ScrapLogEntry, AuditLogEntry, AppUser, UserRole, TimeRecord, LocationSettings, CompanySettings, AuditFlag, AuditFlagStatus, AuditFlagType, WorkSchedule, Holiday } from '../types';
import { DEFAULT_WORK_SCHEDULE } from '../types';

// ─── Photo Upload ─────────────────────────────────────────────────────────────

export async function uploadVINPhoto(file: File, tempId: string): Promise<string> {
  const storageRef = ref(storage, `vin-photos/${tempId}/${Date.now()}_${file.name}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function uploadScrapPhoto(file: File, entryId: string): Promise<string> {
  const storageRef = ref(storage, `scrap-photos/${entryId}/${Date.now()}_${file.name}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

// ─── Carts ────────────────────────────────────────────────────────────────────

export async function createCart(data: {
  vin: string;
  vinPhotoUrl: string;
  model: CartModel;
  shellColor: ShellColor;
  seatColor: SeatColor;
  dealerId: string;
  dealerName: string;
  createdBy: string;
  createdByName: string;
}): Promise<string> {
  const vin = data.vin.trim();
  if (!vin || vin.length < 3 || vin.length > 30 || !/^[A-Za-z0-9 _\-]+$/.test(vin)) {
    throw new Error('Invalid VIN — must be 3–30 alphanumeric characters.');
  }
  const docRef = await addDoc(collection(db, 'carts'), {
    ...data,
    vin,
    status: 'intake' as CartStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateCartStatus(
  cartId: string,
  newStatus: CartStatus,
  userId: string,
  userName: string,
  qcFailReason?: string,
  repairNotes?: string
): Promise<void> {
  const updates: Record<string, unknown> = {
    status: newStatus,
    updatedAt: serverTimestamp(),
  };

  if (newStatus === 'built')          { updates.builtAt = serverTimestamp();        updates.builtBy = userId; }
  if (newStatus === 'painted')        { updates.paintedAt = serverTimestamp();      updates.paintedBy = userId; }
  if (newStatus === 'in_queue')       { updates.queuedAt = serverTimestamp();       updates.queuedBy = userId; }
  if (newStatus === 'ready_to_ship')  { updates.readyToShipAt = serverTimestamp();  updates.readyToShipBy = userId; }
  if (newStatus === 'shipped')        { updates.shippedAt = serverTimestamp();       updates.shippedBy = userId; }
  if (newStatus === 'incomplete')     { updates.incompleteAt = serverTimestamp();    updates.incompleteBy = userId; updates.repairNotes = repairNotes ?? ''; }
  if (newStatus === 'qc_pass')  { updates.qcPassedAt = serverTimestamp(); updates.qcPassedBy = userId; }
  if (newStatus === 'qc_fail')  {
    updates.qcFailedAt = serverTimestamp();
    updates.qcFailedBy = userId;
    updates.qcFailReason = qcFailReason ?? '';
  }

  await updateDoc(doc(db, 'carts', cartId), updates);
}

export async function setCartShippingDate(cartId: string, shippingDate: string): Promise<void> {
  await updateDoc(doc(db, 'carts', cartId), { shippingDate, updatedAt: serverTimestamp() });
}

export async function deleteCart(cartId: string): Promise<void> {
  await deleteDoc(doc(db, 'carts', cartId));
}

export async function createCartManual(data: {
  vin: string;
  model: CartModel;
  shellColor: ShellColor;
  seatColor: SeatColor;
  dealerId: string;
  dealerName: string;
  status: CartStatus;
  vinPhotoUrl: string;
  createdBy: string;
  createdByName: string;
}): Promise<string> {
  const vin = data.vin.trim();
  if (!vin || vin.length < 3 || vin.length > 30 || !/^[A-Za-z0-9 _\-]+$/.test(vin)) {
    throw new Error('Invalid VIN — must be 3–30 alphanumeric characters.');
  }
  const docRef = await addDoc(collection(db, 'carts'), {
    ...data,
    vin,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/** Runs BOM deduction on QC Pass — atomic transaction prevents double-deduction */
export async function performBOMDeduction(
  cart: Cart,
  userId: string,
  userName: string
): Promise<void> {
  const deductions = calculateBOM({
    model: cart.model,
    shellColor: cart.shellColor,
    seatColor: cart.seatColor,
  });

  // Resolve item names → doc IDs outside the transaction (lookup only, no qty read)
  const inventorySnap = await getDocs(collection(db, 'inventory'));
  const nameToId = new Map<string, string>();
  inventorySnap.forEach(d => nameToId.set(d.data().name as string, d.id));

  const toDeduct = deductions
    .map(({ itemName, quantity }) => ({ itemId: nameToId.get(itemName), itemName, quantity }))
    .filter((x): x is { itemId: string; itemName: string; quantity: number } => !!x.itemId);

  if (toDeduct.length === 0) return;

  await runTransaction(db, async transaction => {
    // Read current quantities atomically inside the transaction
    const refs = toDeduct.map(({ itemId }) => doc(db, 'inventory', itemId));
    const snaps = await Promise.all(refs.map(r => transaction.get(r)));

    for (let i = 0; i < toDeduct.length; i++) {
      const { itemId, itemName, quantity } = toDeduct[i];
      const snap = snaps[i];
      if (!snap.exists()) continue;
      const currentQty = snap.data().quantityOnHand as number;
      const newQty = Math.max(0, currentQty - quantity);

      transaction.update(refs[i], {
        quantityOnHand: newQty,
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedBy: userId,
      });

      transaction.set(doc(collection(db, 'auditLog')), {
        timestamp: serverTimestamp(),
        userId,
        userName,
        action: 'inventory_deduction',
        itemId,
        itemName,
        fromValue: currentQty,
        toValue: newQty,
        cartVin: cart.vin,
        notes: `QC Pass — ${cart.model} (${cart.shellColor} / ${cart.seatColor})`,
      });
    }
  });
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

/** Real-time listener for all non-completed carts (painted + ready_to_ship excluded) */
export function subscribeToActiveCarts(
  callback: (carts: Cart[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, 'carts'),
    where('status', 'in', ['intake', 'built', 'in_queue', 'qc_fail', 'qc_pass', 'painted', 'ready_to_ship', 'incomplete']),
    orderBy('updatedAt', 'desc')
  );
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cart))),
    onError
  );
}

/** Real-time listener for ALL carts (master list, ordered newest first) */
export function subscribeToAllCarts(
  callback: (carts: Cart[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, 'carts'), orderBy('createdAt', 'desc'), limit(500));
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cart))),
    onError
  );
}

/** Real-time listener for today's QC-passed carts */
export function subscribeToTodaysPasses(callback: (count: number) => void) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const q = query(
    collection(db, 'carts'),
    where('status', '==', 'qc_pass'),
    where('qcPassedAt', '>=', startOfDay)
  );
  return onSnapshot(q, snap => callback(snap.size));
}

/** Real-time listener for this calendar month's QC-passed carts */
export function subscribeToMonthlyPasses(callback: (carts: Cart[]) => void) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const q = query(
    collection(db, 'carts'),
    where('status', '==', 'qc_pass'),
    where('qcPassedAt', '>=', startOfMonth),
    orderBy('qcPassedAt', 'desc')
  );
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cart)))
  );
}

/** Real-time listener for active dealers */
export function subscribeToDealers(callback: (dealers: Dealer[]) => void) {
  const q = query(collection(db, 'dealers'), where('active', '==', true), orderBy('name'));
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Dealer)))
  );
}

/** Real-time listener for audit log entries (most recent first, capped at 200) */
export function subscribeToAuditLog(callback: (entries: AuditLogEntry[]) => void) {
  const q = query(
    collection(db, 'auditLog'),
    orderBy('timestamp', 'desc'),
    limit(200)
  );
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLogEntry)))
  );
}

export async function addDealer(name: string): Promise<{ id: string; name: string }> {
  const ref = await addDoc(collection(db, 'dealers'), {
    name,
    active: true,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, name };
}

export async function deactivateDealer(dealerId: string): Promise<void> {
  await updateDoc(doc(db, 'dealers', dealerId), { active: false });
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export function subscribeToInventory(callback: (items: InventoryItem[]) => void) {
  // No composite index needed — sort client-side
  return onSnapshot(collection(db, 'inventory'), snap => {
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as InventoryItem))
      .sort((a, b) => {
        const catCmp = a.category.localeCompare(b.category);
        return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name);
      });
    callback(items);
  });
}

export async function updateInventoryQty(
  itemId: string,
  newQty: number,
  userId: string,
  userName: string
): Promise<void> {
  const itemRef = doc(db, 'inventory', itemId);
  const snap = await getDoc(itemRef);
  const old = snap.data()?.quantityOnHand ?? 0;

  const batch = writeBatch(db);
  batch.update(itemRef, {
    quantityOnHand: newQty,
    lastUpdatedAt: serverTimestamp(),
    lastUpdatedBy: userId,
  });
  batch.set(doc(collection(db, 'auditLog')), {
    timestamp: serverTimestamp(),
    userId,
    userName,
    action: 'inventory_update',
    itemId,
    itemName: snap.data()?.name ?? '',
    fromValue: old,
    toValue: newQty,
    notes: 'Manual quantity update',
  });
  await batch.commit();
}

// ─── Scrap Log ────────────────────────────────────────────────────────────────

export async function addScrapLogEntry(data: {
  itemName: string;
  partNumber?: string;
  problemInfo: string;
  quantity: number;
  photoUrl?: string;
  associatedVin?: string;
  loggedBy: string;
  loggedByName: string;
}): Promise<string> {
  const { partNumber, photoUrl, associatedVin, ...required } = data;
  const docRef = await addDoc(collection(db, 'scrapLog'), {
    ...required,
    ...(partNumber    ? { partNumber }    : {}),
    ...(photoUrl      ? { photoUrl }      : {}),
    ...(associatedVin ? { associatedVin } : {}),
    date: serverTimestamp(),
  });
  // Audit log entry
  await addDoc(collection(db, 'auditLog'), {
    timestamp: serverTimestamp(),
    userId: data.loggedBy,
    userName: data.loggedByName,
    action: 'scrap_logged',
    itemName: data.itemName,
    notes: data.problemInfo,
    cartVin: data.associatedVin ?? null,
  });
  return docRef.id;
}

export function subscribeToScrapLog(callback: (entries: ScrapLogEntry[]) => void) {
  const q = query(collection(db, 'scrapLog'), orderBy('date', 'desc'));
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScrapLogEntry)))
  );
}

// ─── Location & Company Settings ──────────────────────────────────────────────

export function subscribeToLocationSettings(callback: (s: LocationSettings | null) => void) {
  return onSnapshot(doc(db, 'settings', 'locationSettings'), snap =>
    callback(snap.exists() ? (snap.data() as LocationSettings) : null)
  );
}

export async function saveLocationSettings(settings: LocationSettings): Promise<void> {
  const data: Record<string, unknown> = {
    enabled: settings.enabled,
    lat: settings.lat,
    lng: settings.lng,
    radiusMeters: settings.radiusMeters,
  };
  if (settings.address) data.address = settings.address;
  await setDoc(doc(db, 'settings', 'locationSettings'), data);
}

export function subscribeToCompanySettings(callback: (s: CompanySettings | null) => void) {
  return onSnapshot(doc(db, 'settings', 'companySettings'), snap =>
    callback(snap.exists() ? (snap.data() as CompanySettings) : null)
  );
}

export async function saveCompanySettings(
  companyName: string,
  userId: string,
  userName: string
): Promise<void> {
  await setDoc(doc(db, 'settings', 'companySettings'), {
    companyName,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  });
  addDoc(collection(db, 'auditLog'), {
    timestamp: serverTimestamp(),
    userId,
    userName,
    action: 'settings_change',
    notes: `Company name set to "${companyName}"`,
  }).catch(e => console.warn('Audit log write failed:', e));
}

// ─── User / Employee Management ───────────────────────────────────────────────

export function subscribeToUsers(callback: (users: AppUser[]) => void) {
  return onSnapshot(collection(db, 'users'), snap =>
    callback(
      snap.docs
        .map(d => ({ ...d.data(), uid: d.id } as AppUser))
        .sort((a, b) => {
          const lastName = (n: string) => n.trim().split(/\s+/).pop() ?? n;
          return lastName(a.name).localeCompare(lastName(b.name));
        })
    )
  );
}

export async function updateUserName(uid: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { name });
}

export async function updateUserRole(uid: string, role: UserRole): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { role });
}

export async function setUserActive(uid: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { active });
}

export async function setUserCanQC(uid: string, canQC: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { canQC });
}

export async function setUserBonusEligible(uid: string, bonusEligible: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { bonusEligible });
}

export async function setUserManagerBonus(uid: string, managerBonus: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { managerBonus });
}

export async function setUserBasePayOnly(uid: string, basePayOnly: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { basePayOnly });
}

export async function updateCartDetails(
  cartId: string,
  data: {
    newVin?: string;
    model?: string;
    shellColor?: string;
    seatColor?: string;
    dealerId?: string;
    dealerName?: string;
  }
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (data.newVin !== undefined)    updates.newVin     = data.newVin;
  if (data.model !== undefined)     updates.model      = data.model;
  if (data.shellColor !== undefined) updates.shellColor = data.shellColor;
  if (data.seatColor !== undefined)  updates.seatColor  = data.seatColor;
  if (data.dealerId !== undefined)   updates.dealerId   = data.dealerId;
  if (data.dealerName !== undefined) updates.dealerName = data.dealerName;
  await updateDoc(doc(db, 'carts', cartId), updates);
}

// ─── Time Tracking ─────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function toTimeRecord(id: string, data: Record<string, unknown>): TimeRecord {
  const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate();
    return new Date(v as string);
  };
  return {
    id,
    userId:          data.userId as string,
    userName:        data.userName as string,
    clockIn:         toDate(data.clockIn) as Date,
    clockOut:        toDate(data.clockOut),
    durationMinutes: data.durationMinutes != null ? Number(data.durationMinutes) : null,
    date:            data.date as string,
    adjustedBy:      data.adjustedBy as string | undefined,
    adjustedByName:  data.adjustedByName as string | undefined,
    adjustNotes:     data.adjustNotes as string | undefined,
  };
}

/** Clock in — creates a time record and a clockSessions doc for real-time status */
export async function clockIn(userId: string, userName: string): Promise<string> {
  const now  = new Date();
  const docRef = await addDoc(collection(db, 'timeRecords'), {
    userId,
    userName,
    clockIn:         Timestamp.fromDate(now),
    clockOut:        null,
    durationMinutes: null,
    date:            todayStr(),
  });
  await setDoc(doc(db, 'clockSessions', userId), {
    recordId: docRef.id,
    clockIn:  Timestamp.fromDate(now),
  });
  return docRef.id;
}

/** Clock out — closes the open record and removes the clockSessions doc */
export async function clockOut(recordId: string, userId: string): Promise<void> {
  const now = new Date();
  const sessionRef = doc(db, 'clockSessions', userId);
  const snap = await getDoc(doc(db, 'timeRecords', recordId));

  // Clean up orphaned session and bail if the underlying record is gone/invalid
  if (!snap.exists()) { await deleteDoc(sessionRef); return; }
  if (snap.data().userId !== userId) { await deleteDoc(sessionRef); return; }
  if (snap.data().clockOut != null) { await deleteDoc(sessionRef); return; }

  const clockInTime = snap.data().clockIn?.toDate?.() ?? new Date();
  const durationMinutes = Math.round((now.getTime() - clockInTime.getTime()) / 60000);

  await updateDoc(doc(db, 'timeRecords', recordId), {
    clockOut:        Timestamp.fromDate(now),
    durationMinutes,
  });
  await deleteDoc(sessionRef);
}

/** Clock out every user who is currently clocked in — returns the count closed */
export async function clockOutAll(): Promise<number> {
  const sessions = await getDocs(collection(db, 'clockSessions'));
  if (sessions.empty) return 0;
  const results = await Promise.allSettled(
    sessions.docs.map(s => clockOut(s.data().recordId as string, s.id))
  );
  return results.filter(r => r.status === 'fulfilled').length;
}

/**
 * Force-clock-out a specific user (manager action).
 * Closes ALL open timeRecords for that user regardless of clockSessions state.
 * Handles orphaned records where clockSessions doc is missing or points to wrong record.
 */
export async function forceClockOutUser(userId: string): Promise<void> {
  const now = new Date();
  const openSnap = await getDocs(query(
    collection(db, 'timeRecords'),
    where('userId', '==', userId),
    where('clockOut', '==', null)
  ));

  if (!openSnap.empty) {
    const batch = writeBatch(db);
    openSnap.docs.forEach(d => {
      const clockInTime = d.data().clockIn?.toDate?.() ?? now;
      const durationMinutes = Math.round((now.getTime() - clockInTime.getTime()) / 60000);
      batch.update(d.ref, { clockOut: Timestamp.fromDate(now), durationMinutes });
    });
    await batch.commit();
  }

  // Always clean up the clockSessions doc regardless of whether a record was open
  await deleteDoc(doc(db, 'clockSessions', userId));
}

/** Real-time listener for current user's open clock-in (null = not clocked in) */
export function subscribeToClockSession(
  userId: string,
  callback: (session: { recordId: string; clockIn: Date } | null) => void
) {
  return onSnapshot(doc(db, 'clockSessions', userId), snap => {
    if (!snap.exists()) { callback(null); return; }
    const d = snap.data();
    callback({
      recordId: d.recordId as string,
      clockIn:  d.clockIn?.toDate?.() ?? new Date(d.clockIn),
    });
  });
}

/** Real-time listener for time records in a date range */
export function subscribeToTimeRecords(
  callback: (records: TimeRecord[]) => void,
  startDate: Date,
  endDate: Date
) {
  const start = startDate.toISOString().slice(0, 10);
  const end   = endDate.toISOString().slice(0, 10);
  const q = query(
    collection(db, 'timeRecords'),
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date', 'desc'),
    orderBy('clockIn', 'desc')
  );
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => toTimeRecord(d.id, d.data() as Record<string, unknown>)))
  );
}

/** Add a manual time entry (manager) */
export async function addManualTimeEntry(data: {
  userId: string;
  userName: string;
  clockIn: Date;
  clockOut: Date;
  addedBy: string;
  addedByName: string;
  notes?: string;
}): Promise<void> {
  const durationMinutes = Math.round((data.clockOut.getTime() - data.clockIn.getTime()) / 60000);
  await addDoc(collection(db, 'timeRecords'), {
    userId:          data.userId,
    userName:        data.userName,
    clockIn:         Timestamp.fromDate(data.clockIn),
    clockOut:        Timestamp.fromDate(data.clockOut),
    durationMinutes,
    date:            data.clockIn.toISOString().slice(0, 10),
    adjustedBy:      data.addedBy,
    adjustedByName:  data.addedByName,
    adjustNotes:     data.notes ?? 'Manual entry',
  });
}

/** Adjust an existing time record (manager) */
export async function adjustTimeRecord(
  recordId: string,
  clockIn: Date,
  clockOut: Date | null,
  notes: string,
  managerUid: string,
  managerName: string
): Promise<void> {
  const durationMinutes = clockOut
    ? Math.round((clockOut.getTime() - clockIn.getTime()) / 60000)
    : null;
  await updateDoc(doc(db, 'timeRecords', recordId), {
    clockIn:         Timestamp.fromDate(clockIn),
    clockOut:        clockOut ? Timestamp.fromDate(clockOut) : null,
    durationMinutes,
    date:            clockIn.toISOString().slice(0, 10),
    adjustedBy:      managerUid,
    adjustedByName:  managerName,
    adjustNotes:     notes,
  });
}

/** Delete a time record (manager) */
export async function deleteTimeRecord(recordId: string): Promise<void> {
  await deleteDoc(doc(db, 'timeRecords', recordId));
}

/** Fetch a single time record by ID */
export async function getTimeRecord(recordId: string): Promise<TimeRecord | null> {
  const snap = await getDoc(doc(db, 'timeRecords', recordId));
  if (!snap.exists()) return null;
  return toTimeRecord(snap.id, snap.data() as Record<string, unknown>);
}

// ─── Time Audit Flags ──────────────────────────────────────────────────────────

const OPEN_SHIFT_THRESHOLD_HOURS = 10;
const LONG_SHIFT_THRESHOLD_HOURS = 10;
const NO_LUNCH_THRESHOLD_HOURS   = 6;
const STANDARD_END_HOUR          = 17; // 5:00 PM

function toAuditFlag(id: string, data: Record<string, unknown>): AuditFlag {
  const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate();
    return new Date(v as string);
  };
  return {
    id,
    type:              data.type as AuditFlagType,
    userId:            data.userId as string,
    userName:          data.userName as string,
    date:              data.date as string,
    recordId:          data.recordId as string,
    relatedRecordId:   data.relatedRecordId as string | undefined,
    suggestedClockOut: toDate(data.suggestedClockOut),
    detectedAt:        toDate(data.detectedAt) as Date,
    status:            data.status as AuditFlagStatus,
    resolvedAt:        toDate(data.resolvedAt) ?? undefined,
    resolvedBy:        data.resolvedBy as string | undefined,
    resolvedByName:    data.resolvedByName as string | undefined,
    resolveNotes:      data.resolveNotes as string | undefined,
    confirmedAbsent:   data.confirmedAbsent as boolean | undefined,
  };
}

/** Real-time listener for audit flags, optionally filtered by status */
export function subscribeToAuditFlags(
  callback: (flags: AuditFlag[]) => void,
  status: AuditFlagStatus | 'all' = 'pending',
  onError?: () => void
) {
  const q = status === 'all'
    ? query(collection(db, 'auditFlags'), orderBy('detectedAt', 'desc'))
    : query(collection(db, 'auditFlags'), where('status', '==', status), orderBy('detectedAt', 'desc'));
  return onSnapshot(
    q,
    snap => callback(snap.docs.map(d => toAuditFlag(d.id, d.data() as Record<string, unknown>))),
    _err => { onError?.(); }
  );
}

/** Resolve a flag — applies the corrected clockIn/clockOut to the time record */
export async function resolveAuditFlag(
  flag: AuditFlag,
  clockIn: Date,
  clockOut: Date | null,
  notes: string,
  managerUid: string,
  managerName: string
): Promise<void> {
  const batch = writeBatch(db);

  const durationMinutes = clockOut
    ? Math.round((clockOut.getTime() - clockIn.getTime()) / 60000)
    : null;

  batch.update(doc(db, 'timeRecords', flag.recordId), {
    clockIn:         Timestamp.fromDate(clockIn),
    clockOut:        clockOut ? Timestamp.fromDate(clockOut) : null,
    durationMinutes,
    date:            clockIn.toISOString().slice(0, 10),
    adjustedBy:      managerUid,
    adjustedByName:  managerName,
    adjustNotes:     notes,
  });

  batch.update(doc(db, 'auditFlags', flag.id), {
    status:         'resolved' as AuditFlagStatus,
    resolvedAt:     serverTimestamp(),
    resolvedBy:     managerUid,
    resolvedByName: managerName,
    resolveNotes:   notes,
  });

  await batch.commit();
}

/** Dismiss a flag without making time record changes */
export async function dismissAuditFlag(
  flagId: string,
  managerUid: string,
  managerName: string,
  notes: string
): Promise<void> {
  await updateDoc(doc(db, 'auditFlags', flagId), {
    status:         'dismissed' as AuditFlagStatus,
    resolvedAt:     serverTimestamp(),
    resolvedBy:     managerUid,
    resolvedByName: managerName,
    resolveNotes:   notes,
  });
}

/** Resolve an absent_unconfirmed flag by creating a time record for the worker */
export async function resolveAbsentFlag(
  flag: AuditFlag,
  clockIn: Date,
  clockOut: Date,
  notes: string,
  managerUid: string,
  managerName: string
): Promise<void> {
  const durationMinutes = Math.round((clockOut.getTime() - clockIn.getTime()) / 60000);
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'timeRecords')), {
    userId:          flag.userId,
    userName:        flag.userName,
    clockIn:         Timestamp.fromDate(clockIn),
    clockOut:        Timestamp.fromDate(clockOut),
    durationMinutes,
    date:            flag.date,
    adjustedBy:      managerUid,
    adjustedByName:  managerName,
    adjustNotes:     notes || 'Added via Time Auditor — manager confirmed worker was present',
  });
  batch.update(doc(db, 'auditFlags', flag.id), {
    status:         'resolved' as AuditFlagStatus,
    resolvedAt:     serverTimestamp(),
    resolvedBy:     managerUid,
    resolvedByName: managerName,
    resolveNotes:   notes || 'Worker was present — time record created',
    confirmedAbsent: false,
  });
  await batch.commit();
}

/** Confirm a worker was genuinely absent — marks flag resolved with no time record */
export async function confirmAbsent(
  flagId: string,
  managerUid: string,
  managerName: string,
  notes: string
): Promise<void> {
  await updateDoc(doc(db, 'auditFlags', flagId), {
    status:          'resolved' as AuditFlagStatus,
    resolvedAt:      serverTimestamp(),
    resolvedBy:      managerUid,
    resolvedByName:  managerName,
    resolveNotes:    notes || 'Confirmed absent',
    confirmedAbsent: true,
  });
}

/** Returns the Monday–Sunday bounds of the previous complete work week */
export function getLastWeekBounds(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon…
  // Last Monday = today minus (dayOfWeek + 6) days, mod 7
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - daysToLastMonday - 7);
  lastMonday.setHours(0, 0, 0, 0);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  lastSunday.setHours(23, 59, 59, 999);
  const label = `${lastMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${lastSunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return { start: lastMonday, end: lastSunday, label };
}

/** Client-side audit runner — schedule-aware, runs on demand.
 *  Pass a custom range to audit a specific period (e.g. last week).
 *  Defaults to the last 3 days. */
export async function runClientAudit(range?: { start: Date; end: Date }): Promise<{ created: number; skipped: number }> {
  const now = new Date();

  let lookback: Date;
  let endDate: Date;

  if (range) {
    lookback = range.start;
    endDate  = range.end;
  } else {
    lookback = new Date(now);
    lookback.setDate(now.getDate() - 3);
    endDate = now;
  }

  const lookbackStr = lookback.toISOString().slice(0, 10);
  const ceilingDate = endDate < now ? endDate : now;
  const todayStr    = now.toISOString().slice(0, 10);
  const ceilingStr  = ceilingDate.toISOString().slice(0, 10);
  const endStr      = endDate.toISOString().slice(0, 10);

  const [recordsSnap, flagsSnap, usersSnap, scheduleSnap, holidaysSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'timeRecords'),
      where('date', '>=', lookbackStr),
      where('date', '<=', endStr)
    )),
    getDocs(query(
      collection(db, 'auditFlags'),
      where('status', '==', 'pending')
    )),
    getDocs(collection(db, 'users')),
    getDoc(doc(db, 'settings', 'workSchedule')),
    getDocs(collection(db, 'holidays')),
  ]);

  // ── Parse schedule & holidays ─────────────────────────────────────────────
  const schedule: WorkSchedule = scheduleSnap.exists()
    ? (scheduleSnap.data() as WorkSchedule)
    : DEFAULT_WORK_SCHEDULE;

  const holidayDates = new Set<string>();
  holidaysSnap.forEach(d => holidayDates.add(d.data().date as string));

  const earlyThresholdMins = schedule.shiftStartHour * 60 - schedule.earlyToleranceMinutes;
  const workDaySet         = new Set<number>(schedule.workDays);

  // ── Build existing-flag index ─────────────────────────────────────────────
  const alreadyFlagged = new Set<string>();
  flagsSnap.forEach(d => {
    alreadyFlagged.add(`${d.data().type}:${d.data().recordId}`);
    if (d.data().relatedRecordId) {
      alreadyFlagged.add(`${d.data().type}:${d.data().relatedRecordId}`);
    }
  });

  interface RawRecord {
    id: string; userId: string; userName: string;
    clockIn: Timestamp; clockOut: Timestamp | null;
    date: string;
  }

  // Build a set of user IDs to exclude from all checks:
  // inactive users and administration role don't participate in time tracking
  const excludedUserIds = new Set<string>();
  usersSnap.forEach(d => {
    const active = d.data().active as boolean;
    const role   = d.data().role   as string;
    if (!active || role === 'administration') excludedUserIds.add(d.id);
  });

  const allRecords: RawRecord[] = recordsSnap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<RawRecord, 'id'>),
  }));

  // Only audit records belonging to tracked workers
  const records = allRecords.filter(r => !excludedUserIds.has(r.userId));

  const byUser = new Map<string, RawRecord[]>();
  for (const r of records) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push(r);
  }

  // Dates where at least one tracked worker clocked in — for weekend/holiday absent logic
  const datesWithActivity = new Set<string>(records.map(r => r.date));

  const batch = writeBatch(db);
  let created = 0;
  let skipped = 0;

  const addFlag = (type: AuditFlagType, record: RawRecord, extra: Record<string, unknown> = {}) => {
    const key = `${type}:${record.id}`;
    if (alreadyFlagged.has(key)) { skipped++; return; }
    batch.set(doc(collection(db, 'auditFlags')), {
      type, userId: record.userId, userName: record.userName,
      date: record.date, recordId: record.id,
      detectedAt: serverTimestamp(), status: 'pending', ...extra,
    });
    created++;
  };

  for (const record of records) {
    const clockInDate  = record.clockIn.toDate();
    const clockOutDate = record.clockOut?.toDate() ?? null;
    const clockInMins  = clockInDate.getHours() * 60 + clockInDate.getMinutes();

    // ── Open shift ────────────────────────────────────────────────────────────
    if (!clockOutDate) {
      const ageHours = (now.getTime() - clockInDate.getTime()) / 3_600_000;
      if (ageHours >= OPEN_SHIFT_THRESHOLD_HOURS) {
        const suggested = new Date(clockInDate);
        // Clocked in before 1 PM → suggest end of shift; otherwise → +4 hrs
        if (clockInDate.getHours() < 13) {
          suggested.setHours(schedule.shiftEndHour, 0, 0, 0);
        } else {
          suggested.setTime(clockInDate.getTime() + 4 * 3_600_000);
        }
        const suggestedTs = suggested > clockInDate
          ? Timestamp.fromDate(suggested)
          : Timestamp.fromDate(new Date(clockInDate.getTime() + 4 * 3_600_000));
        addFlag('open_shift', record, { suggestedClockOut: suggestedTs });
      }
      continue;
    }

    const durationMs    = clockOutDate.getTime() - clockInDate.getTime();
    const durationHours = durationMs / 3_600_000;
    const durationMins  = durationMs / 60_000;

    // ── Invalid times (clockOut ≤ clockIn) ───────────────────────────────────
    if (durationMs <= 0) {
      addFlag('invalid_times', record);
      continue;
    }

    // ── Short punch (<5 min) ─────────────────────────────────────────────────
    if (durationMins < 5) {
      addFlag('short_punch', record);
      continue;
    }

    // Schedule-aware flags only apply on required work days (not optional weekend shifts)
    const isRequiredWorkDay = workDaySet.has(clockInDate.getDay());

    // ── Early clock-in (before tolerance window) ──────────────────────────────
    if (isRequiredWorkDay && clockInMins < earlyThresholdMins) {
      const hh = String(clockInDate.getHours()).padStart(2, '0');
      const mm = String(clockInDate.getMinutes()).padStart(2, '0');
      addFlag('early_clockin', record, { clockInTime: `${hh}:${mm}` });
    }

    // ── Suspicious overtime (clocked out after OT cutoff) ─────────────────────
    if (isRequiredWorkDay && clockOutDate.getHours() >= schedule.overtimeCutoffHour) {
      const hh = String(clockOutDate.getHours()).padStart(2, '0');
      const mm = String(clockOutDate.getMinutes()).padStart(2, '0');
      addFlag('suspicious_overtime', record, { clockOutTime: `${hh}:${mm}` });
    }

    // ── Long shift (>10 hrs) ──────────────────────────────────────────────────
    if (durationHours > LONG_SHIFT_THRESHOLD_HOURS) {
      addFlag('long_shift', record);
    }

    // ── No lunch — shift >6 hrs spanning the lunch window with no break record ─
    if (durationHours > NO_LUNCH_THRESHOLD_HOURS) {
      const spansLunch = clockInDate.getHours() < schedule.lunchEndHour
        && clockOutDate.getHours() > schedule.lunchStartHour;
      const sameDay = (byUser.get(record.userId) ?? []).filter(r => r.date === record.date && r.id !== record.id);
      if (spansLunch && sameDay.length === 0) addFlag('no_lunch', record);
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
          batch.set(doc(collection(db, 'auditFlags')), {
            type: 'overlapping', userId: a.userId, userName: a.userName,
            date: a.date, recordId: a.id, relatedRecordId: b.id,
            detectedAt: serverTimestamp(), status: 'pending',
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

  interface ActiveUser { uid: string; name: string; }
  const activeUsers: ActiveUser[] = usersSnap.docs
    .map(d => ({ uid: d.id, name: d.data().name as string, active: d.data().active as boolean, role: d.data().role as string }))
    .filter(u => u.active && !['administration', 'manager', 'owner'].includes(u.role));

  const daysToCheck: string[] = [];
  const cursor = new Date(lookback);
  while (cursor.toISOString().slice(0, 10) <= ceilingStr && cursor.toISOString().slice(0, 10) < todayStr) {
    const dateStr   = cursor.toISOString().slice(0, 10);
    const dayOfWeek = cursor.getDay();
    const isWorkDay = workDaySet.has(dayOfWeek);
    const isHoliday = holidayDates.has(dateStr);

    // Flag absent only on required work days — weekend/optional shifts never trigger absence for others
    if (isWorkDay && !isHoliday) {
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
      batch.set(doc(collection(db, 'auditFlags')), {
        type:       'absent_unconfirmed',
        userId:     user.uid,
        userName:   user.name,
        date:       dateStr,
        recordId:   syntheticId,
        detectedAt: serverTimestamp(),
        status:     'pending',
      });
      created++;
    }
  }

  if (created > 0) await batch.commit();
  return { created, skipped };
}

// ─── Work Schedule ────────────────────────────────────────────────────────────

/** Fetch the current work schedule from Firestore (falls back to defaults) */
export async function getWorkSchedule(): Promise<WorkSchedule> {
  const snap = await getDoc(doc(db, 'settings', 'workSchedule'));
  return snap.exists() ? (snap.data() as WorkSchedule) : { ...DEFAULT_WORK_SCHEDULE };
}

/** Persist the work schedule to Firestore */
export async function saveWorkSchedule(
  schedule: Omit<WorkSchedule, 'updatedAt' | 'updatedBy'>,
  uid: string,
  userName: string
): Promise<void> {
  await setDoc(doc(db, 'settings', 'workSchedule'), {
    ...schedule,
    updatedAt: serverTimestamp(),
    updatedBy: userName,
  });
  await addDoc(collection(db, 'auditLog'), {
    timestamp:  serverTimestamp(),
    userId:     uid,
    userName,
    action:     'settings_change',
    notes:      'Work schedule updated',
  });
}

// ─── Holidays ─────────────────────────────────────────────────────────────────

/** Subscribe to the holidays collection */
export function subscribeToHolidays(
  cb: (holidays: Holiday[]) => void
): () => void {
  return onSnapshot(
    query(collection(db, 'holidays'), orderBy('date', 'asc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Holiday, 'id'>) }))),
    () => cb([])
  );
}

/** Add a holiday */
export async function addHoliday(
  date: string,
  name: string,
  uid: string
): Promise<void> {
  await addDoc(collection(db, 'holidays'), {
    date,
    name,
    createdAt: serverTimestamp(),
    createdBy: uid,
  });
}

/** Delete a holiday */
export async function deleteHoliday(holidayId: string): Promise<void> {
  await deleteDoc(doc(db, 'holidays', holidayId));
}

// ─── User Management ──────────────────────────────────────────────────────────

/** Permanently delete a user's Firestore profile.
 *  Only safe to call on inactive users — their Firebase Auth account remains
 *  but they will be unable to use the app without a Firestore profile. */
export async function deleteAppUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid));
}
