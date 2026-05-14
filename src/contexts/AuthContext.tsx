import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { AppUser, UserRole } from '../types';

// ─── Context Shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  /** True when auth succeeded but account is inactive — pending manager approval */
  pendingApproval: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  isManager: boolean;
  isQC: boolean;
  isSupervisor: boolean;
  isOwner: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchUserDoc(uid: string): Promise<AppUser | null | 'inactive'> {
  const snap = await getDocFromServer(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data() as AppUser;
  if (data.active === false) return 'inactive';
  return { ...data, uid };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser]                 = useState<AppUser | null>(null);
  const [loading, setLoading]           = useState(true);
  const [pendingApproval, setPendingApproval] = useState(false);

  // When true, onAuthStateChanged skips all logic — signIn/signUp own the flow
  const skipAuthRef = React.useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (skipAuthRef.current) return;

      setFirebaseUser(fbUser);

      if (fbUser) {
        try {
          const result = await fetchUserDoc(fbUser.uid);
          if (result === 'inactive') {
            await firebaseSignOut(auth);
            setUser(null);
            setPendingApproval(true);
          } else if (result === null) {
            await firebaseSignOut(auth);
            setUser(null);
            setPendingApproval(false);
          } else {
            setUser(result);
            setPendingApproval(false);
          }
        } catch {
          setUser(null);
          setPendingApproval(false);
        }
      } else {
        setUser(null);
        // Don't clear pendingApproval here — let it persist so login screen shows it
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // signIn takes full ownership: blocks the auth listener, does auth + doc check itself
  const signIn = async (email: string, password: string) => {
    skipAuthRef.current = true;
    setPendingApproval(false);
    setUser(null);

    try {
      const { user: fbUser } = await signInWithEmailAndPassword(auth, email, password);
      setFirebaseUser(fbUser);

      const result = await fetchUserDoc(fbUser.uid);

      if (result === 'inactive') {
        await firebaseSignOut(auth);
        setFirebaseUser(null);
        setPendingApproval(true);
      } else if (result === null) {
        // No Firestore record — sign out
        await firebaseSignOut(auth);
        setFirebaseUser(null);
        const err = new Error('No account found') as Error & { code: string };
        err.code = 'auth/user-not-found';
        throw err;
      } else {
        setUser(result);
        setPendingApproval(false);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      // If we threw auth/account-inactive ourselves, don't re-throw
      if (code !== 'auth/account-inactive') {
        // Ensure we're signed out on any real error
        try { await firebaseSignOut(auth); } catch { /* ignore */ }
        setFirebaseUser(null);
        setUser(null);
        throw err;
      }
    } finally {
      skipAuthRef.current = false;
      setLoading(false);
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setPendingApproval(false);
  };

  const signUp = async (name: string, email: string, password: string) => {
    skipAuthRef.current = true;
    try {
      const { user: fbUser } = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', fbUser.uid), {
        name,
        email,
        role: 'worker',
        active: false,
        createdAt: serverTimestamp(),
      });
      await firebaseSignOut(auth);
    } finally {
      skipAuthRef.current = false;
      setFirebaseUser(null);
      setUser(null);
    }
  };

  const hasRole = (...roles: UserRole[]) =>
    user ? roles.includes(user.role) : false;

  const isOwner      = user?.role === 'owner';
  const isManager    = user?.role === 'manager' || user?.role === 'owner';
  const isSupervisor = ['administration', 'manager', 'owner'].includes(user?.role ?? '');
  const isQC         = ['administration', 'manager', 'owner'].includes(user?.role ?? '');

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, pendingApproval, signIn, signOut, signUp, hasRole, isManager, isQC, isSupervisor, isOwner }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
