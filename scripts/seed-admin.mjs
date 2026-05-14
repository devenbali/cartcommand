/**
 * Creates or repairs the manager Firestore document for an existing Firebase Auth account.
 *
 * Usage:
 *   node scripts/seed-admin.mjs "Your Name" your@email.com yourpassword
 */

const API_KEY    = 'AIzaSyCVLfmZrqBV5rc1HpUcY0YZatiE7d7dMXA';
const PROJECT_ID = 'vcarts-ipps';

const [,, name = 'Manager', email = '', password = ''] = process.argv;

if (!email || !password) {
  console.error('\nUsage: node scripts/seed-admin.mjs "Your Name" your@email.com yourpassword\n');
  process.exit(1);
}

async function main() {
  console.log(`\nSetting up manager account for: ${email}\n`);

  // Try signing in first (account likely already exists)
  let uid, idToken;

  const signInRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const signInData = await signInRes.json();

  if (signInData.error) {
    // Account doesn't exist yet — create it
    if (signInData.error.message === 'EMAIL_NOT_FOUND' || signInData.error.message === 'INVALID_LOGIN_CREDENTIALS') {
      console.log('Account not found — creating Firebase Auth account...');
      const signUpRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
      );
      const signUpData = await signUpRes.json();
      if (signUpData.error) {
        console.error('Failed to create account:', signUpData.error.message);
        process.exit(1);
      }
      uid     = signUpData.localId;
      idToken = signUpData.idToken;
    } else {
      console.error('Sign-in error:', signInData.error.message);
      process.exit(1);
    }
  } else {
    uid     = signInData.localId;
    idToken = signInData.idToken;
    console.log(`Signed in. UID: ${uid}`);
  }

  // Write the Firestore users/{uid} document
  console.log('Writing Firestore document...');
  const fsRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        fields: {
          uid:       { stringValue: uid },
          name:      { stringValue: name },
          email:     { stringValue: email },
          role:      { stringValue: 'manager' },
          active:    { booleanValue: true },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    }
  );

  const fsData = await fsRes.json();
  if (fsData.error) {
    console.error('Firestore write failed:', fsData.error.message);
    console.error('Make sure you have deployed the updated firestore.rules first:');
    console.error('  firebase deploy --only firestore:rules');
    process.exit(1);
  }

  console.log('\n✅ Done!\n');
  console.log(`   Name:  ${name}`);
  console.log(`   Email: ${email}`);
  console.log(`   Role:  manager`);
  console.log(`   UID:   ${uid}`);
  console.log('\nYou can now sign in at http://localhost:5173\n');
}

main().catch(console.error);
