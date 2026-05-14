import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';

type Tab = 'signin' | 'signup' | 'reset';

export default function LoginScreen() {
  const { signIn, signUp, pendingApproval } = useAuth();
  const [tab, setTab] = useState<Tab>('signin');

  // Sign-in state
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // Password reset state
  const [resetEmail, setResetEmail]   = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone, setResetDone]     = useState(false);
  const [resetError, setResetError]   = useState('');

  // Sign-up state
  const [suName, setSuName]         = useState('');
  const [suEmail, setSuEmail]       = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suShowPw, setSuShowPw]     = useState(false);
  const [suError, setSuError]       = useState('');
  const [suLoading, setSuLoading]   = useState(false);
  const [suDone, setSuDone]         = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      // If account is inactive, onAuthStateChanged sets pendingApproval — no error thrown
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('Invalid email or password.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Try again later.');
      } else {
        setError('Sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suName.trim() || !suEmail || !suPassword) return;
    if (suPassword.length < 6) { setSuError('Password must be at least 6 characters.'); return; }
    setSuError('');
    setSuLoading(true);
    try {
      await signUp(suName.trim(), suEmail, suPassword);
      setSuDone(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/email-already-in-use') {
        setSuError('An account with this email already exists.');
      } else if (code === 'auth/invalid-email') {
        setSuError('Invalid email address.');
      } else {
        setSuError('Sign up failed. Please try again.');
      }
    } finally {
      setSuLoading(false);
    }
  };

  const inputStyle = {
    background: '#1c2333',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#e6edf3',
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: 'linear-gradient(135deg, #0d1117 0%, #161b27 100%)' }}>

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.05) 0%, transparent 70%)' }} />
      </div>

      <div className="relative w-full max-w-md animate-fade-in-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
               style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 0 50px rgba(34,197,94,0.35)' }}>
            <svg width="42" height="42" viewBox="0 0 32 32" fill="none">
              <path d="M4 6L13 26H16H19L28 6H23L16 20L9 6H4Z" fill="white"/>
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Outfit, Inter, sans-serif', color: '#e6edf3' }}>
            V-Carts
          </h1>
          <p className="text-base mt-2" style={{ color: '#7d8590' }}>IPPS — Production Management</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl overflow-hidden" style={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.08)' }}>

          {/* Tabs — only show signin/signup, not reset */}
          {tab !== 'reset' && (
            <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {(['signin', 'signup'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 py-4 text-base font-medium transition-colors"
                  style={{
                    color: tab === t ? '#22c55e' : '#7d8590',
                    background: tab === t ? 'rgba(34,197,94,0.06)' : 'transparent',
                    borderBottom: tab === t ? '2px solid #22c55e' : '2px solid transparent',
                  }}
                >
                  {t === 'signin' ? 'Sign In' : 'Join Team'}
                </button>
              ))}
            </div>
          )}

          <div className="p-8">
            {/* ─── Sign In ─────────────────────────────────── */}
            {tab === 'signin' && (
              <form onSubmit={handleSignIn} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium uppercase tracking-wider" style={{ color: '#7d8590' }}>Email</label>
                  <input
                    type="email" autoComplete="email"
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@vcarts.com"
                    className="w-full px-4 py-3 rounded-xl text-base outline-none transition-all"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'rgba(34,197,94,0.5)')}
                    onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium uppercase tracking-wider" style={{ color: '#7d8590' }}>Password</label>
                    <button
                      type="button"
                      onClick={() => { setResetEmail(email); setTab('reset'); }}
                      className="text-sm transition-opacity hover:opacity-80"
                      style={{ color: '#22c55e' }}>
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'} autoComplete="current-password"
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 pr-12 rounded-xl text-base outline-none transition-all"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = 'rgba(34,197,94,0.5)')}
                      onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-100 p-1"
                            style={{ color: '#7d8590', opacity: 0.7 }}>
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {pendingApproval && (
                  <div className="flex items-start gap-2 px-4 py-3 rounded-lg text-sm"
                       style={{ background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.3)', color: '#d29922' }}>
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span>Your account is pending manager approval. A manager needs to activate your account before you can log in.</span>
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
                       style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
                    <AlertCircle size={15} className="shrink-0" />
                    {error}
                  </div>
                )}
                <button
                  type="submit" disabled={loading || !email || !password}
                  className="w-full py-3.5 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2 mt-1"
                  style={{
                    background: loading || !email || !password ? 'rgba(34,197,94,0.3)' : '#22c55e',
                    color: loading || !email || !password ? 'rgba(255,255,255,0.5)' : '#0d1117',
                    cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
                  }}>
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign In'}
                </button>
              </form>
            )}

            {/* ─── Password Reset ──────────────────────────── */}
            {tab === 'reset' && (
              resetDone ? (
                <div className="flex flex-col items-center gap-5 py-4 text-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center"
                       style={{ background: 'rgba(34,197,94,0.12)' }}>
                    <CheckCircle2 size={28} style={{ color: '#22c55e' }} />
                  </div>
                  <div>
                    <p className="font-semibold text-lg mb-1.5" style={{ color: '#e6edf3' }}>Check your email</p>
                    <p className="text-sm" style={{ color: '#7d8590' }}>
                      A password reset link was sent to <strong style={{ color: '#e6edf3' }}>{resetEmail}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => { setResetDone(false); setTab('signin'); }}
                    className="flex items-center gap-2 text-sm font-medium" style={{ color: '#22c55e' }}>
                    <ArrowLeft size={14} /> Back to Sign In
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <div>
                    <button onClick={() => setTab('signin')}
                            className="flex items-center gap-2 text-sm mb-5" style={{ color: '#7d8590' }}>
                      <ArrowLeft size={14} /> Back to Sign In
                    </button>
                    <h2 className="text-xl font-semibold mb-1" style={{ color: '#e6edf3' }}>Reset Password</h2>
                    <p className="text-sm" style={{ color: '#7d8590' }}>Enter your email and we'll send you a reset link.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium uppercase tracking-wider" style={{ color: '#7d8590' }}>Email</label>
                    <input
                      type="email"
                      value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                      placeholder="you@vcarts.com"
                      className="w-full px-4 py-3 rounded-xl text-base outline-none transition-all"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = 'rgba(34,197,94,0.5)')}
                      onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                    />
                  </div>
                  {resetError && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
                         style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
                      <AlertCircle size={15} className="shrink-0" />
                      {resetError}
                    </div>
                  )}
                  <button
                    disabled={resetLoading || !resetEmail}
                    onClick={async () => {
                      if (!resetEmail) return;
                      setResetError('');
                      setResetLoading(true);
                      try {
                        await sendPasswordResetEmail(auth, resetEmail);
                        setResetDone(true);
                      } catch (err: unknown) {
                        const code = (err as { code?: string })?.code ?? '';
                        setResetError(code === 'auth/user-not-found' ? 'No account found with this email.' : 'Failed to send reset email. Try again.');
                      } finally {
                        setResetLoading(false);
                      }
                    }}
                    className="w-full py-3.5 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2"
                    style={{
                      background: resetLoading || !resetEmail ? 'rgba(34,197,94,0.3)' : '#22c55e',
                      color: resetLoading || !resetEmail ? 'rgba(255,255,255,0.5)' : '#0d1117',
                      cursor: resetLoading || !resetEmail ? 'not-allowed' : 'pointer',
                    }}>
                    {resetLoading ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : 'Send Reset Link'}
                  </button>
                </div>
              )
            )}

            {/* ─── Join Team ───────────────────────────────── */}
            {tab === 'signup' && (
              suDone ? (
                <div className="flex flex-col items-center gap-5 py-4 text-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center"
                       style={{ background: 'rgba(34,197,94,0.12)' }}>
                    <CheckCircle2 size={28} style={{ color: '#22c55e' }} />
                  </div>
                  <div>
                    <p className="font-semibold text-lg mb-1.5" style={{ color: '#e6edf3' }}>Account created!</p>
                    <p className="text-sm" style={{ color: '#7d8590' }}>
                      Your account is pending manager approval. You'll be able to log in once a manager activates your account.
                    </p>
                  </div>
                  <button
                    onClick={() => { setSuDone(false); setSuName(''); setSuEmail(''); setSuPassword(''); setTab('signin'); }}
                    className="flex items-center gap-2 text-sm font-medium" style={{ color: '#22c55e' }}>
                    <ArrowLeft size={14} /> Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSignUp} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium uppercase tracking-wider" style={{ color: '#7d8590' }}>Full Name</label>
                    <input
                      type="text" autoComplete="name"
                      value={suName} onChange={e => setSuName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full px-4 py-3 rounded-xl text-base outline-none transition-all"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = 'rgba(34,197,94,0.5)')}
                      onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium uppercase tracking-wider" style={{ color: '#7d8590' }}>Email</label>
                    <input
                      type="email" autoComplete="email"
                      value={suEmail} onChange={e => setSuEmail(e.target.value)}
                      placeholder="you@vcarts.com"
                      className="w-full px-4 py-3 rounded-xl text-base outline-none transition-all"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = 'rgba(34,197,94,0.5)')}
                      onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium uppercase tracking-wider" style={{ color: '#7d8590' }}>Password</label>
                    <div className="relative">
                      <input
                        type={suShowPw ? 'text' : 'password'} autoComplete="new-password"
                        value={suPassword} onChange={e => setSuPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className="w-full px-4 py-3 pr-12 rounded-xl text-base outline-none transition-all"
                        style={inputStyle}
                        onFocus={e => (e.target.style.borderColor = 'rgba(34,197,94,0.5)')}
                        onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
                      />
                      <button type="button" onClick={() => setSuShowPw(v => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-100 p-1"
                              style={{ color: '#7d8590', opacity: 0.7 }}>
                        {suShowPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  {suError && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
                         style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
                      <AlertCircle size={15} className="shrink-0" />
                      {suError}
                    </div>
                  )}
                  <button
                    type="submit" disabled={suLoading || !suName.trim() || !suEmail || !suPassword}
                    className="w-full py-3.5 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2 mt-1"
                    style={{
                      background: suLoading || !suName.trim() || !suEmail || !suPassword ? 'rgba(34,197,94,0.3)' : '#22c55e',
                      color: suLoading || !suName.trim() || !suEmail || !suPassword ? 'rgba(255,255,255,0.5)' : '#0d1117',
                      cursor: suLoading || !suName.trim() || !suEmail || !suPassword ? 'not-allowed' : 'pointer',
                    }}>
                    {suLoading ? <><Loader2 size={16} className="animate-spin" /> Creating account…</> : 'Request Access'}
                  </button>
                  <p className="text-sm text-center" style={{ color: '#7d8590' }}>
                    Your account will be activated by a manager before you can log in.
                  </p>
                </form>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
