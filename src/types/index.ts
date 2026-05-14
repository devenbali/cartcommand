// ─── Roles ────────────────────────────────────────────────────────────────────

export type UserRole = 'worker' | 'administration' | 'manager' | 'owner';

// ─── Cart Enums ───────────────────────────────────────────────────────────────

export type CartModel = 'ECO2' | 'ECO4' | 'ECO6' | 'LIFTED4' | 'LIFTED6' | 'F4';

export type ShellColor = 'Red' | 'White' | 'Blue' | 'Black' | 'Matte Grey' | 'Cloud Blue' | 'Burgundy' | 'Silver';

export type SeatColor = 'Brown' | 'Black' | 'Grey';

export type CartStatus = 'intake' | 'built' | 'painted' | 'in_queue' | 'qc_pass' | 'qc_fail' | 'ready_to_ship' | 'shipped' | 'incomplete';

// ─── Firestore Documents ──────────────────────────────────────────────────────

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  canQC?: boolean;
  bonusEligible?: boolean;
  basePayOnly?: boolean;
  managerBonus?: boolean;
  createdAt: Date;
}

export interface Cart {
  id: string;
  vin: string;
  vinPhotoUrl: string;
  model: CartModel;
  shellColor: ShellColor;
  seatColor: SeatColor;
  dealerId: string;
  dealerName: string;
  status: CartStatus;
  qcNotes?: string;
  qcFailReason?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  createdByName: string;
  builtAt?: Date;
  builtBy?: string;
  paintedAt?: Date;
  paintedBy?: string;
  queuedAt?: Date;
  queuedBy?: string;
  qcPassedAt?: Date;
  qcPassedBy?: string;
  qcFailedAt?: Date;
  qcFailedBy?: string;
  readyToShipAt?: Date;
  readyToShipBy?: string;
  newVin?: string;         // Corrected VIN — original vin becomes the legacy VIN
  repairNotes?: string;    // Description of missing parts or repairs needed (for incomplete status)
  incompleteAt?: Date;
  incompleteBy?: string;
  shippingDate?: string;   // ISO date string — user-scheduled ship date
  shippedAt?: Date;
  shippedBy?: string;
  /** Set to true by the Cloud Function after BOM deduction completes */
  bomDeducted?: boolean;
  bomDeductedAt?: Date;
}

export type InventoryCategory = 'frame' | 'tire' | 'shell' | 'seat';

export interface InventoryItem {
  id: string;
  category: InventoryCategory;
  name: string;
  quantityOnHand: number;
  minimumStockLevel: number;
  lastUpdatedAt: Date;
  lastUpdatedBy: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  action: 'inventory_deduction' | 'inventory_update' | 'cart_status_change' | 'settings_change' | 'scrap_logged';
  itemId?: string;
  itemName?: string;
  fromValue?: number;
  toValue?: number;
  cartVin?: string;
  notes?: string;
}

export interface ScrapLogEntry {
  id: string;
  date: Date;
  loggedBy: string;
  loggedByName: string;
  itemName: string;
  partNumber?: string;
  problemInfo: string;
  quantity: number;
  photoUrl?: string;
  associatedVin?: string;
}

export interface Dealer {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export interface PayrollTier {
  cartsPerMonth: number;
  ratePerCart: number;
  poolTotal: number;
  monthlyPerMan: number;
  hourlyEquivalent: number;
  annualPay: number;
}

export const PAYROLL_TIERS: PayrollTier[] = [
  { cartsPerMonth: 120, ratePerCart: 225, poolTotal: 27000, monthlyPerMan: 2455, hourlyEquivalent: 15, annualPay: 31909 },
  { cartsPerMonth: 140, ratePerCart: 250, poolTotal: 35000, monthlyPerMan: 3182, hourlyEquivalent: 20, annualPay: 41364 },
  { cartsPerMonth: 160, ratePerCart: 300, poolTotal: 48000, monthlyPerMan: 4364, hourlyEquivalent: 27, annualPay: 56727 },
  { cartsPerMonth: 180, ratePerCart: 325, poolTotal: 58500, monthlyPerMan: 5318, hourlyEquivalent: 33, annualPay: 69136 },
  { cartsPerMonth: 200, ratePerCart: 350, poolTotal: 70000, monthlyPerMan: 6364, hourlyEquivalent: 40, annualPay: 82727 },
];

/** Returns the tier that applies for a given monthly cart count (nearest tier at or below) */
export function getPayrollTier(cartsThisMonth: number, assemblerCount: number): {
  tier: PayrollTier | null;
  bonusPool: number;
  perMan: number;
} {
  const sorted = [...PAYROLL_TIERS].sort((a, b) => b.cartsPerMonth - a.cartsPerMonth);
  const tier = sorted.find(t => cartsThisMonth >= t.cartsPerMonth) ?? null;
  if (!tier) return { tier: null, bonusPool: 0, perMan: 0 };
  const bonusPool = cartsThisMonth * tier.ratePerCart;
  const perMan = assemblerCount > 0 ? bonusPool / assemblerCount : 0;
  return { tier, bonusPool, perMan };
}

export const BASE_WEEKLY_PAY = 550;
export const MANAGER_BONUS = 100;
export const BASE_HOURS = 40;

/** Weekly cart tiers (cartsPerWeek = cartsPerMonth / 4) */
export const WEEKLY_TIERS = [
  { cartsPerWeek: 30, ratePerCart: 225 },
  { cartsPerWeek: 35, ratePerCart: 250 },
  { cartsPerWeek: 40, ratePerCart: 300 },
  { cartsPerWeek: 45, ratePerCart: 325 },
  { cartsPerWeek: 50, ratePerCart: 350 },
];

export interface WorkerPayInput {
  uid: string;
  name: string;
  hours: number;
  managerBonus: boolean;
  /** Base-pay-only workers receive prorated base but no bonus share */
  basePayOnly: boolean;
}

export interface WorkerPayResult extends WorkerPayInput {
  basePay: number;
  bonus: number;
  totalPay: number;
}

export function calcWeeklyPay(
  cartsThisWeek: number,
  workers: WorkerPayInput[]
): { ratePerCart: number; weeklyPool: number; bonusPool: number; results: WorkerPayResult[] } {
  const sorted = [...WEEKLY_TIERS].sort((a, b) => b.cartsPerWeek - a.cartsPerWeek);
  const tier = sorted.find(t => cartsThisWeek >= t.cartsPerWeek);
  const ratePerCart = tier?.ratePerCart ?? 0;
  const weeklyPool = cartsThisWeek * ratePerCart;

  // All participating workers' base is deducted from pool
  const totalBase = workers.reduce((sum, w) => {
    return sum + Math.min(w.hours / BASE_HOURS, 1) * BASE_WEEKLY_PAY + (w.managerBonus ? MANAGER_BONUS : 0);
  }, 0);

  const bonusPool = Math.max(weeklyPool - totalBase, 0);

  // Only bonus-eligible workers (not base-pay-only) share the bonus pool
  const bonusWorkers = workers.filter(w => !w.basePayOnly);
  const bonusHours = bonusWorkers.reduce((sum, w) => sum + w.hours, 0);

  const results: WorkerPayResult[] = workers.map(w => {
    const basePay = Math.min(w.hours / BASE_HOURS, 1) * BASE_WEEKLY_PAY + (w.managerBonus ? MANAGER_BONUS : 0);
    const bonus = w.basePayOnly ? 0 : bonusHours > 0 ? (w.hours / bonusHours) * bonusPool : 0;
    return { ...w, basePay, bonus, totalPay: basePay + bonus };
  });

  return { ratePerCart, weeklyPool, bonusPool, results };
}

// ─── Time Tracking ────────────────────────────────────────────────────────────

export interface TimeRecord {
  id: string;
  userId: string;
  userName: string;
  clockIn: Date;
  clockOut: Date | null;
  durationMinutes: number | null;
  date: string; // YYYY-MM-DD
  adjustedBy?: string;
  adjustedByName?: string;
  adjustNotes?: string;
}

export interface ClockSession {
  recordId: string;
  clockIn: Date;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const CART_MODELS: CartModel[] = ['ECO2', 'ECO4', 'ECO6', 'LIFTED4', 'LIFTED6', 'F4'];

export const CART_MODEL_LABELS: Record<CartModel, string> = {
  ECO2: 'ECO 2',
  ECO4: 'ECO 4',
  ECO6: 'ECO 6',
  LIFTED4: 'LIFTED 4',
  LIFTED6: 'LIFTED 6',
  F4: 'F4',
};

export const SHELL_COLORS: ShellColor[] = [
  'Red', 'White', 'Blue', 'Black', 'Matte Grey', 'Cloud Blue', 'Burgundy', 'Silver',
];

export const SEAT_COLORS: SeatColor[] = ['Brown', 'Black', 'Grey'];

export const CART_STATUS_LABELS: Record<CartStatus, string> = {
  intake: 'Intake',
  built: 'Built',
  painted: 'Painted',
  in_queue: 'In Queue',
  qc_pass: 'QC Pass',
  qc_fail: 'QC Fail',
  ready_to_ship: 'Ready to Ship',
  shipped: 'Shipped',
  incomplete: 'Incomplete / Repair',
};

export const STATUS_ORDER: CartStatus[] = [
  'intake', 'built', 'in_queue', 'qc_pass', 'qc_fail', 'painted', 'ready_to_ship', 'shipped', 'incomplete',
];

// ─── Time Audit Flags ─────────────────────────────────────────────────────────

export type AuditFlagType =
  | 'open_shift'           // no clock-out, shift is still open
  | 'no_lunch'             // worked >6 hrs with no break
  | 'long_shift'           // total duration >10 hrs
  | 'overlapping'          // two records overlap for same user
  | 'absent_unconfirmed'   // no records for the day — needs manager confirmation
  | 'short_punch'          // clocked in/out in <5 min — likely accidental
  | 'invalid_times'        // clockOut is before or equal to clockIn — data corruption
  | 'early_clockin'        // clocked in before tolerance window (default: before 7:45 AM)
  | 'suspicious_overtime'; // clocked out after overtime cutoff (default: 9 PM weekday)

export type AuditFlagStatus = 'pending' | 'resolved' | 'dismissed';

export interface AuditFlag {
  id: string;
  type: AuditFlagType;
  userId: string;
  userName: string;
  date: string;                    // YYYY-MM-DD
  recordId: string;                // timeRecord ID, or synthetic key for absent_unconfirmed
  relatedRecordId?: string;        // for overlapping — the second record
  suggestedClockOut?: Date | null; // for open_shift — system guess
  clockInTime?: string;            // HH:MM — for early_clockin display
  clockOutTime?: string;           // HH:MM — for suspicious_overtime display
  detectedAt: Date;
  status: AuditFlagStatus;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolvedByName?: string;
  resolveNotes?: string;
  confirmedAbsent?: boolean;       // for absent_unconfirmed — true = manager confirmed not present
  aiExplanation?: string;          // AI-generated plain-English explanation
}

// ─── Work Schedule ────────────────────────────────────────────────────────────

export interface WorkSchedule {
  shiftStartHour: number;       // 8 = 8:00 AM
  shiftEndHour: number;         // 17 = 5:00 PM
  lunchStartHour: number;       // 11 = 11:00 AM (earliest lunch starts)
  lunchEndHour: number;         // 14 = 2:00 PM (latest lunch ends)
  earlyToleranceMinutes: number; // minutes before shift start before flagging (15 = flag before 7:45)
  overtimeCutoffHour: number;   // 21 = 9:00 PM
  workDays: number[];            // [1,2,3,4,5] = Mon–Fri (0=Sun, 6=Sat)
  updatedAt?: Date;
  updatedBy?: string;
}

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  shiftStartHour:        8,
  shiftEndHour:          17,
  lunchStartHour:        11,
  lunchEndHour:          14,
  earlyToleranceMinutes: 15,
  overtimeCutoffHour:    21,
  workDays:              [1, 2, 3, 4, 5],
};

// ─── Holidays ─────────────────────────────────────────────────────────────────

export interface Holiday {
  id: string;
  date: string;   // YYYY-MM-DD
  name: string;
  createdAt?: Date;
  createdBy?: string;
}

// ─── Location Settings ────────────────────────────────────────────────────────

export interface LocationSettings {
  enabled: boolean;
  lat: number;
  lng: number;
  radiusMeters: number;
  address?: string;
}

// ─── Company Settings ─────────────────────────────────────────────────────────

export interface CompanySettings {
  companyName: string;
  updatedAt?: Date;
  updatedBy?: string;
}
