/**
 * Deletes all documents from: carts, scrapLog, auditLog, timeRecords, clockSessions, inventory
 * Keeps: users, dealers, settings
 *
 * Usage: node scripts/clear-data.mjs your@email.com yourpassword
 */

const API_KEY    = 'AIzaSyCVLfmZrqBV5rc1HpUcY0YZatiE7d7dMXA';
const PROJECT_ID = 'vcarts-ipps';
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const [,, email = '', password = ''] = process.argv;
if (!email || !password) {
  console.error('Usage: node scripts/clear-data.mjs email password');
  process.exit(1);
}

async function getToken() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }) }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  return data.idToken;
}

async function listDocs(token, collection) {
  const ids = [];
  let pageToken = null;
  do {
    const url = `${BASE_URL}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.documents) ids.push(...data.documents.map(d => d.name));
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);
  return ids;
}

async function deleteDoc(token, name) {
  await fetch(`https://firestore.googleapis.com/v1/${name}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

const COLLECTIONS = ['carts', 'scrapLog', 'auditLog', 'timeRecords', 'clockSessions', 'inventory'];

(async () => {
  console.log('Signing in…');
  const token = await getToken();
  console.log('Authenticated.\n');

  for (const col of COLLECTIONS) {
    process.stdout.write(`Fetching ${col}… `);
    const docs = await listDocs(token, col);
    console.log(`${docs.length} docs`);
    for (const name of docs) {
      await deleteDoc(token, name);
      process.stdout.write('.');
    }
    if (docs.length) console.log(` ✓ deleted ${docs.length}`);
  }

  console.log('\nDone. All dummy data cleared.');
})();
