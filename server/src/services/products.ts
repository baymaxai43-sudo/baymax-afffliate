/** AliExpress affiliate product ingestion: URL parsing + page scrape (+ optional OpenAPI). */
import { config } from '../config';

export interface ScrapedProduct {
  title: string;
  description?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  affiliateUrl: string;
  category?: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function normalizeAliexpressUrl(raw: string): string {
  const url = new URL(raw.trim());
  // Keep affiliate parameters intact (ep, p, src, and AliExpress affiliate tag params)
  if (!/aliexpress\.(com|us|uk|eu|co\.uk|de|fr|es|it|nl|pl|pt|ru|jp|kr|au|ca|sg|my|th|vn|id|ph|br|mx|cl|co|ar|tr|sa|ae|il|pk|ng|ke|za|gh|eg|dz|ma)\b/i.test(url.hostname)) {
    throw new Error('That does not look like an AliExpress link');
  }
  return url.toString();
}

function metaContent(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtml(m[1]).trim();
  }
  return undefined;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function findPrice(html: string): { price?: number; currency?: string } {
  // JSON-LD offers
  const ld = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (ld) {
    for (const block of ld) {
      const json = block.replace(/<[^>]+>/g, '');
      try {
        const parsed = JSON.parse(json);
        const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] ?? [])];
        for (const n of nodes) {
          const offers = n?.offers;
          const price = offers?.price ?? offers?.lowPrice;
          if (price) {
            return { price: Number(price), currency: offers?.priceCurrency ?? 'USD' };
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  // og:price:amount
  const ogPrice = metaContent(html, 'og:price:amount');
  if (ogPrice) {
    const n = Number(String(ogPrice).replace(/[^0-9.]/g, ''));
    if (n > 0) return { price: n, currency: metaContent(html, 'og:price:currency') ?? 'USD' };
  }
  return {};
}

/** Fetch product details from an AliExpress (affiliate) link. */
export async function scrapeProduct(rawUrl: string): Promise<ScrapedProduct> {
  const affiliateUrl = normalizeAliexpressUrl(rawUrl);
  let html = '';
  try {
    const res = await fetch(affiliateUrl, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    html = await res.text();
  } catch {
    throw new Error(
      'Could not reach that AliExpress page. Check the link, or add the product manually (title, price, image).'
    );
  }

  const title = metaContent(html, 'og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const description = metaContent(html, 'og:description') || metaContent(html, 'description');
  const imageUrl = metaContent(html, 'og:image');
  const { price, currency } = findPrice(html);

  if (!title || /just a moment|captcha|access denied/i.test(title)) {
    throw new Error(
      'AliExpress blocked the fetch. Add the product manually (title, price, image, link) — I can still create content for it.'
    );
  }

  // Optional tracking-id append for the affiliate portal
  let finalUrl = affiliateUrl;
  if (config.aliexpressTrackingId && !/[?&](aid|aff_fcid|aff_trace_key)=/.test(affiliateUrl)) {
    const u = new URL(affiliateUrl);
    u.searchParams.set('aff_trace_key', config.aliexpressTrackingId);
    finalUrl = u.toString();
  }

  return {
    title: title.replace(/\s*\|\s*AliExpress.*$/i, '').slice(0, 300),
    description: description?.slice(0, 2000),
    price,
    currency: currency ?? 'USD',
    imageUrl,
    affiliateUrl: finalUrl,
  };
}
