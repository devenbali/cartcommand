import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';

let loginPromise: Promise<void> | null = null;

export function signIntoFirebaseBeforeReads() {
  if (!loginPromise) {
    loginPromise = signInWithEmailAndPassword(
      auth,
      import.meta.env.VITE_FIREBASE_LOGIN_EMAIL,
      import.meta.env.VITE_FIREBASE_LOGIN_PASSWORD
    ).then(() => undefined);
  }

  return loginPromise;
}