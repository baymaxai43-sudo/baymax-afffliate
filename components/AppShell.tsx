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


export function AppShell({ title, children, actions, back }: { title: string; children: ReactNode; actions?: ReactNode; back?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    // Clear any leftover flag from the old local-only demo gate
    window.localStorage.removeItem('baymax-demo-session');
    api<AuthStatus>('/auth/status')
      .then((s) => {
        setStatus(s);
        if (!s.authenticated) router.replace('/');
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

  function goBack() {
    // Return to wherever the user came from; fall back to the given page.
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(back || '/profile');
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
        <Link href="/dashboard" className="bx-home-btn" aria-label="Home" title="Home">
          <Icon name="home" className="w-5 h-5" />
        </Link>
        <nav className="baymax-nav baymax-nav-desktop" aria-label="Primary navigation">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={`baymax-nav-link ${item.href === '/dashboard' ? 'bx-nav-home' : ''} ${activeNav(item.href) ? 'is-active' : ''}`}>
              <Icon name={item.icon} className="w-[17px] h-[17px]" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="baymax-top-actions">
          {actions}
          <Link href="/profile" className="baymax-avatar-button" aria-label="Open profile page">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/baymax-icon.png" alt="" />
            <span className="baymax-online-dot" />
          </Link>
        </div>
      </header>

      <main className={`baymax-main ${title === 'Chat' ? 'baymax-main-chat' : ''}`}>
        {title !== 'Chat' && pathname !== '/profile' && title !== 'Dashboard' && <div className="baymax-page-heading">
          <div className="bx-heading-row">
            {back && (
              <button type="button" onClick={goBack} className="bx-back-btn" aria-label="Go back" title="Back">
                <Icon name="chevron-left" className="w-5 h-5" />
              </button>
            )}
          <div>
            <p className="baymax-eyebrow">YOUR AFFILIATE WORKSPACE</p>
            <h1>{title === 'Dashboard' ? 'Home' : title === 'Products' ? 'Product' : title}</h1>
          </div>
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
