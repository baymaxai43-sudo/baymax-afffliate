'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, Input } from '@/components/ui';
import { Icon } from '@/components/icons';

export default function SettingsPage() {
  return <AppShell title="Settings"><SettingsBody /></AppShell>;
}

function SettingsBody() {
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');

  async function changePassword() {
    setPwMsg('');
    if (pw.next !== pw.confirm) return setPwMsg('New passwords do not match');
    try {
      await api('/auth/password', { body: { current: pw.current, next: pw.next } });
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg('Password updated ✓');
    } catch (e: any) {
      setPwMsg(e?.message ?? 'Failed');
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div id="profile" className="rounded-3xl border border-white/70 bg-white/35 p-4 md:p-5">
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[.16em] text-sky-deep">Account preferences</p>
        <h2 className="text-lg font-extrabold text-navy">Workspace settings</h2>
        <p className="mt-1 text-xs text-navy/55">Connected social accounts and Autopilot are managed together on the Connected Accounts page.</p>
        <a href="/connected-accounts" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-sky-deep hover:underline">
          Manage connections and Autopilot <Icon name="external" className="h-3.5 w-3.5" />
        </a>
      </div>

      <div id="security"><Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-deep/10 text-sky-deep">
            <Icon name="gear" />
          </div>
          <div>
            <h2 className="font-bold text-navy">Change password</h2>
            <p className="text-xs text-navy/45">Update your workspace password</p>
          </div>
        </div>
        <div className="max-w-sm space-y-3">
          <Input type="password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} placeholder="Current password" />
          <Input type="password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} placeholder="New password (8+ chars)" />
          <Input type="password" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} placeholder="Confirm new password" />
          {pwMsg && <p className={`text-xs font-semibold ${pwMsg.includes('✓') ? 'text-success' : 'text-danger'}`}>{pwMsg}</p>}
          <Button variant="primary" onClick={changePassword} disabled={!pw.current || !pw.next}>Update password</Button>
        </div>
      </Card></div>

      <div id="appearance" className="rounded-3xl border border-white/70 bg-white/45 p-5">
        <h2 className="font-bold text-navy">Appearance</h2>
        <p className="mt-1 text-xs text-navy/50">Baymax currently uses the atmospheric blue and translucent glass theme.</p>
        <Badge tone="blue">Blue glass theme active</Badge>
      </div>
    </div>
  );
}
