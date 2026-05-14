// Standalone BOM engine for Cloud Functions — mirrors src/lib/bom.ts

export type CartModel   = 'ECO2' | 'ECO4' | 'ECO6' | 'LIFTED4' | 'LIFTED6' | 'F4';
export type ShellColor  = 'Red' | 'White' | 'Blue' | 'Black' | 'Matte Grey' | 'Cloud Blue' | 'Burgundy';
export type SeatColor   = 'Brown' | 'Black' | 'Grey';

export interface BOMDeduction {
  itemName: string;
  quantity: number;
}

export function calculateBOM(cart: {
  model: CartModel;
  shellColor: ShellColor;
  seatColor: SeatColor;
}): BOMDeduction[] {
  const deductions: BOMDeduction[] = [];
  const { model, shellColor: sc, seatColor: seat } = cart;

  // ── Frame ──────────────────────────────────────────────────────────────────
  const frameNames: Record<CartModel, string> = {
    ECO2:    'Frame: Eco 2',
    ECO4:    'Frame: Eco 4',
    ECO6:    'Frame: Eco 6',
    LIFTED4: 'Frame: Lifted 4',
    LIFTED6: 'Frame: Lifted 6',
    F4:      'Frame: F4',
  };
  deductions.push({ itemName: frameNames[model], quantity: 1 });

  // ── Tires (always 4) ───────────────────────────────────────────────────────
  const tireNames: Record<CartModel, string> = {
    ECO2:    'Tire: Eco',
    ECO4:    'Tire: Eco',
    ECO6:    'Tire: Eco',
    LIFTED4: 'Tire: Lifted',
    LIFTED6: 'Tire: Lifted',
    F4:      'Tire: F4',
  };
  deductions.push({ itemName: tireNames[model], quantity: 4 });

  // ── Painted Shells ─────────────────────────────────────────────────────────
  deductions.push({ itemName: `Shell: Front (${sc})`, quantity: 1 });

  if (model === 'F4') {
    deductions.push({ itemName: `Shell: Middle F4 (${sc})`, quantity: 1 });
  } else if (model === 'ECO6' || model === 'LIFTED6') {
    deductions.push({ itemName: `Shell: Middle Lifted/Eco6 (${sc})`, quantity: 1 });
  }

  if (model === 'F4') {
    deductions.push({ itemName: `Shell: Rear F4 (${sc})`, quantity: 1 });
  } else {
    deductions.push({ itemName: `Shell: Rear Multi-Model (${sc})`, quantity: 1 });
  }

  // ── Seat Components ────────────────────────────────────────────────────────
  switch (model) {
    case 'ECO2':
      deductions.push({ itemName: `Seat: Backrest (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Battery Eco (${seat})`, quantity: 1 });
      break;

    case 'ECO4':
      deductions.push({ itemName: `Seat: Battery Eco (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Flipseat Eco (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Backrest (${seat})`, quantity: 2 });
      break;

    case 'ECO6':
      deductions.push({ itemName: `Seat: Front Eco (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Battery Eco (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Flipseat Eco (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Backrest (${seat})`, quantity: 3 });
      break;

    case 'LIFTED4':
      deductions.push({ itemName: `Seat: Battery Lifted (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Flipseat Lifted (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Backrest w/ Headrest (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Backrest w/o Headrest (${seat})`, quantity: 1 });
      break;

    case 'LIFTED6':
      deductions.push({ itemName: `Seat: Front Lifted (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Battery Lifted (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Flipseat Lifted (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Backrest w/o Headrest (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: Backrest w/ Headrest (${seat})`, quantity: 2 });
      break;

    case 'F4':
      deductions.push({ itemName: `Seat: F4 Front (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: F4 Backseat (${seat})`, quantity: 1 });
      deductions.push({ itemName: `Seat: F4 Bottom (${seat})`, quantity: 2 });
      break;
  }

  return deductions;
}
