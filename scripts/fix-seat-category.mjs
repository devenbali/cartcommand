/**
 * Fixes category casing on newly created seat items (Seat → seat)
 * and verifies they exist, creating any that are missing.
 */

const API_KEY    = 'AIzaSyCVLfmZrqBV5rc1HpUcY0YZatiE7d7dMXA';
const PROJECT_ID = 'vcarts-ipps';
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const [,, email = '', password = ''] = process.argv;
if (!email || !password) {
  console.error('\nUsage: node scripts/fix-seat-category.mjs your@email.com yourpassword\n');
  process.exit(1);
}

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

const COLORS = ['Black', 'Brown', 'Grey'];
const TARGET_PREFIXES = [
  'Seat: Battery Lifted',
  'Seat: Front Lifted',
  'Seat: Flipseat Lifted',
  'Seat: F4 Front',
];

async function run() {
  console.log('Signing in…');
  const token = await signIn();

  console.log('Fetching inventory…');
  const docs = await listInventory(token);
  console.log(`Found ${docs.length} inventory items\n`);

  for (const prefix of TARGET_PREFIXES) {
    for (const color of COLORS) {
      const name = `${prefix} (${color})`;
      const doc  = docs.find(d => d.fields?.name?.stringValue === name);

      if (!doc) {
        console.log(`  CREATING (missing): "${name}"`);
        await createDoc(token, {
          name:              strVal(name),
          category:          strVal('seat'),
          quantityOnHand:    intVal(0),
          minimumStockLevel: intVal(2),
          active:            boolVal(true),
        });
      } else {
        const cat = doc.fields?.category?.stringValue ?? '';
        if (cat !== 'seat') {
          console.log(`  FIXING category "${cat}" → "seat": "${name}"`);
          await patchDoc(token, doc.name, { category: strVal('seat') });
        } else {
          console.log(`  OK: "${name}"`);
        }
      }
    }
  }

  console.log('\nDone!');
}

run().catch(err => { console.error(err); process.exit(1); });
