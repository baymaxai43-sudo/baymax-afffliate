import type { FastifyInstance } from 'fastify';
import {
  clearSessionCookie,
  hashPassword,
  ownerPasswordHash,
  setOwnerPasswordHash,
  setSessionCookie,
  signToken,
  verifyPassword,
  verifyToken,
} from '../auth';
import { getSetting, setSetting } from '../db';

const attempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(ip: string): boolean {
  const rec = attempts.get(ip);
  if (!rec || rec.resetAt < Date.now()) return false;
  return rec.count >= 10;
}
function recordAttempt(ip: string): void {
  const rec = attempts.get(ip);
  if (!rec || rec.resetAt < Date.now()) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + 15 * 60_000 });
  } else {
    rec.count++;
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /** Public: does the owner need to create a password yet? Is the session valid? */
  app.get('/auth/status', async (req) => {
    try {
      const hash = await ownerPasswordHash();
      const tourCompleted = await getSetting<boolean>('tour_completed', false);
      const bearer = req.headers.authorization;
      const token =
        (bearer && bearer.startsWith('Bearer ') ? bearer.slice(7) : null) ||
        (req.cookies as Record<string, string> | undefined)?.['bs_session'];
      const authenticated = token ? await verifyToken(token) : false;
      return { needsSetup: !hash, tourCompleted, authenticated, dbReady: true, app: 'baymax-shoppey' };
    } catch {
      // DB not reachable / env keys missing — let the UI explain instead of 500ing
      return { needsSetup: false, tourCompleted: false, authenticated: false, dbReady: false, app: 'baymax-shoppey' };
    }
  });

  /** First-run: create the owner password (stored hashed, server-side only). */
  app.post<{ Body: { password?: string } }>(
    '/auth/setup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: { password: { type: 'string', minLength: 8, maxLength: 128 } },
        },
      },
    },
    async (req, reply) => {
      const password = req.body?.password;
      if (!password) return reply.code(400).send({ error: 'password required' });
      if (await ownerPasswordHash()) {
        return reply.code(409).send({ error: 'Password already set' });
      }
      const hash = await hashPassword(password);
      await setOwnerPasswordHash(hash);
      const token = await signToken();
      setSessionCookie(reply, token);
      return { ok: true, token };
    }
  );

  app.post<{ Body: { password?: string } }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: { password: { type: 'string', minLength: 1, maxLength: 128 } },
        },
      },
    },
    async (req, reply) => {
      const ip = req.ip;
      if (tooManyAttempts(ip)) {
        return reply.code(429).send({ error: 'Too many attempts — try again in 15 minutes.' });
      }
      const password = req.body?.password;
      if (!password) return reply.code(400).send({ error: 'password required' });
      const hash = await ownerPasswordHash();
      if (!hash) return reply.code(409).send({ error: 'needs_setup' });
      const ok = await verifyPassword(password, hash);
      if (!ok) {
        recordAttempt(ip);
        return reply.code(401).send({ error: 'Incorrect password' });
      }
      attempts.delete(ip);
      const token = await signToken();
      setSessionCookie(reply, token);
      return { ok: true, token };
    }
  );

  app.post('/auth/logout', async (req, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.post<{ Body: { current?: string; next?: string } }>(
    '/auth/password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['current', 'next'],
          properties: {
            current: { type: 'string', minLength: 1 },
            next: { type: 'string', minLength: 8, maxLength: 128 },
          },
        },
      },
      preHandler: app.requireAuth,
    },
    async (req, reply) => {
      const current = req.body?.current;
      const next = req.body?.next;
      if (!current || !next) return reply.code(400).send({ error: 'current and next required' });
      const hash = await ownerPasswordHash();
      if (!hash || !(await verifyPassword(current, hash))) {
        return reply.code(401).send({ error: 'Current password is incorrect' });
      }
      await setOwnerPasswordHash(await hashPassword(next));
      const token = await signToken();
      setSessionCookie(reply, token);
      return { ok: true };
    }
  );

  app.post('/auth/tour', { preHandler: app.requireAuth }, async () => {
    await setSetting('tour_completed', true);
    return { ok: true };
  });
}
