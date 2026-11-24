/** Click tracking redirects: /api/track/:code → affiliate URL (+ event row). */
import type { FastifyInstance } from 'fastify';
import { db } from '../db';

export async function trackRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { code: string } }>('/track/:code', async (req, reply) => {
    const { data: product } = await db()
      .from('products')
      .select('id,affiliate_url,short_code')
      .eq('short_code', req.params.code)
      .maybeSingle();

    if (!product?.affiliate_url) {
      return reply.redirect('https://www.aliexpress.com/', 302);
    }

    // Fire-and-forget analytics insert (never block the redirect)
    db()
      .from('events')
      .insert({
        kind: 'click',
        product_id: product.id,
        source: 'short_link',
        meta: { ua: String(req.headers['user-agent'] ?? '').slice(0, 300) },
      })
      .then(({ error }) => {
        if (error) console.error('click log failed:', error.message);
      });

    return reply.redirect(product.affiliate_url, 302);
  });
}
