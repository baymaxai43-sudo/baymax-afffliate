/**
 * Keep-alive for Render's free tier (it sleeps after 15 min without inbound traffic).
 * While autopilot is on — or a studio job is still rendering — the server pings its own
 * public /health URL every 12 minutes. Runs silently in the background: nothing in the UI,
 * no logs on success, one warning per failure streak.
 */
import { config } from '../config';
import { getAutopilot } from './scheduler';
import { activeJobCount } from './pipeline';

let timer: NodeJS.Timeout | null = null;
let failing = false;

async function shouldStayAwake(): Promise<boolean> {
  try {
    const [autopilot, active] = await Promise.all([getAutopilot(), activeJobCount()]);
    return autopilot.enabled || active > 0;
  } catch {
    return true; // DB hiccup — stay awake rather than drop mid-job
  }
}

async function ping() {
  if (!(await shouldStayAwake())) return;
  try {
    const res = await fetch(`${config.keepAliveUrl}/health`, {
      headers: { 'user-agent': 'baymax-keepalive', 'x-keepalive': '1' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    failing = false;
  } catch (e) {
    if (!failing) console.warn('[keepalive] ping failed:', e instanceof Error ? e.message : e);
    failing = true;
  }
}

export function startKeepAlive(): void {
  if (timer || !config.keepAliveUrl) return; // only on a host with a public URL (Render sets RENDER_EXTERNAL_URL)
  const every = Math.max(5, Math.min(14, config.keepAliveMinutes)) * 60_000;
  timer = setInterval(ping, every);
  timer.unref?.();
}
