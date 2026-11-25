import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import { config } from '../config';
import { aiProviderLabel } from '../ai';
import { saveMedia } from '../storage';
import { agnesConfigured } from '../services/agnes';
import { geminiImageConfigured } from '../services/geminiImage';
import { getAutopilot } from '../services/scheduler';
import { approveJob, enqueueJob, getJob, kick, restartJob, type Captions } from '../services/pipeline';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Read one image file from a multipart request. */
async function readImage(req: any): Promise<{ filename: string; mimetype: string; buffer: Buffer } | { error: string }> {
  if (!req.isMultipart()) return { error: 'multipart/form-data with an image file is required' };
  const file = await req.file();
  if (!file) return { error: 'No file uploaded' };
  if (!IMAGE_TYPES.has(file.mimetype)) return { error: 'Use a JPG, PNG or WebP image' };
  const buffer = await file.toBuffer();
  if (!buffer.length) return { error: 'Empty file' };
  return { filename: file.filename || 'product.jpg', mimetype: file.mimetype, buffer };
}

export async function studioRoutes(app: FastifyInstance): Promise<void> {
  /** Which engines are wired up (no secrets). */
  app.get('/studio/status', async () => ({
    captions: aiProviderLabel(),
    image: agnesConfigured() ? `agnes (${config.agnesImageModel})` : geminiImageConfigured() ? `gemini (${config.geminiImageModel})` : null,
    video: agnesConfigured() ? `agnes (${config.agnesVideoModel})` : null,
    ready: agnesConfigured() || geminiImageConfigured(),
  }));

  /** Upload a product photo; returns its public URL (use as image_url when adding a product). */
  app.post('/studio/upload', async (req, reply) => {
    const img = await readImage(req);
    if ('error' in img) return reply.code(400).send({ error: img.error });
    const saved = await saveMedia(img);
    return reply.code(201).send({ url: saved.url });
  });

  /** Replace a product's photo with an uploaded one. */
  app.post<{ Params: { id: string } }>('/products/:id/image', async (req, reply) => {
    const img = await readImage(req);
    if ('error' in img) return reply.code(400).send({ error: img.error });
    const saved = await saveMedia(img);
    const { error } = await db()
      .from('products')
      .update({ image_url: saved.url, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) return reply.code(500).send({ error: error.message });
    return { url: saved.url };
  });

  app.get<{ Querystring: { status?: string; limit?: string } }>('/studio/jobs', async (req) => {
    let q = db().from('pipeline_jobs').select('*, products:product_id(*)').order('created_at', { ascending: false });
    if (req.query.status) q = q.eq('status', req.query.status);
    const { data, error } = await q.limit(Math.min(100, Number(req.query.limit) || 40));
    if (error) throw error;
    return { jobs: data ?? [] };
  });

  app.get<{ Params: { id: string } }>('/studio/jobs/:id', async (req, reply) => {
    const job = await getJob(req.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return { job };
  });

  /** Start captions → image → video for a product. */
  app.post<{ Body: { product_id: string; image_url?: string } }>(
    '/studio/jobs',
    {
      schema: {
        body: {
          type: 'object',
          required: ['product_id'],
          properties: { product_id: { type: 'string' }, image_url: { type: 'string', maxLength: 2000 } },
        },
      },
    },
    async (req, reply) => {
      const { data: product } = await db().from('products').select('id').eq('id', req.body.product_id).maybeSingle();
      if (!product) return reply.code(404).send({ error: 'Product not found' });
      const autopilot = await getAutopilot();
      const job = await enqueueJob({
        productId: req.body.product_id,
        sourceImageUrl: req.body.image_url,
        brandVoice: autopilot.brandVoice,
        reviewMode: true,
      });
      kick();
      return reply.code(201).send({ job });
    }
  );

  /** Edit captions before approving. */
  app.patch<{ Params: { id: string }; Body: Partial<Pick<Captions, 'tiktok' | 'youtube'>> }>(
    '/studio/jobs/:id/captions',
    async (req, reply) => {
      const job = await getJob(req.params.id);
      if (!job?.captions) return reply.code(404).send({ error: 'No captions on this job yet' });
      const clean = (c: any, prev: any) =>
        c
          ? {
              title: String(c.title ?? prev.title).slice(0, 100),
              body: String(c.body ?? prev.body).slice(0, 2200),
              hashtags: (Array.isArray(c.hashtags) ? c.hashtags : prev.hashtags).map((h: unknown) => String(h).replace(/^#/, '')).slice(0, 10),
            }
          : prev;
      const captions = { ...job.captions, tiktok: clean(req.body.tiktok, job.captions.tiktok), youtube: clean(req.body.youtube, job.captions.youtube) };
      await db().from('pipeline_jobs').update({ captions, updated_at: new Date().toISOString() }).eq('id', job.id);
      return { job: { ...job, captions } };
    }
  );

  /** Approve a finished video → schedules TikTok + YouTube posts. */
  app.post<{ Params: { id: string }; Body: { platforms?: ('tiktok' | 'youtube')[]; publish_now?: boolean } }>(
    '/studio/jobs/:id/approve',
    async (req, reply) => {
      const job = await getJob(req.params.id);
      if (!job) return reply.code(404).send({ error: 'Job not found' });
      if (job.status !== 'review') return reply.code(409).send({ error: `Job is ${job.status}, not ready for review` });
      const autopilot = await getAutopilot();
      const ids = await approveJob(job, {
        platforms: req.body?.platforms,
        times: autopilot.times,
        publishNow: req.body?.publish_now,
      });
      return { ok: true, content_ids: ids };
    }
  );

  /** Retry a failed job, or redo from a step. */
  app.post<{ Params: { id: string }; Body: { from?: 'captions' | 'image' | 'video' } }>(
    '/studio/jobs/:id/retry',
    async (req, reply) => {
      const job = await getJob(req.params.id);
      if (!job) return reply.code(404).send({ error: 'Job not found' });
      if (job.status === 'approved') return reply.code(409).send({ error: 'Already approved' });
      await restartJob(job, req.body?.from);
      kick();
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string } }>('/studio/jobs/:id', async (req) => {
    await db().from('pipeline_jobs').delete().eq('id', req.params.id);
    return { ok: true };
  });
}
