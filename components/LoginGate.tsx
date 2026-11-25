'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const DEMO_SESSION_KEY = 'baymax-demo-session';

export default function LoginGate() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (window.localStorage.getItem(DEMO_SESSION_KEY) === 'active') router.replace('/dashboard');
  }, [router]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!password.trim()) {
      setError('Enter a password to continue.');
      return;
    }
    // Temporary local-only demo gate. This does not create a real authenticated backend session.
    window.localStorage.setItem(DEMO_SESSION_KEY, 'active');
    router.replace('/dashboard');
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
              <p className="baymax-eyebrow">WELCOME BACK</p>
              <h2>Sign in to Baymax</h2>
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
              placeholder="Enter your password"
              autoComplete="current-password"
              autoFocus
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {error && <p className="baymax-login-error">{error}</p>}
          <button type="submit" className="baymax-login-submit">Continue <span>→</span></button>
          <div className="baymax-demo-note">
            <span className="baymax-demo-dot" />
            Demo access is enabled. Enter any password to preview the workspace.
          </div>
          <p className="baymax-login-foot">No social account is connected until you authorize it.</p>
        </form>
      </section>

      <footer className="baymax-login-footer">BAYMAX · PRIVATE AFFILIATE INTELLIGENCE</footer>
    </main>
  );
}
