'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/icons';

const groups = [
  [
    { title: 'Profile', href: '/settings/profile', icon: 'user' },
    { title: 'Studio', href: '/studio', icon: 'sparkles' },
      { title: 'Scheduled Tasks', href: '/content?status=scheduled', icon: 'clock' },
    { title: 'Connected Accounts', href: '/connected-accounts', icon: 'link' },
    { title: 'Wallet', href: '/analytics', icon: 'wallet' },
  ],
  [
    { title: 'Security', href: '/settings/security', icon: 'shield' },
    { title: 'System Preferences', href: '/settings', icon: 'sliders' },
    { title: 'Content', href: '/content', icon: 'file' },
    { title: 'Analytics', href: '/analytics', icon: 'chart' },
    { title: 'About', href: '/about', icon: 'info' },
  ],
];

function ProfileBody() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<{ name: string; email: string; color: string } | null>(null);

  useEffect(() => {
    api<{ items: { id: string; name: string; email: string; color: string }[]; activeId: string | null }>('/profiles')
      .then((r) => setActive(r.items.find((p) => p.id === r.activeId) ?? null))
      .catch(() => {});
  }, []);

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/dashboard');
  }

  const filteredGroups = useMemo(
    () => groups.map((group) => group.filter((item) => item.title.toLowerCase().includes(search.trim().toLowerCase()))).filter((group) => group.length > 0),
    [search],
  );

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/');
  }

  return (
    <div className="baymax-profile-page">
      <button type="button" onClick={goBack} className="bx-back-btn bx-hub-back" aria-label="Go back" title="Back">
        <Icon name="chevron-left" className="w-5 h-5" />
      </button>
      <Link href="/settings/profile" className="baymax-profile-identity bx-hub-identity">
        <span className="bx-avatar" style={{ background: active?.color ?? '#22d3ee' }} aria-hidden="true">
          {(active?.name ?? 'B').charAt(0).toUpperCase()}
        </span>
        <div>
          <h2>{active?.name ?? 'Baymax workspace'}</h2>
          <p>{active ? active.email || 'Active profile' : 'Add a profile to personalise your workspace'}</p>
        </div>
      </Link>

      <div className="baymax-profile-groups">
        {filteredGroups.length > 0 ? filteredGroups.map((group, groupIndex) => (
          <section className="baymax-profile-group" key={groupIndex} aria-label={groupIndex === 0 ? 'Account' : 'Preferences and workspace'}>
            {group.map((item) => (
              <Link href={item.href} className="baymax-profile-row" key={item.title}>
                <Icon name={item.icon} className="baymax-profile-row-icon" />
                <span>{item.title}</span>
                <Icon name="chevron-right" className="baymax-profile-chevron" />
              </Link>
            ))}
          </section>
        )) : (
          <p className="baymax-profile-empty">No matching settings found.</p>
        )}
      </div>

      <button type="button" onClick={signOut} className="baymax-profile-signout">
        <Icon name="logout" className="baymax-profile-row-icon" />
        <span>Sign Out</span>
        <Icon name="chevron-right" className="baymax-profile-chevron" />
      </button>

      <label className="baymax-profile-search">
        <Icon name="search" className="baymax-profile-search-icon" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search"
          aria-label="Search profile settings"
        />
      </label>
    </div>
  );
}

export default function ProfilePage() {
  return <AppShell title="Profile"><ProfileBody /></AppShell>;
}
