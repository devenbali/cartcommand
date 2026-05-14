/**
 * Removes all documents tagged { _seeded: true } from Firestore.
 *
 * Usage:
 *   node scripts/clear-seed-data.mjs rcalmes04@gmail.com vcarts84
 */

const API_KEY    = 'AIzaSyCVLfmZrqBV5rc1HpUcY0YZatiE7d7dMXA';
const PROJECT_ID = 'vcarts-ipps';
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const [,, email = '', password = ''] = process.argv;
if (!email || !password) {
  console.error('\nUsage: node scripts/clear-seed-data.mjs your@email.com yourpassword\n');
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

async function listSeeded(collection, idToken) {
  // Firestore REST doesn't support filtering by field easily without indexes,
  // so we fetch all docs and filter client-side
  const res  = await fetch(`${BASE_URL}/${collection}?pageSize=500`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents
    .filter(d => d.fields?._seeded?.booleanValue === true)
    .map(d => d.name); // full resource path
}

async function deleteDoc(resourcePath, idToken) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${resourcePath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const data = await res.json();
    throw new Error(data.error?.message ?? `Delete failed: ${res.status}`);
  }
}

async function clearCollection(name, idToken) {
  const docs = await listSeeded(name, idToken);
  if (docs.length === 0) { console.log(`  ${name}: nothing to clear`); return 0; }
  await Promise.all(docs.map(path => deleteDoc(path, idToken)));
  console.log(`  ${name}: deleted ${docs.length}`);
  return docs.length;
}

async function main() {
  console.log('\n🗑  Clearing seeded test data…\n');

  const idToken = await signIn();
  console.log(`✓ Signed in\n`);

  const COLLECTIONS = ['dealers', 'inventory', 'carts', 'scrapLog', 'auditLog', 'settings'];
  let total = 0;
  for (const col of COLLECTIONS) {
    total += await clearCollection(col, idToken);
  }

  console.log(`\n✅ Done — ${total} document${total !== 1 ? 's' : ''} removed.\n`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
