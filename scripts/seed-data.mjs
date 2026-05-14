/**
 * Seed script — populates Firestore with test data.
 * All documents are tagged { _seeded: true } for easy cleanup.
 *
 * Usage:
 *   node scripts/seed-data.mjs rcalmes04@gmail.com vcarts84
 *
 * To remove all seeded data:
 *   node scripts/clear-seed-data.mjs rcalmes04@gmail.com vcarts84
 */

const API_KEY    = 'AIzaSyCVLfmZrqBV5rc1HpUcY0YZatiE7d7dMXA';
const PROJECT_ID = 'vcarts-ipps';
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const [,, email = '', password = ''] = process.argv;
if (!email || !password) {
  console.error('\nUsage: node scripts/seed-data.mjs your@email.com yourpassword\n');
  process.exit(1);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function signIn() {
  const res  = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (data.error) { console.error('Auth failed:', data.error.message); process.exit(1); }
  return { uid: data.localId, idToken: data.idToken, name: data.displayName || 'Reginald Calmes' };
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

function strVal(v)  { return { stringValue: String(v) }; }
function intVal(v)  { return { integerValue: String(v) }; }
function boolVal(v) { return { booleanValue: Boolean(v) }; }
function tsVal(d)   { return { timestampValue: (d instanceof Date ? d : new Date(d)).toISOString() }; }

async function writeDoc(collection, docId, fields, idToken) {
  const url = `${BASE_URL}/${collection}/${docId}`;
  const res  = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${collection}/${docId}: ${data.error.message}`);
  return data;
}

async function addDoc(collection, fields, idToken) {
  const res  = await fetch(`${BASE_URL}/${collection}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${collection}: ${data.error.message}`);
  return data.name.split('/').pop(); // return doc ID
}

// ─── Seed data definitions ────────────────────────────────────────────────────

const SHELL_COLORS = ['Red', 'White', 'Blue', 'Black', 'Matte Grey', 'Cloud Blue', 'Burgundy'];
const SEAT_COLORS  = ['Brown', 'Black', 'Grey'];

function inventoryItems() {
  const items = [];

  // Frames
  const frames = ['Frame: Eco 2', 'Frame: Eco 4', 'Frame: Eco 6', 'Frame: Lifted 4', 'Frame: Lifted 6', 'Frame: F4'];
  frames.forEach(name => items.push({ category: 'frame', name, qty: rand(8, 25), min: 3 }));

  // Tires
  const tires = ['Tire: Eco', 'Tire: Lifted', 'Tire: F4'];
  tires.forEach(name => items.push({ category: 'tire', name, qty: rand(20, 80), min: 8 }));

  // Shells — 5 shell types × 7 colors
  SHELL_COLORS.forEach(color => {
    items.push({ category: 'shell', name: `Shell: Front (${color})`,                qty: rand(5, 20), min: 2 });
    items.push({ category: 'shell', name: `Shell: Middle F4 (${color})`,            qty: rand(4, 15), min: 2 });
    items.push({ category: 'shell', name: `Shell: Middle Lifted/Eco6 (${color})`,   qty: rand(4, 15), min: 2 });
    items.push({ category: 'shell', name: `Shell: Rear F4 (${color})`,              qty: rand(4, 15), min: 2 });
    items.push({ category: 'shell', name: `Shell: Rear Multi-Model (${color})`,     qty: rand(5, 20), min: 2 });
  });

  // Seats — 8 seat types × 3 colors
  SEAT_COLORS.forEach(color => {
    items.push({ category: 'seat', name: `Seat: Backrest (${color})`,              qty: rand(6, 20), min: 3 });
    items.push({ category: 'seat', name: `Seat: Battery (${color})`,               qty: rand(6, 20), min: 3 });
    items.push({ category: 'seat', name: `Seat: Flipseat (${color})`,              qty: rand(6, 20), min: 3 });
    items.push({ category: 'seat', name: `Seat: Front (${color})`,                 qty: rand(6, 20), min: 3 });
    items.push({ category: 'seat', name: `Seat: F4 Backseat (${color})`,           qty: rand(4, 15), min: 2 });
    items.push({ category: 'seat', name: `Seat: F4 Bottom (${color})`,             qty: rand(4, 15), min: 2 });
    items.push({ category: 'seat', name: `Seat: Backrest w/ Headrest (${color})`,  qty: rand(4, 15), min: 2 });
    items.push({ category: 'seat', name: `Seat: Backrest w/o Headrest (${color})`, qty: rand(4, 15), min: 2 });
  });

  return items;
}

const DEALERS = [
  { name: 'Battery Source' },
  { name: 'Family Golf Carts' },
  { name: 'Sincity' },
];

const CARTS = [
  { vin: 'VC-2024-0001', model: 'ECO4',    shellColor: 'White',     seatColor: 'Black', dealerName: 'Battery Source',   status: 'intake' },
  { vin: 'VC-2024-0002', model: 'LIFTED4', shellColor: 'Red',       seatColor: 'Black', dealerName: 'Family Golf Carts', status: 'built' },
  { vin: 'VC-2024-0003', model: 'ECO6',    shellColor: 'Blue',      seatColor: 'Grey',  dealerName: 'Sincity',           status: 'painted' },
  { vin: 'VC-2024-0004', model: 'F4',      shellColor: 'Black',     seatColor: 'Brown', dealerName: 'Battery Source',   status: 'in_queue' },
  { vin: 'VC-2024-0005', model: 'LIFTED6', shellColor: 'Matte Grey',seatColor: 'Black', dealerName: 'Family Golf Carts', status: 'in_queue' },
  { vin: 'VC-2024-0006', model: 'ECO2',    shellColor: 'Cloud Blue',seatColor: 'Grey',  dealerName: 'Sincity',           status: 'qc_fail',  qcFailReason: 'Front shell misaligned, requires repaint' },
  { vin: 'VC-2024-0007', model: 'ECO4',    shellColor: 'Burgundy',  seatColor: 'Brown', dealerName: 'Battery Source',   status: 'qc_pass' },
  { vin: 'VC-2024-0008', model: 'LIFTED4', shellColor: 'White',     seatColor: 'Black', dealerName: 'Family Golf Carts', status: 'built' },
  { vin: 'VC-2024-0009', model: 'ECO6',    shellColor: 'Red',       seatColor: 'Brown', dealerName: 'Sincity',           status: 'painted' },
  { vin: 'VC-2024-0010', model: 'F4',      shellColor: 'Blue',      seatColor: 'Grey',  dealerName: 'Battery Source',   status: 'qc_pass' },
];

const SCRAP_ENTRIES = [
  { itemName: 'Shell: Front (Red)',       problemInfo: 'Deep scratch from forklift during transport', quantity: 1, partNumber: 'VC-SH-FR-001' },
  { itemName: 'Seat: Battery (Black)',    problemInfo: 'Torn seat cushion seam, cannot be repaired',   quantity: 2, partNumber: 'VC-ST-BAT-002' },
  { itemName: 'Tire: Eco',               problemInfo: 'Manufacturing defect — sidewall bubbling',      quantity: 4, partNumber: null },
  { itemName: 'Frame: Eco 4',            problemInfo: 'Bent frame rail from shipping damage',          quantity: 1, partNumber: 'VC-FR-ECO4-001' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(n) {
  return new Date(Date.now() - n * 3600000);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 V-Carts seed script starting…\n');

  const { uid, idToken, name: userName } = await signIn();
  console.log(`✓ Signed in as ${email}\n`);

  // ── Dealers ────────────────────────────────────────────────────────────────
  process.stdout.write('Writing dealers… ');
  const dealerIds = {};
  for (const dealer of DEALERS) {
    const id = await addDoc('dealers', {
      name:      strVal(dealer.name),
      active:    boolVal(true),
      createdAt: tsVal(daysAgo(90)),
      _seeded:   boolVal(true),
    }, idToken);
    dealerIds[dealer.name] = id;
  }
  console.log(`✓ ${DEALERS.length} dealers`);

  // ── Inventory ──────────────────────────────────────────────────────────────
  process.stdout.write('Writing inventory items… ');
  const items = inventoryItems();
  // Write in parallel batches of 10
  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10);
    await Promise.all(batch.map(item =>
      addDoc('inventory', {
        category:        strVal(item.category),
        name:            strVal(item.name),
        quantityOnHand:  intVal(item.qty),
        minimumStockLevel: intVal(item.min),
        lastUpdatedAt:   tsVal(daysAgo(rand(1, 14))),
        lastUpdatedBy:   strVal(uid),
        _seeded:         boolVal(true),
      }, idToken)
    ));
    process.stdout.write('.');
  }
  console.log(` ✓ ${items.length} items`);

  // ── Carts ──────────────────────────────────────────────────────────────────
  process.stdout.write('Writing carts… ');
  for (const cart of CARTS) {
    const dealerId = dealerIds[cart.dealerName] ?? 'unknown';
    const createdAt = daysAgo(rand(5, 30));
    const fields = {
      vin:           strVal(cart.vin),
      vinPhotoUrl:   strVal(''),
      model:         strVal(cart.model),
      shellColor:    strVal(cart.shellColor),
      seatColor:     strVal(cart.seatColor),
      dealerId:      strVal(dealerId),
      dealerName:    strVal(cart.dealerName),
      status:        strVal(cart.status),
      createdAt:     tsVal(createdAt),
      updatedAt:     tsVal(hoursAgo(rand(1, 48))),
      createdBy:     strVal(uid),
      createdByName: strVal(userName),
      _seeded:       boolVal(true),
    };

    if (['built','painted','in_queue','qc_pass','qc_fail'].includes(cart.status)) {
      fields.builtAt = tsVal(hoursAgo(rand(24, 72)));
      fields.builtBy = strVal(uid);
    }
    if (['painted','in_queue','qc_pass','qc_fail'].includes(cart.status)) {
      fields.paintedAt = tsVal(hoursAgo(rand(12, 24)));
      fields.paintedBy = strVal(uid);
    }
    if (['in_queue','qc_pass','qc_fail'].includes(cart.status)) {
      fields.queuedAt = tsVal(hoursAgo(rand(4, 12)));
      fields.queuedBy = strVal(uid);
    }
    if (cart.status === 'qc_pass') {
      fields.qcPassedAt   = tsVal(hoursAgo(rand(1, 4)));
      fields.qcPassedBy   = strVal(uid);
      fields.bomDeducted  = boolVal(true);
      fields.bomDeductedAt = tsVal(hoursAgo(rand(1, 4)));
    }
    if (cart.status === 'qc_fail') {
      fields.qcFailedAt     = tsVal(hoursAgo(rand(2, 8)));
      fields.qcFailedBy     = strVal(uid);
      fields.qcFailReason   = strVal(cart.qcFailReason ?? '');
    }

    await addDoc('carts', fields, idToken);
  }
  console.log(`✓ ${CARTS.length} carts`);

  // ── Scrap Log ──────────────────────────────────────────────────────────────
  process.stdout.write('Writing scrap log… ');
  for (const entry of SCRAP_ENTRIES) {
    const fields = {
      itemName:     strVal(entry.itemName),
      problemInfo:  strVal(entry.problemInfo),
      quantity:     intVal(entry.quantity),
      loggedBy:     strVal(uid),
      loggedByName: strVal(userName),
      date:         tsVal(daysAgo(rand(1, 14))),
      _seeded:      boolVal(true),
    };
    if (entry.partNumber) fields.partNumber = strVal(entry.partNumber);
    await addDoc('scrapLog', fields, idToken);
  }
  console.log(`✓ ${SCRAP_ENTRIES.length} scrap entries`);

  // ── Payroll Settings ───────────────────────────────────────────────────────
  process.stdout.write('Writing payroll settings… ');
  await writeDoc('settings', 'payrollSettings', {
    activeAssemblerCount: intVal(11),
    updatedAt:            tsVal(daysAgo(7)),
    updatedBy:            strVal(uid),
    _seeded:              boolVal(true),
  }, idToken);
  console.log('✓');

  console.log('\n✅ Seed complete!\n');
  console.log('   Dealers:    ' + DEALERS.length);
  console.log('   Inventory:  ' + items.length + ' items');
  console.log('   Carts:      ' + CARTS.length + ' (various statuses)');
  console.log('   Scrap log:  ' + SCRAP_ENTRIES.length + ' entries');
  console.log('\nRun "node scripts/clear-seed-data.mjs" to remove all test data.\n');
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
