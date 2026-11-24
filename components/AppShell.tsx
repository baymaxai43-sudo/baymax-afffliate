'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type AuthStatus } from '@/lib/api';
import { Icon } from './icons';
import { Tour } from './Tour';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/chat', label: 'Chat', icon: 'chat' },
  { href: '/products', label: 'Products', icon: 'box' },
  { href: '/content', label: 'Content', icon: 'sparkles' },
  { href: '/analytics', label: 'Analytics', icon: 'chart' },
  { href: '/settings', label: 'Settings', icon: 'gear' },
];

export function AppShell({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    api<AuthStatus>('/auth/status')
      .then((s) => {
        setStatus(s);
        if (!s.authenticated) router.replace('/');
      })
      .catch(() => router.replace('/'));
  }, [router]);

  if (!status?.authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cloud">
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/baymax-icon.png" alt="" className="w-12 h-12 animate-pulse bg-white rounded-xl" />
          <p className="text-sm text-navy/50 font-medium">Opening your store…</p>
        </div>
      </div>
    );
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/');
  }

  const nav = (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {NAV.map((item) => {
        const active = (pathname ?? '').startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              active
                ? 'bg-sky-deep text-white shadow-lg shadow-sky-deep/25'
                : 'text-navy/60 hover:bg-navy/5 hover:text-navy'
            }`}
          >
            <Icon name={item.icon} className="w-[18px] h-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/baymax-icon.png" alt="Baymax-Shoppey" className="w-9 h-9 rounded-xl shadow-md bg-white" />
      <div className="leading-tight">
        <div className="font-extrabold text-navy text-[15px] tracking-tight">
          baymax<span className="text-sky-deep">-shoppey</span>
        </div>
        <div className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider">affiliate copilot</div>
      </div>
    </div>
  );

  const footer = (
    <div className="px-3 pb-4">
      <button
        onClick={logout}
        className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold text-navy/50 hover:bg-danger/5 hover:text-danger transition"
      >
        <Icon name="logout" className="w-[18px] h-[18px]" />
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-cloud flex">
      {/* desktop sidebar */}
      <aside className="hidden lg:flex w-60 flex-col bg-white border-r border-navy/5 fixed inset-y-0">
        {brand}
        {nav}
        <div className="mt-auto">{footer}</div>
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-navy/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-2xl flex flex-col fade-up">
            {brand}
            {nav}
            <div className="mt-auto">{footer}</div>
          </aside>
        </div>
      )}

      <div className="flex-1 lg:pl-60 min-w-0">
        <header className="sticky top-0 z-30 bg-cloud/85 backdrop-blur border-b border-navy/5">
          <div className="flex items-center gap-3 px-4 md:px-8 h-16">
            <button
              className="lg:hidden p-2 -ml-2 text-navy"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            </button>
            <h1 className="text-lg font-extrabold text-navy tracking-tight">{title}</h1>
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          </div>
        </header>
        <main className="px-4 md:px-8 py-6 max-w-6xl">{children}</main>
      </div>

      {!status.tourCompleted && <Tour onDone={() => setStatus((s) => s && { ...s, tourCompleted: true })} />}
    </div>
  );
}
