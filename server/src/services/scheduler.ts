/** Autopilot scheduler: publishes due posts and (optionally) generates new ones. */
import { db, getSetting, setSetting } from '../db';
import { publishPost, PublishError } from './publishers';
import { generatePosts, type ProductLike } from './contentGen';

export interface AutopilotSettings {
  enabled: boolean;
  dailyPerPlatform: number;
  times: string[]; // "HH:MM" local slots
  brandVoice: string;
}

export const DEFAULT_AUTOPILOT: AutopilotSettings = {
  enabled: true,
  dailyPerPlatform: 1,
  times: ['10:00', '15:00', '19:00'],
  brandVoice: 'friendly, energetic, trustworthy',
};

export interface TickResult {
  published: number;
  failed: number;
  generated: number;
  errors: string[];
}

export async function getAutopilot(): Promise<AutopilotSettings> {
  const s = await getSetting<AutopilotSettings>('autopilot', DEFAULT_AUTOPILOT);
  return { ...DEFAULT_AUTOPILOT, ...s };
}

/** Publish everything whose scheduled_at has passed. */
async function publishDue(): Promise<{ published: number; failed: number; errors: string[] }> {
  const { data: due } = await db()
    .from('content')
    .select('*, products:product_id(*)')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10);

  let published = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const post of due ?? []) {
    try {
      const media: { url: string; type?: string }[] = Array.isArray(post.media) ? post.media : [];
      const productImages = post.products?.image_url ? [{ url: post.products.image_url, type: 'image' as const }] : [];
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
      published++;
    } catch (e) {
      const msg = e instanceof PublishError ? e.message : String(e);
      await db()
        .from('content')
        .update({ status: 'failed', error: msg, updated_at: new Date().toISOString() })
        .eq('id', post.id);
      failed++;
      errors.push(msg);
    }
  }
  return { published, failed, errors };
}

/** Next free time slots today/tomorrow from configured times. */
function nextSlots(times: string[], count: number, from = new Date()): string[] {
  const slots: string[] = [];
  const sorted = [...times].sort();
  for (let day = 0; day < 3 && slots.length < count; day++) {
    const d = new Date(from);
    d.setDate(d.getDate() + day);
    for (const t of sorted) {
      if (slots.length >= count) break;
      const [hh, mm] = t.split(':').map(Number);
      const slot = new Date(d);
      slot.setHours(hh || 0, mm || 0, 0, 0);
      if (slot.getTime() > Date.now() + 60_000) slots.push(slot.toISOString());
    }
  }
  return slots;
}

/** Generate + schedule the next batch of autopilot content. */
async function generateBatch(): Promise<number> {
  const autopilot = await getAutopilot();
  if (!autopilot.enabled) return 0;

  const { data: products } = await db()
    .from('products')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50);
  if (!products?.length) return 0;

  const platforms: ('tiktok' | 'youtube')[] = ['tiktok', 'youtube'];
  let created = 0;

  for (const platform of platforms) {
    // How many already scheduled/published for this platform today?
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count: todayCount } = await db()
      .from('content')
      .select('id', { count: 'exact', head: true })
      .eq('platform', platform)
      .in('status', ['scheduled', 'published'])
      .gte('created_at', startOfDay.toISOString());
    const need = autopilot.dailyPerPlatform - (todayCount ?? 0);
    if (need <= 0) continue;

    const slots = nextSlots(autopilot.times, need);
    // Rotate through products
    const product = products[created % products.length] as ProductLike;
    try {
      const posts = await generatePosts(product, platform, need, { brandVoice: autopilot.brandVoice });
      for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        const { error } = await db().from('content').insert({
          product_id: product.id,
          platform: p.platform,
          format: p.format,
          title: p.title,
          body: p.body,
          hashtags: p.hashtags,
          media: product.image_url ? [{ url: product.image_url, type: 'image' }] : [],
          status: 'scheduled',
          scheduled_at: slots[i] ?? nextSlots(autopilot.times, 1)[0],
          meta: { generated_by: 'autopilot' },
        });
        if (error) throw new Error(error.message);
        created++;
      }
    } catch (e) {
      // Don't let generation errors kill the tick
      console.error('autopilot generate failed:', e);
    }
  }
  return created;
}

export async function tick(opts: { generate?: boolean } = {}): Promise<TickResult> {
  const pub = await publishDue();
  let generated = 0;
  if (opts.generate !== false) {
    generated = await generateBatch();
  }
  await setSetting('last_tick', new Date().toISOString());
  return { published: pub.published, failed: pub.failed, generated, errors: pub.errors };
}

/** Throttled lazy tick — called from dashboard reads so autopilot works without cron. */
let lastLazyTick = 0;
export async function lazyTick(minIntervalMs = 4 * 60_000): Promise<void> {
  if (Date.now() - lastLazyTick < minIntervalMs) return;
  lastLazyTick = Date.now();
  try {
    await tick();
  } catch (e) {
    console.error('lazyTick failed:', e);
  }
}
