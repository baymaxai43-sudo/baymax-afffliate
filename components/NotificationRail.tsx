'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type AutopilotSettings, type ConnectionsStatus } from '@/lib/api';
import { Icon } from './icons';

interface Summary {
  products: number;
  scheduled: number;
  published: number;
  clicks7d: number;
  sales7d: number;
  revenue7d: number;
}

interface SettingsRes {
  autopilot: AutopilotSettings;
  ai: { configured: boolean; primary: string };
}

export interface RailAction {
  id: string;
  verb: string;
  text: string;
  tone?: 'energy' | 'warn' | 'calm';
  href?: string;
  prompt?: string;
}

const DISMISS_KEY = 'baymax-dismissed-notices';

function nextSlot(times: string[]): string | null {
  if (!times?.length) return null;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const sorted = [...times].sort();
  const hit = sorted.find((t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m > mins;
  });
  return hit ? `today ${hit}` : `tomorrow ${sorted[0]}`;
}

function money(n: number) {
  return `$${n.toFixed(n >= 100 ? 0 : 2)}`;
}

/** Live briefing data shared by the desktop rail and the mobile sheet. */
export function useBriefing() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<SettingsRes | null>(null);
  const [conn, setConn] = useState<ConnectionsStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError('');
    const [s, st, c] = await Promise.allSettled([
      api<Summary>('/analytics/summary'),
      api<SettingsRes>('/settings'),
      api<ConnectionsStatus>('/connections'),
    ]);
    if (s.status === 'fulfilled') setSummary(s.value);
    if (st.status === 'fulfilled') setSettings(st.value);
    if (c.status === 'fulfilled') setConn(c.value);
    if ([s, st, c].every((r) => r.status === 'rejected')) setError('Could not reach Baymax right now.');
  }, []);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'));
    } catch {
      setDismissed([]);
    }
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  function dismiss(id: string) {
    setDismissed((d) => {
      const next = [...d, id];
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function toggleAutopilot() {
    if (!settings) return;
    setBusy(true);
    try {
      const res = await api<{ autopilot: AutopilotSettings }>('/settings/autopilot', {
        method: 'PATCH',
        body: { enabled: !settings.autopilot.enabled },
      });
      setSettings({ ...settings, autopilot: res.autopilot });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update autopilot.');
    } finally {
      setBusy(false);
    }
  }

  const actions = useMemo<RailAction[]>(() => {
    const list: RailAction[] = [];
    if (settings && !settings.ai.configured) {
      list.push({ id: 'ai-key', verb: 'Fix', text: 'AI is offline. Add GEMINI_API_KEY on the server.', tone: 'warn', href: '/settings' });
    }
    if (conn && !conn.youtube.connected && !conn.tiktok.connected) {
      list.push({ id: 'connect', verb: 'Connect', text: 'TikTok or YouTube so I can publish for you', tone: 'energy', href: '/connected-accounts' });
    }
    if (summary && summary.products === 0) {
      list.push({ id: 'first-product', verb: 'Add', text: 'your first AliExpress product to start earning', tone: 'energy', prompt: 'Add this AliExpress product: ' });
    }
    if (summary && summary.products > 0 && summary.scheduled === 0) {
      list.push({ id: 'generate', verb: 'Generate', text: 'fresh posts. Your queue is empty.', tone: 'energy', prompt: 'Generate 2 TikTok and 2 YouTube posts for my best products and schedule them.' });
    }
    if (summary && summary.scheduled > 0) {
      list.push({ id: `review-${summary.scheduled}`, verb: 'Review', text: `${summary.scheduled} scheduled post${summary.scheduled === 1 ? '' : 's'} before they go live`, tone: 'calm', href: '/content?status=scheduled' });
    }
    list.push({ id: 'report', verb: 'Show', text: 'me what sold and what to post next', tone: 'calm', prompt: 'Give me a quick report: what sold this week, my top product, and what I should post next.' });
    return list.filter((a) => !dismissed.includes(a.id));
  }, [settings, conn, summary, dismissed]);

  return { summary, settings, conn, error, busy, actions, dismiss, toggleAutopilot, reload: load };
}

type Briefing = ReturnType<typeof useBriefing>;

export function ActionCard({ a, onPrompt, onDismiss }: { a: RailAction; onPrompt: (p: string) => void; onDismiss?: () => void }) {
  const body = (
    <>
      <span className={`bx-verb bx-verb-${a.tone ?? 'calm'}`}>{a.verb}</span>
      <span className="bx-action-text">{a.text}</span>
    </>
  );
  return (
    <div className="bx-notice bx-action fade-up">
      {a.href ? (
        <Link href={a.href} className="bx-action-hit">{body}</Link>
      ) : (
        <button type="button" className="bx-action-hit" onClick={() => a.prompt && onPrompt(a.prompt)}>{body}</button>
      )}
      {onDismiss && (
        <button type="button" className="bx-dismiss" onClick={onDismiss} aria-label={`Dismiss: ${a.verb} ${a.text}`}>
          <Icon name="x" className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function AutopilotCard({ b }: { b: Briefing }) {
  const ap = b.settings?.autopilot;
  const on = Boolean(ap?.enabled);
  return (
    <section className="bx-notice bx-feature fade-up" aria-label="Autopilot">
      <div className="bx-feature-head">
        <span className={`bx-pulse ${on ? 'is-on' : ''}`} aria-hidden="true" />
        <h3>Autopilot {ap ? (on ? 'is live' : 'is paused') : ''}</h3>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Turn autopilot on or off"
          className={`bx-switch ${on ? 'is-on' : ''}`}
          disabled={!ap || b.busy}
          onClick={b.toggleAutopilot}
        >
          <span />
        </button>
      </div>
      <p>
        {!ap
          ? 'Loading your schedule…'
          : on
          ? `Posting ${ap.dailyPerPlatform}/day per channel. Next slot ${nextSlot(ap.times) ?? 'not set'}.`
          : 'Turn it on and I’ll write, schedule and publish for you.'}
      </p>
    </section>
  );
}

function PulseCard({ b }: { b: Briefing }) {
  const s = b.summary;
  const tiles = [
    { label: 'Clicks', value: s ? String(s.clicks7d) : '—' },
    { label: 'Sales', value: s ? String(s.sales7d) : '—' },
    { label: 'Revenue', value: s ? money(s.revenue7d) : '—' },
  ];
  return (
    <section className="bx-notice bx-pulse-card fade-up" aria-label="Last 7 days">
      <div className="bx-pulse-head">
        <Icon name="chart" className="w-4 h-4" />
        <span>Last 7 days</span>
        <Link href="/analytics" className="bx-mini-link">Details</Link>
      </div>
      <div className="bx-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="bx-tile">
            <span>{t.label}</span>
            <strong>{t.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Desktop left rail and mobile sheet body. */
export function NotificationStack({ b, onPrompt }: { b: Briefing; onPrompt: (p: string) => void }) {
  return (
    <div className="bx-stack">
      {b.actions.map((a) => (
        <ActionCard key={a.id} a={a} onPrompt={onPrompt} onDismiss={() => b.dismiss(a.id)} />
      ))}
      <AutopilotCard b={b} />
      <PulseCard b={b} />
      {b.error && <p className="bx-rail-error">{b.error}</p>}
    </div>
  );
}
