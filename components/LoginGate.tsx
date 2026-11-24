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

const FEATURES = [
  { icon: '✍️', text: 'Writes TikTok & YouTube posts for your products — hooks, scripts, hashtags' },
  { icon: '⚡', text: 'Autopilot publishes on a schedule and tracks every click & sale' },
  { icon: '🛍️', text: 'Paste an AliExpress affiliate link — Baymax imports the product instantly' },
  { icon: '💬', text: 'Just ask in chat: “promote my newest product” — it gets done' },
];

export default function LoginGate() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [password, setPassword] = useState('');
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
          <img src="/baymax-icon.png" alt="Baymax-Shoppey" className="w-9 h-9 rounded-xl shadow-md bg-white" />
          <span className="font-extrabold text-white text-lg tracking-tight drop-shadow-sm">
            baymax<span className="text-navy/80">-shoppey</span>
          </span>
        </div>
        <span className="text-xs font-semibold text-white/80 bg-white/20 backdrop-blur px-3 py-1.5 rounded-full">
          🔒 Private store
        </span>
      </header>

      {/* hero + gate */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-14">
        <div className="text-center mb-7 fade-up">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/baymax-hero.png"
            alt="Baymax"
            className="h-36 md:h-44 w-auto mx-auto mb-4 drop-shadow-[0_12px_30px_rgba(11,22,51,.25)]"
          />
          <h1 className="text-4xl md:text-5xl font-extrabold text-navy tracking-tight leading-[1.05]">
            Your store, on autopilot.
          </h1>
          <p className="text-navy/70 mt-3 text-base md:text-lg max-w-md mx-auto">
            Meet Baymax — the AI that runs your affiliate marketing while you focus on sales.
          </p>
        </div>

        {status && status.dbReady === false ? (
          <div className="bg-white/95 backdrop-blur rounded-3xl shadow-[0_20px_60px_rgba(11,22,51,.25)] p-7 w-full max-w-sm fade-up">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🔧</span>
              <h2 className="font-bold text-navy">Almost there</h2>
            </div>
            <p className="text-xs text-navy/55 leading-relaxed">
              Your backend isn’t fully configured yet. Set <code className="font-bold bg-navy/5 px-1 rounded">OWNER_PASSWORD_HASH</code>{' '}
              and <code className="font-bold bg-navy/5 px-1 rounded">SUPABASE_SERVICE_KEY</code> on your backend host (Render → Environment),
              then restart — everything else is already wired up.
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
                ? 'First time here? Choose your master password — stored hashed, only you can enter.'
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

        {/* About Baymax — details under the password form */}
        <div className="mt-8 max-w-md w-full fade-up">
          <div className="grid sm:grid-cols-2 gap-2.5">
            {FEATURES.map((f) => (
              <div
                key={f.text}
                className="flex items-start gap-2.5 bg-white/25 backdrop-blur-sm rounded-2xl px-3.5 py-3 border border-white/30"
              >
                <span className="text-lg leading-none mt-0.5">{f.icon}</span>
                <span className="text-[12px] leading-snug text-navy/85 font-medium">{f.text}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-white/85 font-semibold mt-4 drop-shadow-sm">
            Baymax-Shoppey · your private autonomous affiliate copilot · TikTok + YouTube
          </p>
        </div>
      </div>
    </main>
  );
}
