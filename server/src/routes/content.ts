import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import { generatePosts } from '../services/contentGen';
import { publishPost, PublishError } from '../services/publishers';
import { getAutopilot } from '../services/scheduler';

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { status?: string; platform?: string; limit?: string } }>(
    '/content',
    { preHandler: app.requireAuth },
    async (req) => {
      let query = db()
        .from('content')
        .select('*, products:product_id(id,title,image_url,price,currency,short_code)')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(req.query.limit) || 60, 200));
      if (req.query.status) query = query.eq('status', req.query.status);
      if (req.query.platform) query = query.eq('platform', req.query.platform);
      const { data, error } = await query;
      if (error) throw error;
      return { content: data ?? [] };
    }
  );

  /** Batch-generate posts for one or more products. */
  app.post<{
    Body: { product_ids: string[]; platforms?: ('tiktok' | 'youtube')[]; count?: number; schedule?: boolean };
  }>(
    '/content/generate',
    {
      preHandler: app.requireAuth,
      schema: {
        body: {
          type: 'object',
          required: ['product_ids'],
          properties: {
            product_ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 },
            platforms: { type: 'array', items: { type: 'string', enum: ['tiktok', 'youtube'] } },
            count: { type: 'number', minimum: 1, maximum: 4 },
            schedule: { type: 'boolean' },
          },
        },
      },
    },
    async (req) => {
      const platforms = req.body.platforms?.length ? req.body.platforms : (['tiktok', 'youtube'] as const);
      const count = Math.min(req.body.count ?? 1, 4);
      const autopilot = await getAutopilot();
      const created: unknown[] = [];

      for (const productId of req.body.product_ids) {
        const { data: product } = await db().from('products').select('*').eq('id', productId).single();
        if (!product) continue;
        for (const platform of platforms) {
          const posts = await generatePosts(product, platform, count, { brandVoice: autopilot.brandVoice });
          for (const p of posts) {
            const { data, error } = await db()
              .from('content')
              .insert({
                product_id: product.id,
                platform: p.platform,
                format: p.format,
                title: p.title,
                body: p.body,
                hashtags: p.hashtags,
                media: product.image_url ? [{ url: product.image_url, type: 'image' }] : [],
                status: req.body.schedule ? 'scheduled' : 'draft',
                scheduled_at: req.body.schedule ? nextSlot(autopilot.times) : null,
                meta: { generated_by: 'manual' },
              })
              .select()
              .single();
            if (error) throw error;
            created.push(data);
          }
        }
      }
      return { created, count: created.length };
    }
  );

  app.post<{ Params: { id: string }; Body: { scheduled_at?: string } }>(
    '/content/:id/schedule',
    {
      preHandler: app.requireAuth,
      schema: {
        body: {
          type: 'object',
          properties: { scheduled_at: { type: 'string' } },
        },
      },
    },
    async (req) => {
      const at = req.body.scheduled_at ?? nextSlot((await getAutopilot()).times);
      const { error } = await db()
        .from('content')
        .update({ status: 'scheduled', scheduled_at: at, error: null, updated_at: new Date().toISOString() })
        .eq('id', req.params.id);
      if (error) throw error;
      return { ok: true, scheduled_at: at };
    }
  );

  app.post<{ Params: { id: string } }>('/content/:id/publish', { preHandler: app.requireAuth }, async (req, reply) => {
    const { data: post, error } = await db()
      .from('content')
      .select('*, products:product_id(*)')
      .eq('id', req.params.id)
      .single();
    if (error || !post) return reply.code(404).send({ error: 'Post not found' });

    const media: { url: string; type?: string }[] = Array.isArray(post.media) ? post.media : [];
    const productImages = post.products?.image_url
      ? [{ url: post.products.image_url, type: 'image' as const }]
      : [];
    try {
      const result = await publishPost({
        platform: post.platform,
        title: post.title ?? post.products?.title ?? 'Check this out',
        body: post.body,
        hashtags: post.hashtags ?? [],
        media: media.length ? media : productImages,
      });
      await db()
        .from('content')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          external_id: result.id,
          external_url: result.url,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);
      return { ok: true, ...result };
    } catch (e) {
      const msg = e instanceof PublishError ? e.message : String(e);
      await db()
        .from('content')
        .update({ status: 'failed', error: msg, updated_at: new Date().toISOString() })
        .eq('id', post.id);
      return reply.code(502).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/content/:id/regenerate', { preHandler: app.requireAuth }, async (req) => {
    const { data: post } = await db().from('content').select('*, products:product_id(*)').eq('id', req.params.id).single();
    if (!post) return { error: 'not found' };
    const autopilot = await getAutopilot();
    const posts = await generatePosts(post.products, post.platform, 1, { brandVoice: autopilot.brandVoice });
    const p = posts[0];
    await db()
      .from('content')
      .update({ title: p.title, body: p.body, hashtags: p.hashtags, updated_at: new Date().toISOString() })
      .eq('id', post.id);
    return { ok: true, post: { ...post, title: p.title, body: p.body, hashtags: p.hashtags } };
  });

  app.delete<{ Params: { id: string } }>('/content/:id', { preHandler: app.requireAuth }, async (req) => {
    const { error } = await db().from('content').delete().eq('id', req.params.id);
    if (error) throw error;
    return { ok: true };
  });
}

function nextSlot(times: string[]): string {
  const sorted = [...(times.length ? times : ['10:00'])].sort();
  const now = new Date();
  for (const t of sorted) {
    const [hh, mm] = t.split(':').map(Number);
    const slot = new Date(now);
    slot.setHours(hh || 0, mm || 0, 0, 0);
    if (slot.getTime() > now.getTime() + 60_000) return slot.toISOString();
  }
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  const [hh, mm] = (sorted[0] ?? '10:00').split(':').map(Number);
  d.setHours(hh || 10, mm || 0, 0, 0);
  return d.toISOString();
}
