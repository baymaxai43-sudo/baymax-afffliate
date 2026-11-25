'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui';

const sections = [
  { title: 'Profile', description: 'Your personal details and account information', href: '/settings#profile', icon: 'eye' },
  { title: 'Scheduled Tasks', description: 'Review and manage scheduled activity', href: '/content?status=scheduled', icon: 'calendar' },
  { title: 'Connected Accounts', description: 'Manage social and affiliate connections', href: '/settings#connected-accounts', icon: 'external' },
  { title: 'Wallet', description: 'Affiliate earnings and payment information', href: '/analytics', icon: 'chart' },
  { title: 'Security', description: 'Password and account protection', href: '/settings#security', icon: 'gear' },
  { title: 'System Preferences', description: 'Theme and workspace preferences', href: '/settings#appearance', icon: 'gear' },
  { title: 'Autopilot Settings', description: 'Control how Baymax works for you', href: '/settings#autopilot', icon: 'zap' },
  { title: 'Content', description: 'Your generated posts and publishing queue', href: '/content', icon: 'file' },
  { title: 'Analytics', description: 'Clicks, sales and performance insights', href: '/analytics', icon: 'chart' },
  { title: 'About', description: 'Learn more about Baymax', href: '/about', icon: 'eye' },
];

function ProfileBody() {
  const router = useRouter();
  async function signOut() {
    if (window.localStorage.getItem('baymax-demo-session') === 'active') {
      window.localStorage.removeItem('baymax-demo-session');
    } else {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
    }
    router.replace('/');
  }
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/baymax-icon.png" alt="" className="h-14 w-14 rounded-2xl bg-white shadow-sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-sky-deep">Your account</p>
            <h2 className="mt-1 text-xl font-extrabold text-navy">Baymax workspace</h2>
            <p className="mt-1 text-xs text-navy/45">Manage your profile, connections and preferences</p>
          </div>
        </div>
      </Card>
      <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/55 p-2 shadow-[0_16px_48px_rgba(35,72,118,.09)] backdrop-blur-xl">
        {sections.map((item, index) => (
          <Link key={item.title} href={item.href} className="flex items-center gap-3 rounded-2xl px-3 py-3.5 transition hover:bg-white/75 sm:px-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-deep/10 text-sky-deep">
              <Icon name={item.icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm font-bold text-navy">{item.title}</strong>
              <span className="mt-0.5 block text-xs text-navy/45">{item.description}</span>
            </span>
            <Icon name="external" className="h-3.5 w-3.5 shrink-0 text-navy/35" />
          </Link>
        ))}
      </div>
      <button onClick={signOut} className="flex w-full items-center gap-3 rounded-2xl border border-rose-200/70 bg-white/45 px-4 py-4 text-left text-sm font-bold text-rose-600 transition hover:bg-rose-50/70">
        <Icon name="logout" className="h-4 w-4" /> Sign Out
        <Icon name="external" className="ml-auto h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function ProfilePage() {
  return <AppShell title="Profile"><ProfileBody /></AppShell>;
}
