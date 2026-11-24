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
