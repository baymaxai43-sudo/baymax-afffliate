/**
 * Serves /api/* two ways:
 *  - API_ORIGIN set (split mode): pure reverse-proxy to the external backend
 *    (Render). Fastify never runs here → Vercel is frontend-only.
 *  - API_ORIGIN unset: in-process Fastify bridge (all-in-one mode).
 * bodyParser stays OFF so the raw stream is forwarded/parsed correctly.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

async function proxyExternal(req: NextApiRequest, res: NextApiResponse, origin: string): Promise<void> {
  const url = req.url ?? '/';
  // Strip the /api prefix — external backend routes are clean (/auth/status, …)
  const stripped = url.startsWith('/api') ? url.slice(4) || '/' : url;
  const method = (req.method ?? 'GET').toUpperCase();

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null || HOP_BY_HOP.has(k.toLowerCase())) continue;
    if (k.toLowerCase() === 'accept-encoding') continue; // identity: forward bytes verbatim
    headers[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  headers['accept-encoding'] = 'identity';
  headers['host'] = new URL(origin).host;

  const init: RequestInit = { method, headers, redirect: 'manual' };
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    if (body.length) init.body = body;
  }

  try {
    const upstream = await fetch(`${origin}${stripped}`, init);
    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value);
      }
    });
    // Preserve multiple Set-Cookie headers (session rotation)
    const setCookies = (upstream.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
    if (setCookies?.length) res.setHeader('set-cookie', setCookies);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf.length ? buf : undefined);
  } catch (e) {
    console.error('api proxy failed:', e);
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'backend_unreachable', origin }));
  }
}

let appPromise: Promise<FastifyInstance> | null = null;

function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      const app = buildApp();
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const origin = process.env.API_ORIGIN;
  if (origin) {
    // Split mode: Vercel = frontend only, all logic runs on the external backend.
    await proxyExternal(req, res, origin.replace(/\/$/, ''));
    return;
  }

  const app = await getApp();
  const url = req.url ?? '/';
  // Strip the /api prefix so Fastify routes stay clean (/products, /chat, ...)
  const stripped = url.startsWith('/api') ? url.slice(4) || '/' : url;
  (req as any).url = stripped;
  app.server.emit('request', req, res);
}
