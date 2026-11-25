'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card } from '@/components/ui';
import { Icon } from '@/components/icons';

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

const CONNECTIONS_KEY = 'baymax-demo-social-connections';
const AUTOPILOT_KEY = 'baymax-demo-autopilot-enabled';

function ConnectedAccountsBody() {
  const [connected, setConnected] = useState<string[]>([]);
  const [autopilot, setAutopilot] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const savedConnections = JSON.parse(localStorage.getItem(CONNECTIONS_KEY) || '[]');
      if (Array.isArray(savedConnections)) setConnected(savedConnections.filter((x) => typeof x === 'string'));
      setAutopilot(localStorage.getItem(AUTOPILOT_KEY) === 'true');
    } catch {
      setConnected([]);
      setAutopilot(false);
    }
    setReady(true);
  }, []);

  function toggleConnection(name: string) {
    setConnected((current) => {
      const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
      localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function toggleAutopilot() {
    setAutopilot((current) => {
      const next = !current;
      localStorage.setItem(AUTOPILOT_KEY, String(next));
      return next;
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-deep/10 text-sky-deep">
            <Icon name="external" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-sky-deep">Workspace connections</p>
            <h2 className="mt-1 text-xl font-extrabold text-navy">Connected accounts</h2>
            <p className="mt-1 text-xs text-navy/50">Choose the social channels Baymax can work with.</p>
          </div>
          <Badge tone="blue">{connected.length} demo connected</Badge>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-navy">Social media platforms</h3>
            <p className="mt-1 text-xs text-navy/45">Each platform has its own demo connect action.</p>
          </div>
          <Badge tone="amber">Demo mode</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLATFORMS.map((platform) => {
            const isConnected = connected.includes(platform.name);
            return (
              <div key={platform.name} className="flex min-w-0 items-center gap-3 rounded-2xl border border-navy/5 bg-white/70 px-3 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-deep/10 text-sm font-black text-sky-deep">
                  {platform.mark}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-navy">{platform.name}</span>
                    <Badge tone={isConnected ? 'green' : 'gray'}>{isConnected ? 'Demo connected' : 'Disconnected'}</Badge>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-navy/45">{platform.detail}</p>
                </div>
                <Button size="sm" variant={isConnected ? 'outline' : 'sky'} onClick={() => toggleConnection(platform.name)}>
                  {isConnected ? 'Disconnect' : 'Demo connect'}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="mt-4 rounded-xl border border-sky-deep/10 bg-sky-deep/5 px-4 py-3 text-[11px] leading-relaxed text-navy/55">
          Demo connections only change the preview state in this browser. They do not authorize social accounts, access credentials, or publish content. Real OAuth connections will require your approval later.
        </p>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-deep/10 text-sky-deep">
            <Icon name="zap" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-navy">Baymax Autopilot</h3>
            <p className="mt-1 text-xs text-navy/45">Enable or pause autonomous workflow mode.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autopilot}
            aria-label="Turn Baymax Autopilot on or off"
            disabled={!ready}
            onClick={toggleAutopilot}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${autopilot ? 'bg-success' : 'bg-navy/20'}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${autopilot ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone={autopilot ? 'green' : 'gray'}>{ready ? (autopilot ? 'Autopilot enabled' : 'Autopilot paused') : 'Loading preference'}</Badge>
          <span className="text-xs text-navy/45">Your preference is saved locally in this demo.</span>
        </div>
        <p className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-[11px] leading-relaxed text-amber-900/70">
          Turning this switch on enables the Autopilot preview state only. No posts, messages, purchases, or other actions run automatically in demo mode.
        </p>
      </Card>
    </div>
  );
}

export default function ConnectedAccountsPage() {
  return <AppShell title="Connected Accounts"><ConnectedAccountsBody /></AppShell>;
}
