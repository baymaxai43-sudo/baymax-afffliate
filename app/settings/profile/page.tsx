'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Button, Input } from '@/components/ui';
import { Icon } from '@/components/icons';

export interface Profile {
  id: string;
  name: string;
  email: string;
  niche: string;
  bio: string;
  color: string;
  createdAt: string;
}
interface Store { items: Profile[]; activeId: string | null }

const EMPTY = { name: '', email: '', niche: '', bio: '' };

export default function ProfileSettingsPage() {
  return <AppShell title="Profile" back="/profile"><ProfilesBody /></AppShell>;
}

function ProfilesBody() {
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    api<Store>('/profiles').then(setStore).catch((e) => setError(e?.message ?? 'Could not load profiles'));
  }, []);

  async function add() {
    if (!form.name.trim()) return;
    setBusy('add'); setError('');
    try {
      const r = await api<Store>('/profiles', { body: form });
      setStore({ items: r.items, activeId: r.activeId });
      setForm(EMPTY); setAdding(false);
    } catch (e: any) { setError(e?.message ?? 'Could not add profile'); }
    finally { setBusy(null); }
  }

  async function activate(id: string) {
    setBusy(id); setError('');
    try { setStore(await api<Store>(`/profiles/${id}/active`, { method: 'PATCH' })); }
    catch (e: any) { setError(e?.message ?? 'Could not switch profile'); }
    finally { setBusy(null); }
  }

  async function remove(id: string) {
    setBusy(id); setError('');
    try { setStore(await api<Store>(`/profiles/${id}`, { method: 'DELETE' })); setConfirmId(null); }
    catch (e: any) { setError(e?.message ?? 'Could not remove profile'); }
    finally { setBusy(null); }
  }

  return (
    <div className="baymax-profile-page bx-sub-page">
      {error && <p className="bx-form-msg is-err" role="alert">{error}</p>}

      <section className="baymax-profile-group" aria-label="Profiles">
        {!store && !error && <div className="baymax-profile-row bx-static-row"><span className="bx-muted">Loading profiles…</span></div>}
        {store && store.items.length === 0 && !adding && (
          <div className="bx-empty-row">
            <p>No profiles yet</p>
            <span>Add one for each brand or persona you post as.</span>
          </div>
        )}
        {store?.items.map((p) => {
          const active = p.id === store.activeId;
          return (
            <div className="baymax-profile-row bx-profile-item" key={p.id}>
              <span className="bx-avatar" style={{ background: p.color }} aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
              <div className="bx-profile-meta">
                <strong>{p.name}{active && <em className="bx-active-tag">Active</em>}</strong>
                <span>{[p.email, p.niche].filter(Boolean).join(' · ') || 'No details'}</span>
              </div>
              <div className="bx-profile-actions">
                {confirmId === p.id ? (
                  <>
                    <Button size="sm" variant="danger" onClick={() => remove(p.id)} disabled={busy === p.id}>Remove</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
                  </>
                ) : (
                  <>
                    {!active && <Button size="sm" variant="outline" onClick={() => activate(p.id)} disabled={busy === p.id}>Set active</Button>}
                    <button type="button" className="bx-icon-btn" onClick={() => setConfirmId(p.id)} aria-label={`Remove ${p.name}`} title="Remove">
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {store && !adding && (
          <button type="button" className="baymax-profile-row bx-add-row" onClick={() => setAdding(true)}>
            <Icon name="plus" className="baymax-profile-row-icon" />
            <span>Add profile</span>
          </button>
        )}
      </section>

      {adding && (
        <section className="baymax-profile-group bx-form-group" aria-label="New profile">
          <h2 className="bx-group-title">New profile</h2>
          <div className="bx-form-stack">
            <Input autoFocus value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Name (required)" />
            <Input type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="Email" />
            <Input value={form.niche} onChange={(v) => setForm({ ...form, niche: v })} placeholder="Niche, e.g. tech gadgets" />
            <Input value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} placeholder="Short bio" />
            <div className="bx-form-buttons">
              <Button variant="primary" onClick={add} disabled={!form.name.trim() || busy === 'add'}>{busy === 'add' ? 'Saving…' : 'Save profile'}</Button>
              <Button variant="ghost" onClick={() => { setAdding(false); setForm(EMPTY); }}>Cancel</Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
