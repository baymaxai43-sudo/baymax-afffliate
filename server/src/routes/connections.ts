/** OAuth connect flows for YouTube + TikTok. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { db, getSetting, setSetting } from '../db';
import { config } from '../config';

function stateSecret(): Promise<string> {
  return getSetting<string>('oauth_state_secret', '').then(async (s) => {
    if (!s) {
      s = createHmac('sha256', 'baymax').update(String(Date.now())).digest('hex');
      await setSetting('oauth_state_secret', s);
    }
    return s;
  });
}

async function signState(platform: string): Promise<string> {
  const secret = await stateSecret();
  const payload = `${platform}.${Date.now()}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex').slice(0, 24)}`;
}

async function verifyState(platform: string, state: string): Promise<boolean> {
  const secret = await stateSecret();
  const [p, ts, sig] = state.split('.');
  if (p !== platform || !ts || !sig) return false;
  if (Date.now() - Number(ts) > 10 * 60_000) return false;
  const expected = createHmac('sha256', secret).update(`${p}.${ts}`).digest('hex').slice(0, 24);
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function connectionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/connections', { preHandler: app.requireAuth }, async () => {
    const { data } = await db().from('connections').select('platform,expires_at,meta,updated_at');
    return {
      youtube: {
        configured: Boolean(config.youtubeClientId),
        connected: Boolean(data?.find((c) => c.platform === 'youtube')),
        channel: data?.find((c) => c.platform === 'youtube')?.meta?.title ?? null,
      },
      tiktok: {
        configured: Boolean(config.tiktokClientKey),
        connected: Boolean(data?.find((c) => c.platform === 'tiktok')),
        username: data?.find((c) => c.platform === 'tiktok')?.meta?.username ?? null,
      },
    };
  });

  app.get<{ Params: { platform: string } }>('/connections/:platform/start', async (req, reply) => {
    const { platform } = req.params;
    const state = await signState(platform);

    if (platform === 'youtube') {
      if (!config.youtubeClientId) return reply.code(400).send({ error: 'YOUTUBE_CLIENT_ID not configured' });
      const url =
        'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
          client_id: config.youtubeClientId,
          redirect_uri: `${config.appUrl}/api/connections/youtube/callback`,
          response_type: 'code',
          scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
          access_type: 'offline',
          prompt: 'consent',
          state,
        }).toString();
      return reply.redirect(url);
    }

    if (platform === 'tiktok') {
      if (!config.tiktokClientKey) return reply.code(400).send({ error: 'TIKTOK_CLIENT_KEY not configured' });
      const url =
        'https://www.tiktok.com/v2/auth/authorize/?' +
        new URLSearchParams({
          client_key: config.tiktokClientKey,
          scope: 'video.publish,user.info.basic',
          response_type: 'code',
          redirect_uri: `${config.appUrl}/api/connections/tiktok/callback`,
          state,
        }).toString();
      return reply.redirect(url);
    }

    return reply.code(404).send({ error: 'Unknown platform' });
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/connections/youtube/callback',
    async (req, reply) => {
      const q = req.query;
      if (q.error || !q.code || !q.state || !(await verifyState('youtube', q.state))) {
        return reply.redirect(`${config.appUrl}/settings?connect=youtube&status=failed`);
      }
      try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: q.code,
            client_id: config.youtubeClientId,
            client_secret: config.youtubeClientSecret,
            redirect_uri: `${config.appUrl}/api/connections/youtube/callback`,
            grant_type: 'authorization_code',
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const json = await res.json();
        if (!json.access_token) throw new Error(json.error_description ?? 'token exchange failed');

        const infoRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
          headers: { Authorization: `Bearer ${json.access_token}` },
          signal: AbortSignal.timeout(15_000),
        });
        const info = await infoRes.json().catch(() => ({}));
        const title = info?.items?.[0]?.snippet?.title ?? 'YouTube channel';

        await db().from('connections').upsert(
          {
            platform: 'youtube',
            access_token: json.access_token,
            refresh_token: json.refresh_token ?? null,
            expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
            meta: { title },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'platform' }
        );
        return reply.redirect(`${config.appUrl}/settings?connect=youtube&status=ok`);
      } catch (e) {
        console.error('youtube oauth failed:', e);
        return reply.redirect(`${config.appUrl}/settings?connect=youtube&status=failed`);
      }
    }
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/connections/tiktok/callback',
    async (req, reply) => {
      const q = req.query;
      if (q.error || !q.code || !q.state || !(await verifyState('tiktok', q.state))) {
        return reply.redirect(`${config.appUrl}/settings?connect=tiktok&status=failed`);
      }
      try {
        const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: config.tiktokClientKey,
            client_secret: config.tiktokClientSecret,
            code: q.code,
            grant_type: 'authorization_code',
            redirect_uri: `${config.appUrl}/api/connections/tiktok/callback`,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const json = await res.json();
        const token = json?.data?.access_token;
        if (!token) throw new Error(json?.error?.message ?? 'token exchange failed');

        await db().from('connections').upsert(
          {
            platform: 'tiktok',
            access_token: token,
            refresh_token: json.data.refresh_token ?? null,
            expires_at: new Date(Date.now() + (json.data.expires_in ?? 86400) * 1000).toISOString(),
            meta: { username: json.data.open_id ?? null },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'platform' }
        );
        return reply.redirect(`${config.appUrl}/settings?connect=tiktok&status=ok`);
      } catch (e) {
        console.error('tiktok oauth failed:', e);
        return reply.redirect(`${config.appUrl}/settings?connect=tiktok&status=failed`);
      }
    }
  );

  app.delete<{ Params: { platform: string } }>(
    '/connections/:platform',
    { preHandler: app.requireAuth },
    async (req) => {
      await db().from('connections').delete().eq('platform', req.params.platform);
      return { ok: true };
    }
  );
}
