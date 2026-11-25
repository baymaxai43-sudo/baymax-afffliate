/**
 * Agnes AI client — image generation (image-to-image) and image-to-video.
 * Docs: https://agnes-ai.com/en/docs/agnes-image-25-flash
 *       https://www.agnes-ai.com/en/docs/agnes-video-25-flash
 * Plain REST, OpenAI-style auth (Authorization: Bearer AGNES_API_KEY).
 */
import { config } from '../config';

export class AgnesError extends Error {
  constructor(message: string, public status = 0, public retryable = true) {
    super(message);
  }
}

export const agnesConfigured = () => Boolean(config.agnesApiKey);

function headers() {
  if (!config.agnesApiKey) throw new AgnesError('AGNES_API_KEY is not set on the backend', 0, false);
  return { Authorization: `Bearer ${config.agnesApiKey}`, 'Content-Type': 'application/json' };
}

async function readError(res: Response): Promise<string> {
  const text = (await res.text().catch(() => '')).slice(0, 300);
  try {
    const j = JSON.parse(text);
    return j.detail || j.error?.message || j.message || text;
  } catch {
    return text || res.statusText;
  }
}

/** Retryable when rate-limited or the service hiccups; 4xx validation errors are final. */
const retryableStatus = (s: number) => s === 408 || s === 429 || s >= 500;

/**
 * Generate a marketing image from the product photo (image-to-image).
 * `images` are public URLs or data: URIs. Returns the provider's image URL.
 */
export async function agnesImage(input: {
  prompt: string;
  images?: string[];
  ratio?: '9:16' | '1:1' | '3:4' | '16:9';
  size?: '1K' | '2K';
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.agnesImageModel,
    prompt: input.prompt,
    size: input.size ?? '2K',
    ratio: input.ratio ?? '9:16',
    extra_body: {
      response_format: 'url',
      ...(input.images?.length ? { image: input.images.slice(0, 3) } : {}),
    },
  };
  const res = await fetch(`${config.agnesBaseUrl}/images/generations`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000), // docs recommend 60–360 s
  });
  if (!res.ok) throw new AgnesError(`agnes image ${res.status}: ${await readError(res)}`, res.status, retryableStatus(res.status));
  const data = await res.json();
  const url: string | undefined = data?.data?.[0]?.url;
  if (!url) throw new AgnesError('agnes image returned no url');
  return url;
}

export interface VideoTask {
  video_id: string;
  task_id?: string;
  model: string;
}

/** Start an image-to-video task (first frame = our generated image). */
export async function agnesStartVideo(input: {
  prompt: string;
  firstFrameUrl: string;
  seconds?: string;
  aspectRatio?: '9:16' | '16:9' | '1:1';
}): Promise<VideoTask> {
  const model = config.agnesVideoModel;
  const secs = String(Math.min(12, Math.max(4, Number(input.seconds ?? config.videoSeconds) || 8)));
  const res = await fetch(`${config.agnesBaseUrl}/videos`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      mode: 'keyframe',
      first_frame: input.firstFrameUrl,
      seconds: secs,
      size: '720P',
      aspect_ratio: input.aspectRatio ?? '9:16',
      n: 1,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new AgnesError(`agnes video ${res.status}: ${await readError(res)}`, res.status, retryableStatus(res.status));
  const data = await res.json();
  const video_id: string | undefined = data?.video_id ?? data?.id;
  if (!video_id) throw new AgnesError('agnes video returned no video_id');
  return { video_id, task_id: data?.task_id ?? data?.id, model };
}

export type VideoPoll =
  | { status: 'pending'; progress: number }
  | { status: 'completed'; url: string }
  | { status: 'failed'; error: string };

/** Poll a video task. Agnes requires model_name for keyframe tasks. */
export async function agnesPollVideo(task: VideoTask): Promise<VideoPoll> {
  const root = config.agnesBaseUrl.replace(/\/v1$/, '');
  const url = `${root}/agnesapi?video_id=${encodeURIComponent(task.video_id)}&model_name=${encodeURIComponent(task.model)}`;
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new AgnesError(`agnes poll ${res.status}: ${await readError(res)}`, res.status, retryableStatus(res.status));
  const data = await res.json();
  if (data?.status === 'completed' && data?.url) return { status: 'completed', url: data.url };
  if (data?.status === 'failed') {
    const err = typeof data.error === 'string' ? data.error : data.error?.message ?? 'video generation failed';
    return { status: 'failed', error: err };
  }
  return { status: 'pending', progress: Number(data?.progress ?? 0) };
}
