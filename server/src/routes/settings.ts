import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting } from '../db';
import { getAutopilot, DEFAULT_AUTOPILOT, tick, type AutopilotSettings } from '../services/scheduler';
import { config, aiConfigured } from '../config';
import { aiProviderLabel } from '../ai';
import { agnesConfigured } from '../services/agnes';
import { geminiImageConfigured } from '../services/geminiImage';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', { preHandler: app.requireAuth }, async () => {
    const autopilot = await getAutopilot();
    return {
      autopilot,
      ai: {
        configured: aiConfigured(),
        primary: aiProviderLabel(),
        gemini: Boolean(config.geminiApiKey),
        groq: Boolean(config.groqApiKey),
        agnes: agnesConfigured(),
        image: agnesConfigured() ? `Agnes (${config.agnesImageModel})` : geminiImageConfigured() ? `Gemini (${config.geminiImageModel})` : 'unavailable',
        video: agnesConfigured() ? `Agnes (${config.agnesVideoModel})` : 'unavailable',
      },
      social: {
        youtube: Boolean(config.youtubeClientId),
        tiktok: Boolean(config.tiktokClientKey),
      },
    };
  });

  app.patch<{ Body: Partial<AutopilotSettings> }>(
    '/settings/autopilot',
    {
      preHandler: app.requireAuth,
      schema: {
        body: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            dailyPerPlatform: { type: 'number', minimum: 0, maximum: 6 },
            times: { type: 'array', items: { type: 'string' }, maxItems: 6 },
            brandVoice: { type: 'string', maxLength: 500 },
            videosPerDay: { type: 'number', minimum: 0, maximum: 5 },
            reviewMode: { type: 'boolean' },
          },
        },
      },
    },
    async (req) => {
      const current = await getAutopilot();
      const next: AutopilotSettings = { ...current, ...req.body };
      await setSetting('autopilot', next);
      return { autopilot: next };
    }
  );

  app.post('/settings/run-now', { preHandler: app.requireAuth }, async () => {
    return await tick();
  });
}
