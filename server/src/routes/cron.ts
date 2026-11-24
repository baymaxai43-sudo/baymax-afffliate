import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { tick } from '../services/scheduler';

export async function cronRoutes(app: FastifyInstance): Promise<void> {
  /** Vercel cron / external ping. Secured by CRON_SECRET when set. */
  const handler = async (req: any, reply: any) => {
    const secret = config.cronSecret;
    if (secret) {
      const auth = req.headers.authorization;
      const token = auth?.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-cron-secret'];
      if (token !== secret) return reply.code(401).send({ error: 'Unauthorized' });
    }
    const result = await tick();
    return reply.send({ ok: true, ...result });
  };
  app.get('/cron/tick', handler);
  app.post('/cron/tick', handler);
}
