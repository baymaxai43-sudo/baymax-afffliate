'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card } from '@/components/ui';
import { Icon } from '@/components/icons';
import { api, ApiError, type AutopilotSettings, type ConnectionsStatus } from '@/lib/api';

const PLATFORMS = [
  { name: 'YouTube', mark: '▶', detail: 'Video publishing and channel growth' },
  { name: 'TikTok', mark: '♪', detail: 'Short-form video publishing' },
  { name: 'Instagram', mark: '◎', detail: 'Reels, posts and audience growth' },
  { name: 'Facebook', mark: 'f', detail: 'Pages and community publishing' },
  { name: 'Pinterest', mark: 'P', detail: 'Pins and product discovery' },
  { name: 'X', mark: '𝕏', detail: 'Posts and audience engagement' },
  { name: 'Threads', mark: '@', detail: 'Text updates and conversations' },
  { name: 'Telegram', mark: '➤', detail: 'Channel updates and community' },
  { name: 'Reddit', mark: 'r/', detail: 'Community posts and discussions' },
  { name: 'Snapchat', mark: '👻', detail: 'Stories and short-form content' },
  { name: 'LinkedIn', mark: 'in', detail: 'Professional content and updates' },
  { name: 'WhatsApp', mark: '◉', detail: 'Channel and community updates' },
  { name: 'Twitch', mark: '▣', detail: 'Live-stream announcements' },
  { name: 'Medium', mark: 'M', detail: 'Articles and long-form content' },
];

const LIVE = ['YouTube', 'TikTok'] as const;

function ConnectedAccountsBody() {
  const [conn, setConn] = useState<ConnectionsStatus | null>(null);
  const [autopilot, setAutopilot] = useState<AutopilotSettings | null>(null);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [c, s] = await Promise.all([
      api<ConnectionsStatus>('/connections'),
      api<{ autopilot: AutopilotSettings }>('/settings'),
    ]);
    setConn(c);
    setAutopilot(s.autopilot);
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const platform = q.get('connect');
    if (platform) {
      const ok = q.get('status') === 'ok';
      setNotice({ tone: ok ? 'green' : 'red', text: ok ? `${platform} connected.` : `${platform} connection failed. Try again.` });
      window.history.replaceState(null, '', '/connected-accounts');
    }
    load().catch((e) => setNotice({ tone: 'red', text: e instanceof ApiError ? e.message : 'Could not load connections.' }));
  }, []);

  function stateFor(name: string) {
    if (!conn) return null;
    if (name === 'YouTube') return { ...conn.youtube, label: conn.youtube.channel };
    if (name === 'TikTok') return { ...conn.tiktok, label: conn.tiktok.username };
    return null;
  }

  async function toggleConnection(name: string) {
    const key = name.toLowerCase();
    const st = stateFor(name);
    if (!st) return;
    if (!st.connected) {
      window.location.href = `/api/connections/${key}/start`;
      return;
    }
    setBusy(name);
    try {
      await api(`/connections/${key}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setNotice({ tone: 'red', text: e instanceof ApiError ? e.message : 'Disconnect failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function toggleAutopilot() {
    if (!autopilot) return;
    setBusy('autopilot');
    try {
      const res = await api<{ autopilot: AutopilotSettings }>('/settings/autopilot', {
        method: 'PATCH',
        body: { enabled: !autopilot.enabled },
      });
      setAutopilot(res.autopilot);
    } catch (e) {
      setNotice({ tone: 'red', text: e instanceof ApiError ? e.message : 'Could not update autopilot.' });
    } finally {
      setBusy(null);
    }
  }

  const connectedCount = conn ? [conn.youtube.connected, conn.tiktok.connected].filter(Boolean).length : 0;
  const enabled = Boolean(autopilot?.enabled);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      {notice && (
        <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${notice.tone === 'green' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {notice.text}
        </div>
      )}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-deep/10 text-sky-deep">
            <Icon name="external" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-sky-deep">Workspace connections</p>
            <h2 className="mt-1 text-xl font-extrabold text-navy">Connected accounts</h2>
            <p className="mt-1 text-xs text-navy/50">Choose the social channels Baymax can publish to.</p>
          </div>
          <Badge tone="blue">{connectedCount} connected</Badge>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="mb-4">
          <h3 className="font-bold text-navy">Social media platforms</h3>
          <p className="mt-1 text-xs text-navy/45">YouTube and TikTok connect through official OAuth. More platforms are on the way.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLATFORMS.map((platform) => {
            const live = (LIVE as readonly string[]).includes(platform.name);
            const st = stateFor(platform.name);
            const isConnected = Boolean(st?.connected);
            const configured = Boolean(st?.configured);
            const badge = !live ? 'Coming soon' : !conn ? 'Loading' : isConnected ? (st?.label ? `Connected · ${st.label}` : 'Connected') : configured ? 'Disconnected' : 'Not configured';
            return (
              <div key={platform.name} className={`flex min-w-0 items-center gap-3 rounded-2xl border border-navy/5 bg-white/70 px-3 py-3 ${live ? '' : 'opacity-60'}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-deep/10 text-sm font-black text-sky-deep">
                  {platform.mark}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-navy">{platform.name}</span>
                    <Badge tone={isConnected ? 'green' : live && !configured && conn ? 'amber' : 'gray'}>{badge}</Badge>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-navy/45">{platform.detail}</p>
                </div>
                {live && (
                  <Button
                    size="sm"
                    variant={isConnected ? 'outline' : 'sky'}
                    disabled={!conn || (!configured && !isConnected) || busy === platform.name}
                    onClick={() => toggleConnection(platform.name)}
                  >
                    {busy === platform.name ? '…' : isConnected ? 'Disconnect' : 'Connect'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {conn && (!conn.youtube.configured || !conn.tiktok.configured) && (
          <p className="mt-4 rounded-xl border border-sky-deep/10 bg-sky-deep/5 px-4 py-3 text-[11px] leading-relaxed text-navy/55">
            "Not configured" means the backend is missing that platform's OAuth client (YOUTUBE_CLIENT_ID / TIKTOK_CLIENT_KEY). Add it on the server, then connect here.
          </p>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-deep/10 text-sky-deep">
            <Icon name="zap" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-navy">Baymax Autopilot</h3>
            <p className="mt-1 text-xs text-navy/45">Generates and publishes posts on your schedule.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Turn Baymax Autopilot on or off"
            disabled={!autopilot || busy === 'autopilot'}
            onClick={toggleAutopilot}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${enabled ? 'bg-success' : 'bg-navy/20'}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone={enabled ? 'green' : 'gray'}>{autopilot ? (enabled ? 'Autopilot enabled' : 'Autopilot paused') : 'Loading'}</Badge>
          {autopilot && (
            <span className="text-xs text-navy/45">
              {autopilot.dailyPerPlatform}/day per platform at {autopilot.times.join(', ')}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function ConnectedAccountsPage() {
  return <AppShell title="Connected Accounts"><ConnectedAccountsBody /></AppShell>;
}
