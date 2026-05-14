/**
 * Migrates seat inventory items:
 * - Renames: Seat: Battery → Seat: Battery Eco
 * - Adds new: Seat: Battery Lifted (Black/Brown/Grey)
 * - Renames: Seat: Front → Seat: Front Eco
 * - Adds new: Seat: Front Lifted (Black/Brown/Grey)
 * - Renames: Seat: Flipseat → Seat: Flipseat Eco
 * - Adds new: Seat: Flipseat Lifted (Black/Brown/Grey)
 * - Adds new: Seat: F4 Front (Black/Brown/Grey)
 *
 * Usage:
 *   node scripts/migrate-seats.mjs your@email.com yourpassword
 */

const API_KEY    = 'AIzaSyCVLfmZrqBV5rc1HpUcY0YZatiE7d7dMXA';
const PROJECT_ID = 'vcarts-ipps';
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const [,, email = '', password = ''] = process.argv;
if (!email || !password) {
  console.error('\nUsage: node scripts/migrate-seats.mjs your@email.com yourpassword\n');
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
  return data.idToken;
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

function strVal(v)  { return { stringValue: String(v) }; }
function intVal(v)  { return { integerValue: String(v) }; }
function boolVal(v) { return { booleanValue: Boolean(v) }; }

async function listInventory(token) {
  const res = await fetch(`${BASE_URL}/inventory?pageSize=300`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.documents || [];
}

async function patchDoc(token, docPath, fields) {
  const fieldPaths = Object.keys(fields).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const res = await fetch(`https://firestore.googleapis.com/v1/${docPath}?${fieldPaths}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.json();
}

async function createDoc(token, fields) {
  const res = await fetch(`${BASE_URL}/inventory`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.json();
}

// ─── Migration ────────────────────────────────────────────────────────────────

const COLORS = ['Black', 'Brown', 'Grey'];

// Items to rename: [oldPrefix, newPrefix]
const RENAMES = [
  ['Seat: Battery',  'Seat: Battery Eco'],
  ['Seat: Front',    'Seat: Front Eco'],
  ['Seat: Flipseat', 'Seat: Flipseat Eco'],
];

// New item sets to create: [name prefix, category, minStock]
const NEW_ITEMS = [
  ['Seat: Battery Lifted',  'Seat', 2],
  ['Seat: Front Lifted',    'Seat', 2],
  ['Seat: Flipseat Lifted', 'Seat', 2],
  ['Seat: F4 Front',        'Seat', 2],
];

async function run() {
  console.log('Signing in…');
  const token = await signIn();

  console.log('Fetching inventory…');
  const docs = await listInventory(token);
  console.log(`Found ${docs.length} inventory items`);

  // ── Renames ──
  for (const [oldPrefix, newPrefix] of RENAMES) {
    for (const color of COLORS) {
      const oldName = `${oldPrefix} (${color})`;
      const newName = `${newPrefix} (${color})`;
      const doc = docs.find(d => d.fields?.name?.stringValue === oldName);
      if (doc) {
        console.log(`  Renaming: "${oldName}" → "${newName}"`);
        await patchDoc(token, doc.name, { name: strVal(newName) });
      } else {
        console.log(`  Not found (skip rename): "${oldName}"`);
      }
    }
  }

  // ── New items — only create if they don't already exist ──
  for (const [prefix, category, minStock] of NEW_ITEMS) {
    for (const color of COLORS) {
      const name = `${prefix} (${color})`;
      const exists = docs.find(d => d.fields?.name?.stringValue === name);
      if (exists) {
        console.log(`  Already exists (skipping): "${name}"`);
      } else {
        console.log(`  Creating: "${name}"`);
        await createDoc(token, {
          name:              strVal(name),
          category:          strVal(category),
          quantityOnHand:    intVal(0),
          minimumStockLevel: intVal(minStock),
          active:            boolVal(true),
        });
      }
    }
  }

  console.log('\nDone!');
}

run().catch(err => { console.error(err); process.exit(1); });
