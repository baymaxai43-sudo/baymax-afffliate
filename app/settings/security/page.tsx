'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Button, Input } from '@/components/ui';

export default function SecurityPage() {
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setMsg(null);
    if (pw.next.length < 8) return setMsg({ ok: false, text: 'New password must be at least 8 characters' });
    if (pw.next !== pw.confirm) return setMsg({ ok: false, text: 'New passwords do not match' });
    setBusy(true);
    try {
      await api('/auth/password', { body: { current: pw.current, next: pw.next } });
      setPw({ current: '', next: '', confirm: '' });
      setMsg({ ok: true, text: 'Password updated' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Could not update password' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Security" back="/profile">
      <div className="baymax-profile-page bx-sub-page">
        <section className="baymax-profile-group bx-form-group" aria-label="Change password">
          <h2 className="bx-group-title">Password</h2>
          <div className="bx-form-stack">
            <Input type="password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} placeholder="Current password" />
            <Input type="password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} placeholder="New password (8+ characters)" />
            <Input type="password" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} placeholder="Confirm new password" />
            {msg && <p className={`bx-form-msg ${msg.ok ? 'is-ok' : 'is-err'}`} role="status">{msg.text}</p>}
            <div><Button variant="primary" onClick={save} disabled={busy || !pw.current || !pw.next}>{busy ? 'Saving…' : 'Update password'}</Button></div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
