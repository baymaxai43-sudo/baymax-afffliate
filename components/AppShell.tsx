'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type AuthStatus } from '@/lib/api';
import { Icon } from './icons';
import { Tour } from './Tour';

const NAV = [
  { href: '/dashboard', label: 'Home', icon: 'dashboard' },
  { href: '/chat', label: 'Chat', icon: 'chat' },
  { href: '/products', label: 'Product', icon: 'box' },
];


export function AppShell({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    // Clear any leftover flag from the old local-only demo gate
    window.localStorage.removeItem('baymax-demo-session');
    api<AuthStatus>('/auth/status')
      .then((s) => {
        setStatus(s);
        if (!s.authenticated) router.replace('/');
        else api<{ autopilot: { enabled: boolean } }>('/settings').then((r) => setLive(r.autopilot.enabled)).catch(() => {});
      })
      .catch(() => router.replace('/'));
  }, [router]);

  if (!status?.authenticated) {
    return (
      <div className="bx-boot min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/baymax-icon.png" alt="" className="w-12 h-12 animate-pulse rounded-full" />
          <p className="text-sm font-medium">Powering up Baymax…</p>
        </div>
      </div>
    );
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/');
  }

  const activeNav = (href: string) => pathname === href || (href === '/dashboard' && pathname === '/');

  return (
    <div className="baymax-app min-h-screen text-navy">
      <div className="baymax-atmosphere" aria-hidden="true">
        <span className="baymax-cloud cloud-one" />
        <span className="baymax-cloud cloud-two" />
        <span className="baymax-cloud cloud-three" />
        <span className="baymax-glow glow-one" />
        <span className="baymax-glow glow-two" />
      </div>

      <header className="baymax-topbar">
        <Link href="/dashboard" className="bx-home-btn" aria-label="Baymax home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/baymax-icon.png" alt="" />
        </Link>
        <nav className="baymax-nav baymax-nav-desktop" aria-label="Primary navigation">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={`baymax-nav-link ${activeNav(item.href) ? 'is-active' : ''}`}>
              <Icon name={item.icon} className="w-[17px] h-[17px]" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="baymax-top-actions">
          {live !== null && (
            <Link href="/connected-accounts" className={`bx-live-pill ${live ? 'is-on' : ''}`} title="Autopilot status">
              <span className="bx-live-dot" />
              <span className="bx-live-label">{live ? 'Autopilot live' : 'Autopilot paused'}</span>
            </Link>
          )}
          {actions}
          <Link href="/profile" className="baymax-avatar-button" aria-label="Open profile page">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/baymax-icon.png" alt="" />
            <span className="baymax-online-dot" />
          </Link>
        </div>
      </header>

      <main className={`baymax-main ${title === 'Chat' ? 'baymax-main-chat' : ''}`}>
        {title !== 'Chat' && title !== 'Profile' && title !== 'Dashboard' && <div className="baymax-page-heading">
          <div>
            <p className="baymax-eyebrow">YOUR AFFILIATE WORKSPACE</p>
            <h1>{title === 'Dashboard' ? 'Home' : title === 'Products' ? 'Product' : title}</h1>
          </div>
        </div>}
        {children}
      </main>

      <nav className="baymax-nav baymax-nav-mobile" aria-label="Primary navigation" hidden>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`baymax-nav-link ${activeNav(item.href) ? 'is-active' : ''}`}>
            <Icon name={item.icon} className="w-[18px] h-[18px]" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {!status.tourCompleted && <Tour onDone={() => setStatus((s) => s && { ...s, tourCompleted: true })} />}
    </div>
  );
}
