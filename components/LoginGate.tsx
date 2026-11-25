'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, type AuthStatus } from '@/lib/api';

export default function LoginGate() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    window.localStorage.removeItem('baymax-demo-session');
    api<AuthStatus>('/auth/status')
      .then((s) => {
        if (s.authenticated) router.replace('/dashboard');
        else setStatus(s);
      })
      .catch(() => setStatus({ needsSetup: false, tourCompleted: false, authenticated: false, dbReady: false }));
  }, [router]);

  const setup = Boolean(status?.needsSetup);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!password.trim()) return setError('Enter a password to continue.');
    if (setup) {
      if (password.length < 8) return setError('Use at least 8 characters.');
      if (password !== confirm) return setError('Passwords do not match.');
    }
    setBusy(true);
    try {
      await api(setup ? '/auth/setup' : '/auth/login', { method: 'POST', body: { password } });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach Baymax. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="baymax-login">
      <div className="baymax-login-sky" aria-hidden="true">
        <span className="login-cloud login-cloud-a" />
        <span className="login-cloud login-cloud-b" />
        <span className="login-cloud login-cloud-c" />
        <span className="login-orb login-orb-a" />
        <span className="login-orb login-orb-b" />
      </div>

      <header className="baymax-login-header">
        <div className="baymax-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/baymax-icon.png" alt="" className="baymax-brand-icon" />
          <span>baymax<span className="baymax-brand-soft">.ai</span></span>
        </div>
        <span className="baymax-private-label"><span /> PRIVATE WORKSPACE</span>
      </header>

      <section className="baymax-login-content">
        <div className="baymax-login-intro">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/baymax-hero.png" alt="Baymax assistant" className="baymax-login-mascot" />
          <p className="baymax-eyebrow">YOUR AUTONOMOUS AFFILIATE ASSISTANT</p>
          <h1>Your business,<br /><span>in good hands.</span></h1>
          <p className="baymax-login-subtitle">Baymax helps you discover products, create campaigns and grow your affiliate business.</p>
        </div>

        <form onSubmit={submit} className="baymax-login-card">
          <div className="baymax-login-card-top">
            <div>
              <p className="baymax-eyebrow">{setup ? 'FIRST RUN' : 'WELCOME BACK'}</p>
              <h2>{setup ? 'Create your master password' : 'Sign in to Baymax'}</h2>
            </div>
            <span className="baymax-lock-mark">✦</span>
          </div>
          <label htmlFor="baymax-password">Password</label>
          <div className="baymax-password-wrap">
            <input
              id="baymax-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={setup ? 'At least 8 characters' : 'Enter your password'}
              autoComplete={setup ? 'new-password' : 'current-password'}
              autoFocus
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {setup && (
            <>
              <label htmlFor="baymax-password-confirm">Confirm password</label>
              <div className="baymax-password-wrap">
                <input
                  id="baymax-password-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                />
              </div>
            </>
          )}
          {status && status.dbReady === false && (
            <p className="baymax-login-error">Backend can't reach the database. Check SUPABASE_SERVICE_KEY on the server.</p>
          )}
          {error && <p className="baymax-login-error">{error}</p>}
          <button type="submit" className="baymax-login-submit" disabled={busy || !status}>
            {busy ? 'Working…' : setup ? 'Create & continue' : 'Continue'} <span>→</span>
          </button>
          <p className="baymax-login-foot">No social account is connected until you authorize it.</p>
        </form>
      </section>

      <footer className="baymax-login-footer">BAYMAX · PRIVATE AFFILIATE INTELLIGENCE</footer>
    </main>
  );
}
