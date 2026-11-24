import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { requireAuth } from './auth';
import { config, aiConfigured } from './config';
import { authRoutes } from './routes/auth';
import { productRoutes } from './routes/products';
import { contentRoutes } from './routes/content';
import { analyticsRoutes } from './routes/analytics';
import { chatRoutes } from './routes/chat';
import { settingsRoutes } from './routes/settings';
import { connectionRoutes } from './routes/connections';
import { cronRoutes } from './routes/cron';
import { trackRoutes } from './routes/track';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: typeof requireAuth;
  }
}

let cached: FastifyInstance | null = null;

/** Build (or reuse) the Fastify app. Reused across serverless invocations. */
export function buildApp(): FastifyInstance {
  if (cached) return cached;
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'warn'),
    },
    bodyLimit: 10 * 1024 * 1024,
    trustProxy: true,
  });

  app.decorate('requireAuth', requireAuth);

  app.register(cookie);

  // CORS: allow only the frontend origins (browser calls normally go through
  // the Vercel same-origin proxy, so this is defense-in-depth for any direct
  // browser → backend calls). Server-to-server traffic is unaffected.
  const allowedOrigins = new Set(
    [config.appUrl, 'https://baymax-shoppey.vercel.app', 'http://localhost:3000'].filter(Boolean)
  );
  app.register(cors, {
    origin: (origin, cb) => {
      // No Origin header (curl, server-to-server) or an allowed frontend origin
      if (!origin || allowedOrigins.has(origin)) cb(null, true);
      else cb(null, false); // unknown origin: process request, omit CORS headers
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.setErrorHandler((err: any, req: any, reply: any) => {
    const status = err?.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log?.error?.(err);
    reply.code(status).send({ error: err?.message || 'Internal error' });
  });

  // `ai` = whether the RUNNING process sees AI keys in its env (presence only).
  // Lets the owner verify AI-key status without auth (no secrets exposed).
  app.get('/health', async () => ({ ok: true, app: 'baymax-shoppey', ai: aiConfigured() }));

  app.register(authRoutes);
  app.register(trackRoutes);
  app.register(connectionRoutes);
  app.register(cronRoutes);

  app.register(async (scope) => {
    scope.addHook('preHandler', requireAuth);
    await scope.register(productRoutes);
    await scope.register(contentRoutes);
    await scope.register(analyticsRoutes);
    await scope.register(chatRoutes);
    await scope.register(settingsRoutes);
  });

  cached = app;
  return app;
}
