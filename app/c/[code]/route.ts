/**
 * Click-tracker: /c/:code → logs a click event → 302 to the affiliate URL.
 * Runs as a first-class Next route (no rewrite tricks).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/src/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const fallback = 'https://www.aliexpress.com/';

  // Split mode (API_ORIGIN set): tracking lives on the backend — forward there
  // so Vercel stays frontend-only and the click is logged by the Fastify service.
  const origin = process.env.API_ORIGIN?.replace(/\/$/, '');
  if (origin) {
    try {
      const upstream = await fetch(`${origin}/track/${encodeURIComponent(code)}`, { redirect: 'manual' });
      const location = upstream.headers.get('location');
      if (location && upstream.status >= 300 && upstream.status < 400) {
        return NextResponse.redirect(location, upstream.status);
      }
    } catch (e) {
      console.error('track proxy failed:', e);
    }
    return NextResponse.redirect(fallback, 302); // fail open: click still reaches the product
  }

  try {
    const { data: product } = await db()
      .from('products')
      .select('id, affiliate_url')
      .eq('short_code', code)
      .maybeSingle();

    if (!product?.affiliate_url) {
      return NextResponse.redirect(fallback, 302);
    }

    // Fire-and-forget click log — never block the redirect
    db()
      .from('events')
      .insert({ kind: 'click', product_id: product.id, source: 'short_link', meta: {} })
      .then(({ error }) => {
        if (error) console.error('click log failed:', error.message);
      });

    return NextResponse.redirect(product.affiliate_url, 302);
  } catch (e) {
    console.error('track redirect failed:', e);
    return NextResponse.redirect(fallback, 302);
  }
}
