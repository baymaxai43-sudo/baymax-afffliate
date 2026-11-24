import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import { scrapeProduct } from '../services/products';
import { randomBytes } from 'node:crypto';

function shortCode(): string {
  return randomBytes(4).toString('base64url').replace(/[-_]/g, 'x').slice(0, 7);
}

export async function productRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string; status?: string } }>(
    '/products',
    { preHandler: app.requireAuth },
    async (req) => {
      let query = db()
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      const q = req.query.q?.trim();
      if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`);
      if (req.query.status) query = query.eq('status', req.query.status);
      const { data, error } = await query;
      if (error) throw error;
      return { products: data ?? [] };
    }
  );

  /** Add from an AliExpress link (AI/scrape enriches it) or manual fields. */
  app.post<{
    Body: {
      url?: string;
      title?: string;
      description?: string;
      price?: number;
      currency?: string;
      image_url?: string;
      affiliate_url?: string;
      category?: string;
    };
  }>(
    '/products',
    {
      preHandler: app.requireAuth,
      schema: {
        body: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            currency: { type: 'string' },
            image_url: { type: 'string' },
            affiliate_url: { type: 'string' },
            category: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body ?? {};
      let product: Record<string, unknown>;

      if (b.url?.trim()) {
        try {
          const scraped = await scrapeProduct(b.url);
          product = {
            title: scraped.title,
            description: scraped.description ?? b.description ?? null,
            price: scraped.price ?? b.price ?? null,
            currency: scraped.currency ?? 'USD',
            image_url: scraped.imageUrl ?? b.image_url ?? null,
            affiliate_url: scraped.affiliateUrl,
            category: scraped.category ?? b.category ?? null,
          };
        } catch (e) {
          return reply.code(422).send({ error: e instanceof Error ? e.message : 'Import failed' });
        }
      } else {
        if (!b.title?.trim() || !b.affiliate_url?.trim()) {
          return reply.code(400).send({ error: 'Provide an AliExpress url, or a title + affiliate_url' });
        }
        product = {
          title: b.title.trim(),
          description: b.description ?? null,
          price: b.price ?? null,
          currency: b.currency ?? 'USD',
          image_url: b.image_url ?? null,
          affiliate_url: b.affiliate_url.trim(),
          category: b.category ?? null,
        };
      }

      const { data, error } = await db()
        .from('products')
        .insert({ ...product, short_code: shortCode(), status: 'active', source: 'aliexpress' })
        .select()
        .single();
      if (error) {
        if (error.code === '23505') {
          const again = await db()
            .from('products')
            .insert({ ...product, short_code: shortCode() + shortCode().slice(0, 2), status: 'active' })
            .select()
            .single();
          if (again.error) throw again.error;
          return reply.code(201).send({ product: again.data });
        }
        throw error;
      }
      return reply.code(201).send({ product: data });
    }
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/products/:id',
    {
      preHandler: app.requireAuth,
      schema: {
        body: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: ['string', 'null'] },
            price: { type: ['number', 'null'] },
            image_url: { type: ['string', 'null'] },
            affiliate_url: { type: 'string' },
            category: { type: ['string', 'null'] },
            status: { type: 'string', enum: ['active', 'paused'] },
          },
        },
      },
    },
    async (req) => {
      const { error } = await db()
        .from('products')
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq('id', req.params.id);
      if (error) throw error;
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string } }>('/products/:id', { preHandler: app.requireAuth }, async (req) => {
    const { error } = await db().from('products').delete().eq('id', req.params.id);
    if (error) throw error;
    return { ok: true };
  });
}
