import type { FastifyInstance } from 'fastify';
import { db } from '../db';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  /** Dashboard summary + lazy scheduler tick. */
  app.get('/analytics/summary', { preHandler: app.requireAuth }, async () => {
    // Lazy autopilot tick (throttled inside) — keeps things moving without cron
    import('../services/scheduler').then((s) => s.lazyTick()).catch(() => {});

    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    const [products, scheduled, published, clicks7d, sales7d, salesRows] = await Promise.all([
      db().from('products').select('id', { count: 'exact', head: true }),
      db().from('content').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
      db().from('content').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      db().from('events').select('id', { count: 'exact', head: true }).eq('kind', 'click').gte('occurred_at', since7d),
      db().from('events').select('id', { count: 'exact', head: true }).eq('kind', 'sale').gte('occurred_at', since7d),
      db().from('events').select('value,currency').eq('kind', 'sale').gte('occurred_at', since7d),
    ]);
    const revenue = (salesRows.data ?? []).reduce((s, e) => s + Number(e.value ?? 0), 0);
    return {
      products: products.count ?? 0,
      scheduled: scheduled.count ?? 0,
      published: published.count ?? 0,
      clicks7d: clicks7d.count ?? 0,
      sales7d: sales7d.count ?? 0,
      revenue7d: revenue,
    };
  });

  app.get<{ Querystring: { days?: string } }>(
    '/analytics/timeseries',
    { preHandler: app.requireAuth },
    async (req) => {
      const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data } = await db()
        .from('events')
        .select('kind,occurred_at')
        .gte('occurred_at', since)
        .in('kind', ['click', 'sale'])
        .limit(5000);

      const buckets: Record<string, { day: string; clicks: number; sales: number }> = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - (days - 1 - i) * 86400_000);
        const key = d.toISOString().slice(0, 10);
        buckets[key] = { day: key, clicks: 0, sales: 0 };
      }
      for (const e of data ?? []) {
        const key = e.occurred_at.slice(0, 10);
        if (!buckets[key]) continue;
        if (e.kind === 'click') buckets[key].clicks++;
        else buckets[key].sales++;
      }
      return { series: Object.values(buckets) };
    }
  );

  app.get('/analytics/top-products', { preHandler: app.requireAuth }, async () => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: events } = await db()
      .from('events')
      .select('product_id,kind')
      .gte('occurred_at', since)
      .in('kind', ['click', 'sale'])
      .limit(5000);
    const counts: Record<string, { clicks: number; sales: number }> = {};
    for (const e of events ?? []) {
      if (!e.product_id) continue;
      counts[e.product_id] ??= { clicks: 0, sales: 0 };
      if (e.kind === 'click') counts[e.product_id].clicks++;
      else counts[e.product_id].sales++;
    }
    const ids = Object.keys(counts).sort((a, b) => counts[b].clicks - counts[a].clicks).slice(0, 8);
    if (!ids.length) return { top: [] };
    const { data: products } = await db().from('products').select('id,title,price,currency,image_url').in('id', ids);
    return {
      top: ids
        .map((id) => {
          const p = products?.find((x) => x.id === id);
          return { id, title: p?.title ?? 'unknown', price: p?.price, currency: p?.currency, image_url: p?.image_url, ...counts[id] };
        })
        .filter((x) => x.title !== 'unknown'),
    };
  });

  app.get<{ Querystring: { limit?: string } }>(
    '/analytics/sales',
    { preHandler: app.requireAuth },
    async (req) => {
      const { data } = await db()
        .from('events')
        .select('*, products:product_id(title,short_code)')
        .eq('kind', 'sale')
        .order('occurred_at', { ascending: false })
        .limit(Math.min(Number(req.query.limit) || 30, 100));
      return { sales: data ?? [] };
    }
  );

  app.post<{ Body: { product_id?: string; value: number; currency?: string; note?: string } }>(
    '/analytics/sales',
    {
      preHandler: app.requireAuth,
      schema: {
        body: {
          type: 'object',
          required: ['value'],
          properties: {
            product_id: { type: 'string' },
            value: { type: 'number', minimum: 0.01 },
            currency: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { error } = await db().from('events').insert({
        kind: 'sale',
        product_id: req.body.product_id ?? null,
        value: req.body.value,
        currency: req.body.currency ?? 'USD',
        source: 'manual',
        meta: { note: req.body.note ?? null },
      });
      if (error) throw error;
      return reply.code(201).send({ ok: true });
    }
  );
}
