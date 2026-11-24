'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, Input } from '@/components/ui';
import { Icon } from '@/components/icons';

interface Settings {
  autopilot: { enabled: boolean; dailyPerPlatform: number; times: string[]; brandVoice: string };
  ai: { configured: boolean; primary: string; gemini: boolean; groq: boolean };
  social: { youtube: boolean; tiktok: boolean };
}
interface Connections {
  youtube: { configured: boolean; connected: boolean; channel: string | null };
  tiktok: { configured: boolean; connected: boolean; username: string | null };
}

export default function SettingsPage() {
  return (
    <AppShell title="Settings">
      <Suspense fallback={<div className="text-center py-16 text-navy/40 text-sm">Loading…</div>}>
        <SettingsBody />
      </Suspense>
    </AppShell>
  );
}

function SettingsBody() {
  const params = useSearchParams();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [connections, setConnections] = useState<Connections | null>(null);
  const [autopilot, setAutopilot] = useState<Settings['autopilot'] | null>(null);
  const [times, setTimes] = useState('');
  const [voice, setVoice] = useState('');
  const [saved, setSaved] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');

  async function load() {
    try {
      const [s, c] = await Promise.all([api<Settings>('/settings'), api<Connections>('/connections')]);
      setSettings(s);
      setConnections(c);
      setAutopilot(s.autopilot);
      setTimes(s.autopilot.times.join(', '));
      setVoice(s.autopilot.brandVoice);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const status = params?.get('connect');
    if (!status) return;
    const ok = params?.get('status') === 'ok';
    setSaved(ok ? `${status} connected successfully! 🎉` : `${status} connection failed — check API credentials.`);
    setTimeout(() => setSaved(''), 5000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function saveAutopilot() {
    if (!autopilot) return;
    const parsedTimes = times
      .split(',')
      .map((t) => t.trim())
      .filter((t) => /^\d{1,2}:\d{2}$/.test(t));
    try {
      const r = await api<{ autopilot: Settings['autopilot'] }>('/settings/autopilot', {
        method: 'PATCH',
        body: { ...autopilot, times: parsedTimes.length ? parsedTimes : undefined, brandVoice: voice },
      });
      setAutopilot(r.autopilot);
      setSaved('Autopilot settings saved ✓');
      setTimeout(() => setSaved(''), 2500);
    } catch (e: any) {
      alert(e?.message ?? 'Save failed');
    }
  }

  async function runNow() {
    setSaved('Running scheduler…');
    try {
      const r = await api<{ published: number; generated: number }>('/settings/run-now', { method: 'POST' });
      setSaved(`Done — published ${r.published}, generated ${r.generated} ✓`);
      await load();
    } catch (e: any) {
      setSaved(e?.message ?? 'Failed');
    }
    setTimeout(() => setSaved(''), 4000);
  }

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
    <div className="space-y-6 max-w-3xl">
      {saved && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-navy text-white text-sm font-semibold px-5 py-3 rounded-full shadow-2xl fade-up">
          {saved}
        </div>
      )}

      {/* Autopilot */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-sky-deep/10 text-sky-deep flex items-center justify-center">
            <Icon name="zap" />
          </div>
          <div>
            <h2 className="font-bold text-navy">Autopilot</h2>
            <p className="text-xs text-navy/45">Baymax generates &amp; posts for you automatically</p>
          </div>
          <button
            onClick={() => autopilot && setAutopilot({ ...autopilot, enabled: !autopilot.enabled })}
            className={`ml-auto w-14 h-8 rounded-full transition relative ${autopilot?.enabled ? 'bg-success' : 'bg-navy/15'}`}
            aria-label="Toggle autopilot"
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${
                autopilot?.enabled ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        {autopilot && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-navy/70 uppercase tracking-wide mb-1.5">
                Posts per platform / day
              </label>
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => setAutopilot({ ...autopilot, dailyPerPlatform: n })}
                    className={`w-12 h-10 rounded-xl text-sm font-bold border transition ${
                      autopilot.dailyPerPlatform === n
                        ? 'bg-sky-deep text-white border-sky-deep shadow-lg shadow-sky-deep/20'
                        : 'bg-white text-navy/55 border-navy/10'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-navy/70 uppercase tracking-wide mb-1.5">
                Posting times (comma separated, 24h)
              </label>
              <Input value={times} onChange={setTimes} placeholder="10:00, 15:00, 19:00" />
            </div>
            <div>
              <label className="block text-xs font-bold text-navy/70 uppercase tracking-wide mb-1.5">
                Brand voice
              </label>
              <textarea
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-navy/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-sky-deep focus:ring-2 focus:ring-sky-deep/20 transition resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="sky" onClick={saveAutopilot}>
                Save settings
              </Button>
              <Button variant="outline" onClick={runNow}>
                <Icon name="refresh" className="w-4 h-4" /> Run scheduler now
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Social connections */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-sky-deep/10 text-sky-deep flex items-center justify-center">
            <Icon name="external" />
          </div>
          <div>
            <h2 className="font-bold text-navy">Social accounts</h2>
            <p className="text-xs text-navy/45">Connect where Baymax publishes</p>
          </div>
        </div>
        <div className="space-y-3">
          {(
            [
              {
                key: 'youtube',
                emoji: '▶️',
                name: 'YouTube',
                cfg: connections?.youtube.configured,
                conn: connections?.youtube.connected,
                detail: connections?.youtube.channel,
                needs: 'YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET',
              },
              {
                key: 'tiktok',
                emoji: '🎵',
                name: 'TikTok',
                cfg: connections?.tiktok.configured,
                conn: connections?.tiktok.connected,
                detail: connections?.tiktok.username,
                needs: 'TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET',
              },
            ] as const
          ).map((s) => (
            <div key={s.key} className="flex items-center gap-3 bg-cloud rounded-xl px-4 py-3.5">
              <span className="text-xl">{s.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-navy">{s.name}</span>
                  {s.conn ? <Badge tone="green">connected</Badge> : <Badge tone="gray">not connected</Badge>}
                </div>
                <p className="text-[11px] text-navy/45 truncate">
                  {s.conn ? s.detail ?? 'ready to publish' : s.cfg ? 'Click connect to authorize' : `Set ${s.needs} in env first`}
                </p>
              </div>
              {s.conn ? (
                <Button size="sm" variant="danger" onClick={() => { api(`/connections/${s.key}`, { method: 'DELETE' }).then(load); }}>
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="sky"
                  disabled={!s.cfg}
                  onClick={() => (window.location.href = `/api/connections/${s.key}/start`)}
                >
                  Connect
                </Button>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-navy/40 mt-3">
          Without a connection, Baymax still writes &amp; schedules everything — publishing waits until you connect.
        </p>
      </Card>

      {/* AI engine */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-sky-deep/10 text-sky-deep flex items-center justify-center">
            <Icon name="sparkles" />
          </div>
          <div>
            <h2 className="font-bold text-navy">AI engine</h2>
            <p className="text-xs text-navy/45">Gemini primary · Groq fallback</p>
          </div>
          <div className="ml-auto">
            {settings && (
              <Badge tone={settings.ai.configured ? 'green' : 'amber'}>
                {settings.ai.configured ? settings.ai.primary : 'keys missing'}
              </Badge>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-cloud rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="font-semibold text-navy/70">Gemini</span>
            <Badge tone={settings?.ai.gemini ? 'green' : 'gray'}>{settings?.ai.gemini ? 'set' : 'missing'}</Badge>
          </div>
          <div className="bg-cloud rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="font-semibold text-navy/70">Groq fallback</span>
            <Badge tone={settings?.ai.groq ? 'green' : 'gray'}>{settings?.ai.groq ? 'set' : 'missing'}</Badge>
          </div>
        </div>
        {!settings?.ai.configured && (
          <p className="text-xs text-navy/50 mt-3 bg-warn/5 border border-warn/20 rounded-xl px-4 py-3">
            Add <code className="font-bold">GEMINI_API_KEY</code> (and optionally <code className="font-bold">GROQ_API_KEY</code>) to your
            Render environment variables (<code className="font-bold">GEMINI_API_KEY</code> / <code className="font-bold">GROQ_API_KEY</code>) to enable the full brain.
          </p>
        )}
      </Card>

      {/* Password */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-sky-deep/10 text-sky-deep flex items-center justify-center">
            <Icon name="gear" />
          </div>
          <div>
            <h2 className="font-bold text-navy">Change password</h2>
            <p className="text-xs text-navy/45">Stored hashed — never in plain text</p>
          </div>
        </div>
        <div className="space-y-3 max-w-sm">
          <Input type="password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} placeholder="Current password" />
          <Input type="password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} placeholder="New password (8+ chars)" />
          <Input type="password" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} placeholder="Confirm new password" />
          {pwMsg && (
            <p className={`text-xs font-semibold ${pwMsg.includes('✓') ? 'text-success' : 'text-danger'}`}>{pwMsg}</p>
          )}
          <Button variant="primary" onClick={changePassword} disabled={!pw.current || !pw.next}>
            Update password
          </Button>
        </div>
      </Card>
    </div>
  );
}
