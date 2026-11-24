'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type AuthStatus } from '@/lib/api';
import { Button, Input } from './ui';

function Cloud({ style }: { style: React.CSSProperties }) {
  return (
    <div className="cloud" style={style}>
      <span className="absolute -top-5 left-6 w-16 h-16 rounded-full bg-white/95" />
      <span className="absolute -top-8 left-16 w-24 h-24 rounded-full bg-white/95" />
      <span className="absolute -top-4 left-32 w-14 h-14 rounded-full bg-white/95" />
    </div>
  );
}

export default function LoginGate() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<AuthStatus>('/auth/status')
      .then((s) => {
        setStatus(s);
        if (s.authenticated) router.replace('/dashboard');
      })
      .catch(() => setStatus({ needsSetup: false, tourCompleted: false }));
  }, [router]);

  const setup = status?.needsSetup;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (setup && password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      await api(setup ? '/auth/setup' : '/auth/login', { body: { password } });
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sky-gradient min-h-screen relative overflow-hidden flex flex-col">
      {/* clouds */}
      <Cloud style={{ width: 220, height: 70, left: -40, bottom: 60 }} />
      <Cloud style={{ width: 300, height: 90, right: -60, bottom: 30 }} />
      <Cloud style={{ width: 160, height: 55, left: '10%', top: 180, opacity: 0.55 }} />
      <Cloud style={{ width: 190, height: 60, right: '8%', top: 120, opacity: 0.5 }} />

      {/* nav */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Baymax-Shoppey" className="w-9 h-9 rounded-xl shadow-md" />
          <span className="font-extrabold text-white text-lg tracking-tight drop-shadow-sm">
            baymax<span className="text-navy/80">-shoppey</span>
          </span>
        </div>
        <span className="text-xs font-semibold text-white/80 bg-white/20 backdrop-blur px-3 py-1.5 rounded-full">
          🔒 Private store
        </span>
      </header>

      {/* hero + gate */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-16">
        <div className="text-center mb-8 fade-up">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mascot.png"
            alt="Baymax mascot"
            className="w-24 h-24 mx-auto mb-5 drop-shadow-[0_10px_25px_rgba(11,22,51,.3)]"
          />
          <h1 className="text-4xl md:text-5xl font-extrabold text-navy tracking-tight leading-[1.05]">
            Your store, on autopilot.
          </h1>
          <p className="text-navy/70 mt-3 text-base md:text-lg max-w-md mx-auto">
            Baymax writes, schedules and tracks your TikTok &amp; YouTube promos — while you focus on sales.
          </p>
        </div>

        {status && status.dbReady === false ? (
          <div className="bg-white/95 backdrop-blur rounded-3xl shadow-[0_20px_60px_rgba(11,22,51,.25)] p-7 w-full max-w-sm fade-up">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🔧</span>
              <h2 className="font-bold text-navy">Almost there</h2>
            </div>
            <p className="text-xs text-navy/55 leading-relaxed">
              This deployment is waiting for its environment keys. In <b>Vercel → Settings → Environment Variables</b>{' '}
              add <code className="font-bold bg-navy/5 px-1 rounded">SUPABASE_SERVICE_KEY</code> (and optionally{' '}
              <code className="font-bold bg-navy/5 px-1 rounded">GEMINI_API_KEY</code>), then redeploy — everything else is
              already wired up.
            </p>
            <p className="text-[11px] text-navy/40 mt-4">Baymax-Shoppey v1.0 · private store</p>
          </div>
        ) : (
        <form
          onSubmit={submit}
          className="bg-white/95 backdrop-blur rounded-3xl shadow-[0_20px_60px_rgba(11,22,51,.25)] p-7 w-full max-w-sm fade-up"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{setup ? '👋' : '🔐'}</span>
            <h2 className="font-bold text-navy">{setup ? 'Create your password' : 'Welcome back'}</h2>
          </div>
          <p className="text-xs text-navy/50 mb-5">
            {setup
              ? 'First time here? Choose a master password — stored hashed, only you can enter.'
              : 'Enter your master password to open the dashboard.'}
          </p>

          <label className="block text-xs font-semibold text-navy/70 mb-1.5">Password</label>
          <Input
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoFocus
            className="mb-3"
          />
          {setup && (
            <>
              <label className="block text-xs font-semibold text-navy/70 mb-1.5">Confirm password</label>
              <Input type="password" value={confirm} onChange={setConfirm} placeholder="••••••••" className="mb-3" />
            </>
          )}

          {error && (
            <p className="text-xs text-danger font-semibold bg-danger/5 rounded-lg px-3 py-2 mb-3">{error}</p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={busy || status === null}>
            {busy ? 'One sec…' : setup ? 'Create & enter' : 'Enter my store'}
          </Button>

          <p className="text-[11px] text-navy/40 text-center mt-4">
            Only the owner has access · Baymax-Shoppey v1.0
          </p>
        </form>
        )}
      </div>
    </main>
  );
}
