/**
 * Bridges every /api/* request to the Fastify backend (in-process).
 * bodyParser stays OFF so Fastify reads the raw stream itself.
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
  const app = await getApp();
  const url = req.url ?? '/';
  // Strip the /api prefix so Fastify routes stay clean (/products, /chat, ...)
  const stripped = url.startsWith('/api') ? url.slice(4) || '/' : url;
  (req as any).url = stripped;
  app.server.emit('request', req, res);
}
