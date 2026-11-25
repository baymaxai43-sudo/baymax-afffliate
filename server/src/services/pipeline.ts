/**
 * Content Studio pipeline — one job per product, advanced one step at a time:
 *
 *   captions      Groq writes TikTok + YouTube captions, an image prompt and a video prompt
 *   caption_check Groq (as a strict critic) scores them; < 7/10 → rewrite (max 2 rewrites)
 *   image         Agnes turns the product photo into a 9:16 ad image (Gemini image as optional fallback)
 *   video         Agnes animates that image into a short 9:16 clip (async task)
 *   video_poll    wait for the clip, copy it into our storage
 *   done          → status "review" (or auto-approved when review mode is off)
 *
 * Every step saves its output on the row, so a failure retries only that step.
 */
import { chat, parseJson } from '../ai';
import { config } from '../config';
import { db } from '../db';
import { mirrorRemote } from '../storage';
import { agnesConfigured, agnesImage, agnesPollVideo, agnesStartVideo, AgnesError, type VideoTask } from './agnes';
import { geminiImage, geminiImageConfigured } from './geminiImage';

export type Step = 'captions' | 'caption_check' | 'image' | 'video' | 'video_poll' | 'done';
export type JobStatus = 'queued' | 'running' | 'review' | 'approved' | 'failed';

export interface PlatformCaption {
  title: string;
  body: string;
  hashtags: string[];
}
export interface Captions {
  tiktok: PlatformCaption;
  youtube: PlatformCaption;
  image_prompt: string;
  video_prompt: string;
}
export interface Quality {
  score: number;
  issues: string[];
  rewrites: number;
}

export interface Job {
  id: string;
  product_id: string;
  status: JobStatus;
  step: Step;
  source_image_url: string | null;
  captions: Captions | null;
  quality: Quality | null;
  image_url: string | null;
  video_url: string | null;
  video_task: (VideoTask & { started_at: string }) | null;
  attempts: number;
  error: string | null;
  auto: boolean;
  locked_until: string | null;
  meta: Record<string, any>;
  created_at: string;
  updated_at: string;
  products?: any;
}

const MAX_ATTEMPTS = 4;
const MIN_SCORE = 7;
const MAX_REWRITES = 2;
const VIDEO_TIMEOUT_MS = 25 * 60_000;

/* ------------------------------ helpers ------------------------------ */

async function patch(id: string, fields: Partial<Job>) {
  const { error } = await db()
    .from('pipeline_jobs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`pipeline update failed: ${error.message}`);
}

function productFacts(p: any): string {
  return [
    `TITLE: ${p.title}`,
    `PRICE: ${p.price ? `${p.price} ${p.currency ?? 'USD'}` : 'unknown (do not state a price)'}`,
    `CATEGORY: ${p.category ?? 'general'}`,
    `DESCRIPTION: ${String(p.description ?? '').slice(0, 900)}`,
  ].join('\n');
}

const cleanTags = (tags: unknown): string[] =>
  (Array.isArray(tags) ? tags : [])
    .map((h) => String(h).replace(/^#/, '').trim().replace(/\s+/g, ''))
    .filter(Boolean)
    .slice(0, 10);

function normCaption(c: any, fallbackTitle: string): PlatformCaption {
  const hashtags = cleanTags(c?.hashtags);
  if (!hashtags.some((h) => h.toLowerCase() === 'ad')) hashtags.unshift('ad'); // affiliate disclosure
  return {
    title: String(c?.title ?? fallbackTitle).slice(0, 100),
    body: String(c?.body ?? '').slice(0, 2200),
    hashtags: hashtags.slice(0, 10),
  };
}

/** Deterministic checks the critic can't be trusted with. */
function hardIssues(c: Captions, p: any): string[] {
  const issues: string[] = [];
  const text = `${c.tiktok.body} ${c.youtube.body} ${c.tiktok.title} ${c.youtube.title}`;
  if (!c.tiktok.body.trim() || !c.youtube.body.trim()) issues.push('A caption is empty.');
  if (c.youtube.title.length > 70) issues.push('YouTube title is longer than 70 characters.');
  const prices = text.match(/[$€£₦]\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:USD|dollars|naira)/gi) ?? [];
  if (prices.length) {
    const real = p.price ? Number(p.price) : null;
    const wrong = prices.some((m) => {
      const n = Number(m.replace(/[^\d.]/g, ''));
      return real === null || Math.abs(n - real) > 0.01;
    });
    if (wrong) issues.push('Mentions a price that is not in the product data.');
  }
  if (/\b(guarantee[sd]?|cure[sd]?|100% (safe|effective)|doctor[- ]recommended|fda)\b/i.test(text)) {
    issues.push('Contains a risky claim (guarantee/medical/certification).');
  }
  return issues;
}

/* ------------------------------- steps ------------------------------- */

const CAPTION_SYSTEM = `You are Baymax's caption writer for a personal AliExpress affiliate store, posting short vertical videos on TikTok and YouTube Shorts.
Output ONLY JSON: {"tiktok":{"title","body","hashtags"[]},"youtube":{"title","body","hashtags"[]},"image_prompt","video_prompt"}.
Rules:
- First line of each body is a scroll-stopping hook (max 10 words).
- TikTok body: 2-4 short punchy lines, then a CTA to the link in bio. 3-6 niche hashtags.
- YouTube: title ≤ 70 chars, keyword-rich. Body: hook, 2-3 benefit lines, CTA "link in description", hashtags at the end incl. Shorts.
- Use ONLY facts from the product data. Never invent prices, discounts, stock, reviews, or certifications.
- No medical/health guarantees. Natural, confident, not spammy. No emojis spam (max 2 per body).
- image_prompt: describe a clean vertical 9:16 commercial scene for THIS product (setting, lighting, props), and say to keep the product's exact shape, colour and branding unchanged. No text overlays.
- video_prompt: 1-2 sentences of motion for a 6-10 s clip starting from that image: slow camera push-in or orbit, subtle realistic motion, product stays in focus, no added text, no people's faces unless natural.`;

async function stepCaptions(job: Job, p: any) {
  const feedback: string[] = job.meta?.feedback ?? [];
  const res = await chat({
    json: true,
    temperature: 0.85,
    messages: [
      { role: 'system', content: CAPTION_SYSTEM },
      {
        role: 'user',
        content: `${productFacts(p)}\nBRAND VOICE: ${job.meta?.brandVoice ?? 'friendly, energetic, trustworthy'}${
          feedback.length ? `\n\nA reviewer rejected the last draft. Fix these:\n- ${feedback.join('\n- ')}` : ''
        }`,
      },
    ],
  });
  const raw = parseJson<any>(res.text ?? '');
  if (!raw?.tiktok || !raw?.youtube) throw new Error(`caption model returned unusable JSON (${res.provider})`);
  const captions: Captions = {
    tiktok: normCaption(raw.tiktok, p.title),
    youtube: normCaption(raw.youtube, p.title),
    image_prompt: String(raw.image_prompt ?? '').slice(0, 1500) || `A clean vertical studio product shot of ${p.title}`,
    video_prompt:
      String(raw.video_prompt ?? '').slice(0, 800) || 'Slow cinematic push-in on the product, soft light sweep, product stays sharp.',
  };
  await patch(job.id, { captions, step: 'caption_check', meta: { ...job.meta, captionProvider: res.provider } });
}

const CRITIC_SYSTEM = `You are a strict social-ads editor. Score the draft captions 0-10 for: hook strength, clarity, accuracy against the product data (any invented fact = max 4), platform fit, and a clear CTA.
Output ONLY JSON: {"score": number, "issues": string[]} — issues are short, concrete fixes. Empty issues if score ≥ 8.`;

async function stepCaptionCheck(job: Job, p: any) {
  const c = job.captions!;
  const hard = hardIssues(c, p);
  let score = 10;
  let issues: string[] = [];
  try {
    const res = await chat({
      json: true,
      temperature: 0.2,
      messages: [
        { role: 'system', content: CRITIC_SYSTEM },
        { role: 'user', content: `PRODUCT DATA\n${productFacts(p)}\n\nDRAFT\n${JSON.stringify({ tiktok: c.tiktok, youtube: c.youtube })}` },
      ],
    });
    const r = parseJson<{ score: number; issues: string[] }>(res.text ?? '');
    score = Math.max(0, Math.min(10, Number(r?.score ?? 7)));
    issues = (Array.isArray(r?.issues) ? r!.issues : []).map(String).slice(0, 6);
  } catch {
    score = 7; // critic unavailable → rely on hard checks only
  }
  if (hard.length) score = Math.min(score, 5);
  const allIssues = [...hard, ...issues];
  const rewrites = job.quality?.rewrites ?? 0;

  if (score < MIN_SCORE && rewrites < MAX_REWRITES) {
    await patch(job.id, {
      step: 'captions',
      quality: { score, issues: allIssues, rewrites: rewrites + 1 },
      meta: { ...job.meta, feedback: allIssues },
    });
    return;
  }
  await patch(job.id, {
    step: 'image',
    quality: { score, issues: allIssues, rewrites },
    meta: { ...job.meta, feedback: [] },
  });
}

async function stepImage(job: Job, p: any) {
  const source = job.source_image_url || p.image_url;
  const prompt = `${job.captions!.image_prompt}\nProduct: ${p.title}. Keep the product exactly as in the reference photo. Vertical 9:16 ad composition, product centered with room at top and bottom for captions. No text, no watermark, no logos added.`;
  let url: string;
  if (agnesConfigured()) {
    url = await agnesImage({ prompt, images: source ? [source] : undefined, ratio: '9:16', size: '2K' });
  } else if (geminiImageConfigured()) {
    url = await geminiImage({ prompt, sourceUrl: source ?? undefined });
  } else {
    throw new AgnesError('No image provider: set AGNES_API_KEY (free) on the backend', 0, false);
  }
  // Provider URLs can expire — keep our own copy
  const saved = url.startsWith('http') ? await mirrorRemote(url, `${job.id}-image.png`) : null;
  // The video model needs a public URL; local dev storage isn't public, so keep the provider URL there.
  const publicUrl = saved?.url.startsWith('http') ? saved.url : url;
  await patch(job.id, { image_url: publicUrl, step: 'video', meta: { ...job.meta, localImage: saved?.url } });
}

async function stepVideo(job: Job) {
  if (!job.image_url?.startsWith('http')) {
    throw new AgnesError('Image is not on a public URL, so the video model cannot read it', 0, false);
  }
  const task = await agnesStartVideo({
    prompt: job.captions!.video_prompt,
    firstFrameUrl: job.image_url,
    seconds: config.videoSeconds,
    aspectRatio: '9:16',
  });
  await patch(job.id, {
    video_task: { ...task, started_at: new Date().toISOString() },
    step: 'video_poll',
    locked_until: new Date(Date.now() + 20_000).toISOString(),
  });
}

async function stepVideoPoll(job: Job) {
  const task = job.video_task!;
  const r = await agnesPollVideo(task);
  if (r.status === 'pending') {
    if (Date.now() - new Date(task.started_at).getTime() > VIDEO_TIMEOUT_MS) {
      // Start a fresh task rather than wait forever
      await patch(job.id, { step: 'video', video_task: null, error: 'video timed out, restarting' });
      return;
    }
    await patch(job.id, {
      locked_until: new Date(Date.now() + 15_000).toISOString(),
      meta: { ...job.meta, videoProgress: r.progress },
    });
    return;
  }
  if (r.status === 'failed') {
    throw new AgnesError(`video failed: ${r.error}`, 0, true);
  }
  const mirrored = await mirrorRemote(r.url, `${job.id}-video.mp4`);
  const saved = { url: mirrored.url.startsWith('http') ? mirrored.url : r.url };
  const autoApprove = job.auto && job.meta?.reviewMode === false;
  await patch(job.id, {
    video_url: saved.url,
    step: 'done',
    status: autoApprove ? 'running' : 'review',
    error: null,
    meta: { ...job.meta, videoProgress: 100 },
  });
  if (autoApprove) await approveJob({ ...job, video_url: saved.url, step: 'done' });
}

/* ----------------------------- runner ----------------------------- */

const running = new Set<string>();

/** Run exactly one step for a job. Safe to call concurrently (in-process lock). */
export async function runStep(job: Job): Promise<void> {
  if (running.has(job.id)) return;
  running.add(job.id);
  try {
    const product = job.products ?? (await db().from('products').select('*').eq('id', job.product_id).maybeSingle()).data;
    if (!product) {
      await patch(job.id, { status: 'failed', error: 'Product was deleted' });
      return;
    }
    if (job.status === 'queued') await patch(job.id, { status: 'running' });
    const fresh = { ...job, status: 'running' as JobStatus };
    switch (job.step) {
      case 'captions':
        await stepCaptions(fresh, product);
        break;
      case 'caption_check':
        await stepCaptionCheck(fresh, product);
        break;
      case 'image':
        await stepImage(fresh, product);
        break;
      case 'video':
        await stepVideo(fresh);
        break;
      case 'video_poll':
        await stepVideoPoll(fresh);
        break;
      default:
        break;
    }
    if (job.attempts) await patch(job.id, { attempts: 0 });
  } catch (e) {
    const retryable = !(e instanceof AgnesError) || e.retryable;
    const attempts = (job.attempts ?? 0) + 1;
    const msg = e instanceof Error ? e.message : String(e);
    if (retryable && attempts < MAX_ATTEMPTS) {
      const backoff = Math.min(30, 2 ** attempts) * 60_000; // 2, 4, 8 min
      await patch(job.id, { attempts, error: msg, locked_until: new Date(Date.now() + backoff).toISOString() });
    } else {
      await patch(job.id, { status: 'failed', attempts, error: msg });
    }
  } finally {
    running.delete(job.id);
  }
}

/** Advance every job that is due. Called by the in-process worker and the cron tick. */
export async function advanceJobs(limit = 4): Promise<number> {
  const { data } = await db()
    .from('pipeline_jobs')
    .select('*, products:product_id(*)')
    .in('status', ['queued', 'running'])
    .order('updated_at', { ascending: true })
    .limit(25);
  const now = Date.now();
  const due = ((data ?? []) as Job[])
    .filter((j) => j.step !== 'done' && (!j.locked_until || new Date(j.locked_until).getTime() <= now))
    .slice(0, limit);
  // Chain quick steps (captions → check → image → video start) in one pass;
  // stop when a job is waiting (video render, backoff) or finished.
  await Promise.all(
    due.map(async (first) => {
      let job: Job | null = first;
      for (let i = 0; i < 6 && job; i++) {
        await runStep(job);
        job = await getJob(job.id);
        if (!job || !['queued', 'running'].includes(job.status) || job.step === 'done') break;
        if (job.locked_until && new Date(job.locked_until).getTime() > Date.now()) break;
      }
    })
  );
  return due.length;
}

export async function activeJobCount(): Promise<number> {
  const { count } = await db()
    .from('pipeline_jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'running']);
  return count ?? 0;
}

/* --------------------------- public actions --------------------------- */

export async function enqueueJob(input: {
  productId: string;
  sourceImageUrl?: string | null;
  auto?: boolean;
  brandVoice?: string;
  reviewMode?: boolean;
}): Promise<Job> {
  const { data, error } = await db()
    .from('pipeline_jobs')
    .insert({
      product_id: input.productId,
      status: 'queued',
      step: 'captions',
      source_image_url: input.sourceImageUrl ?? null,
      attempts: 0,
      auto: Boolean(input.auto),
      meta: { brandVoice: input.brandVoice, reviewMode: input.reviewMode !== false },
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Job;
}

const RESTART_FROM: Record<string, Partial<Job>> = {
  captions: { step: 'captions', captions: null, quality: null, image_url: null, video_url: null, video_task: null },
  image: { step: 'image', image_url: null, video_url: null, video_task: null },
  video: { step: 'video', video_url: null, video_task: null },
};

/** Re-run from a step (keeps everything before it). */
export async function restartJob(job: Job, from?: 'captions' | 'image' | 'video') {
  const target = from ?? (job.step === 'video_poll' ? 'video' : job.step === 'caption_check' ? 'captions' : (job.step as any));
  const reset = RESTART_FROM[target] ?? { step: job.step };
  await patch(job.id, { ...reset, status: 'queued', attempts: 0, error: null, locked_until: null });
}

/** Slots helper mirrors the scheduler's posting times. */
function nextSlots(times: string[], count: number): string[] {
  const slots: string[] = [];
  const sorted = [...times].sort();
  for (let day = 0; day < 4 && slots.length < count; day++) {
    for (const t of sorted) {
      if (slots.length >= count) break;
      const [hh, mm] = t.split(':').map(Number);
      const d = new Date();
      d.setDate(d.getDate() + day);
      d.setHours(hh || 0, mm || 0, 0, 0);
      if (d.getTime() > Date.now() + 60_000) slots.push(d.toISOString());
    }
  }
  return slots;
}

/** Turn a finished job into scheduled TikTok + YouTube posts. */
export async function approveJob(
  job: Job,
  opts: { platforms?: ('tiktok' | 'youtube')[]; times?: string[]; publishNow?: boolean } = {}
): Promise<string[]> {
  if (!job.video_url || !job.captions) throw new Error('Job has no finished video yet');
  const platforms = opts.platforms?.length ? opts.platforms : (['tiktok', 'youtube'] as const);
  const slots = nextSlots(opts.times ?? ['10:00', '15:00', '19:00'], platforms.length);
  const ids: string[] = [];
  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i];
    const c = job.captions[platform];
    const { data, error } = await db()
      .from('content')
      .insert({
        product_id: job.product_id,
        platform,
        format: platform === 'youtube' ? 'short' : 'video_script',
        title: c.title,
        body: c.body,
        hashtags: c.hashtags,
        media: [
          { url: job.video_url, type: 'video' },
          ...(job.image_url ? [{ url: job.image_url, type: 'image' }] : []),
        ],
        status: 'scheduled',
        scheduled_at: opts.publishNow ? new Date().toISOString() : slots[i],
        meta: { generated_by: 'studio', job_id: job.id, quality: job.quality?.score ?? null },
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    ids.push(data.id);
  }
  await patch(job.id, { status: 'approved', meta: { ...job.meta, contentIds: ids } });
  return ids;
}

export async function getJob(id: string): Promise<Job | null> {
  const { data } = await db().from('pipeline_jobs').select('*, products:product_id(*)').eq('id', id).maybeSingle();
  return (data as Job) ?? null;
}

/* --------------------------- background worker --------------------------- */

let workerTimer: NodeJS.Timeout | null = null;
let ticking = false;

/** In-process worker for the long-running server (Render). Quiet: logs only failures. */
export function startWorker(intervalMs = 15_000) {
  if (workerTimer) return;
  workerTimer = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await advanceJobs();
    } catch (e) {
      console.error('[pipeline] worker error:', e instanceof Error ? e.message : e);
    } finally {
      ticking = false;
    }
  }, intervalMs);
  workerTimer.unref?.();
}

/** Kick the worker right away (non-blocking) after a user action. */
export function kick(): void {
  setTimeout(() => advanceJobs().catch(() => {}), 50);
}
