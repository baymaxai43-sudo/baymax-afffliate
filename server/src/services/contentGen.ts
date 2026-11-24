/** AI content generation for TikTok + YouTube posts. */
import { chat, parseJson, type AIMessage } from '../ai';

export interface GeneratedPost {
  platform: 'tiktok' | 'youtube';
  format: 'video_script' | 'photo_post' | 'short';
  title: string;
  body: string;
  hashtags: string[];
}

export interface ProductLike {
  id: string;
  title: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  image_url?: string | null;
  affiliate_url: string;
  category?: string | null;
}

const SYSTEM = `You are Baymax-Shoppey's content engine — a direct-response social marketer for a private AliExpress affiliate store.
You write scroll-stopping short-form content for TikTok and YouTube (Shorts).
Rules:
- Output ONLY valid JSON matching the requested schema. No commentary.
- TikTok: hook in the first line, punchy spoken-script lines, 15-45s length, 3-8 niche hashtags.
- YouTube: SEO title ≤ 70 chars, description with hook + CTA + hashtags, tags list, Shorts-friendly.
- Never invent prices, discounts, or claims that are not in the product data. If price is unknown, don't mention a number.
- Always include a clear call-to-action to check the link in bio / description.
- Match the requested language and brand voice.`;

export async function generatePosts(
  product: ProductLike,
  platform: 'tiktok' | 'youtube',
  count: number,
  opts: { brandVoice?: string; angles?: string[] } = {}
): Promise<GeneratedPost[]> {
  const schema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: [platform] },
        format: {
          type: 'string',
          enum: platform === 'tiktok' ? ['video_script', 'photo_post'] : ['short', 'video_script'],
        },
        title: { type: 'string' },
        body: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'body', 'hashtags', 'format', 'platform'],
    },
  };

  const user = `Create ${count} distinct ${platform} post(s) for this product:

TITLE: ${product.title}
PRICE: ${product.price ? `${product.price} ${product.currency ?? 'USD'}` : 'unknown — do not state a price'}
CATEGORY: ${product.category ?? 'general dropshipping/affiliate product'}
DESCRIPTION: ${(product.description ?? '').slice(0, 800)}
LINK: ${product.affiliate_url}
BRAND VOICE: ${opts.brandVoice ?? 'friendly, energetic, trustworthy'}
${opts.angles?.length ? `ANGLES TO USE: ${opts.angles.join(', ')}` : ''}

Return a JSON array with ${count} items matching: {platform, format, title, body, hashtags[]}.`;

  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ];

  const res = await chat({ messages, json: true, temperature: 0.9, tools: undefined });
  const parsed = parseJson<GeneratedPost[]>(res.text ?? '');
  if (Array.isArray(parsed) && parsed.length) {
    return parsed
      .slice(0, count)
      .map((p) => ({
        platform,
        format: (p.format as GeneratedPost['format']) ?? (platform === 'tiktok' ? 'video_script' : 'short'),
        title: String(p.title ?? product.title).slice(0, 200),
        body: String(p.body ?? ''),
        hashtags: (Array.isArray(p.hashtags) ? p.hashtags : [])
          .map((h) => String(h).replace(/^#/, '').trim())
          .filter(Boolean)
          .slice(0, 10),
      }))
      .filter((p) => p.body);
  }
  throw new Error(`AI returned no parseable content for ${platform} (provider: ${res.provider})`);
}

