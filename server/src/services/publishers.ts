/**
 * Social publishers: TikTok (Content Posting API, photo/video posts) + YouTube Data API.
 * Both use OAuth connections stored in the `connections` table.
 */
import { db } from '../db';
import { config } from '../config';

export interface Connection {
  platform: 'tiktok' | 'youtube';
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
  meta: Record<string, any>;
}

export class PublishError extends Error {
  constructor(message: string, public readonly code: 'not_connected' | 'failed') {
    super(message);
  }
}

export async function getConnection(platform: 'tiktok' | 'youtube'): Promise<Connection | null> {
  const { data } = await db().from('connections').select('*').eq('platform', platform).maybeSingle();
  if (!data?.access_token) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    // Try refresh (YouTube) — TikTok refresh handled in oauth service
    const refreshed = await tryRefresh(platform, data);
    if (!refreshed) return null;
  }
  return data as Connection;
}

async function tryRefresh(platform: string, row: any): Promise<boolean> {
  try {
    if (platform === 'youtube' && config.youtubeClientId && row.refresh_token) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.youtubeClientId,
          client_secret: config.youtubeClientSecret,
          refresh_token: row.refresh_token,
          grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return false;
      const json = await res.json();
      await db()
        .from('connections')
        .update({
          access_token: json.access_token,
          expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('platform', platform);
      return true;
    }
    if (platform === 'tiktok' && config.tiktokClientKey && row.refresh_token) {
      const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: config.tiktokClientKey,
          client_secret: config.tiktokClientSecret,
          grant_type: 'refresh_token',
          refresh_token: row.refresh_token,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return false;
      const json = await res.json();
      if (json.data?.access_token) {
        await db()
          .from('connections')
          .update({
            access_token: json.data.access_token,
            refresh_token: json.data.refresh_token ?? row.refresh_token,
            expires_at: new Date(Date.now() + (json.data.expires_in ?? 86400) * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('platform', platform);
        return true;
      }
      return false;
    }
  } catch {
    return false;
  }
  return false;
}

/* ------------------------------- YouTube ------------------------------- */

async function youtubeUpload(videoUrl: string, title: string, description: string, tags: string[]) {
  const conn = await getConnection('youtube');
  if (!conn) {
    throw new PublishError('YouTube is not connected yet — connect it in Settings.', 'not_connected');
  }
  // Download the video the owner provided
  const vidRes = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
  if (!vidRes.ok) throw new PublishError(`Could not download video (${vidRes.status}).`, 'failed');
  const blob = await vidRes.blob();

  const meta = {
    snippet: {
      title: title.slice(0, 100),
      description: description.slice(0, 4800),
      tags: tags.slice(0, 25),
      categoryId: '22',
    },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
  };

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(blob.size),
        'X-Upload-Content-Type': 'video/*',
      },
      body: JSON.stringify(meta),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!initRes.ok) {
    throw new PublishError(`YouTube rejected the upload session (${initRes.status}).`, 'failed');
  }
  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) throw new PublishError('YouTube did not return an upload URL.', 'failed');

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/*', 'Content-Length': String(blob.size) },
    body: blob,
    signal: AbortSignal.timeout(300_000),
  });
  if (!putRes.ok) throw new PublishError(`YouTube upload failed (${putRes.status}).`, 'failed');
  const json = await putRes.json();
  return { id: json.id, url: `https://youtube.com/watch?v=${json.id}` };
}

/* -------------------------------- TikTok ------------------------------- */

/**
 * TikTok Content Posting API — PHOTO_POST (image carousel pulled from URLs)
 * or VIDEO_POST when a direct video URL is supplied.
 */
async function tiktokPublish(input: {
  title: string;
  body: string;
  hashtags: string[];
  imageUrls: string[];
  videoUrl?: string;
}) {
  const conn = await getConnection('tiktok');
  if (!conn) {
    throw new PublishError('TikTok is not connected yet — connect it in Settings.', 'not_connected');
  }

  const caption = [input.body, ...input.hashtags.map((h) => `#${h}`)].join('\n').slice(0, 2200);

  // 1) Init the post
  const isVideo = Boolean(input.videoUrl);
  const initBody = isVideo
    ? {
        post_info: { title: caption, privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false },
        source_info: { source: 'FILE_UPLOAD', video_size: 0 },
      }
    : {
        post_info: { title: caption, privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false },
        source_info: {
          source: 'PULL_FROM_URL',
          image_urls: input.imageUrls.slice(0, 10),
        },
      };

  const initPath = isVideo
    ? '/v2/post/publish/video/init/'
    : '/v2/post/publish/photo/init/';
  const initRes = await fetch(`https://open.tiktokapis.com${initPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(initBody),
    signal: AbortSignal.timeout(30_000),
  });
  const initJson = await initRes.json().catch(() => ({}));
  if (!initRes.ok || initJson.error?.code !== 'ok') {
    throw new PublishError(
      `TikTok init failed: ${initJson.error?.message ?? initRes.status}.`,
      'failed'
    );
  }
  const publishId = initJson.data?.publish_id;
  if (!publishId) throw new PublishError('TikTok did not return a publish_id.', 'failed');

  if (isVideo) {
    // 2) Upload video bytes (FILE_UPLOAD)
    const vid = await fetch(input.videoUrl!, { signal: AbortSignal.timeout(120_000) });
    if (!vid.ok) throw new PublishError('Could not download video for TikTok.', 'failed');
    const blob = await vid.blob();
    const upRes = await fetch(
      `https://open.tiktokapis.com/v2/post/publish/video/init/publish/?publish_id=${publishId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${conn.access_token}`,
          'Content-Type': 'video/*',
          'Content-Length': String(blob.size),
        },
        body: blob,
        signal: AbortSignal.timeout(300_000),
      }
    );
    if (!upRes.ok) throw new PublishError(`TikTok video upload failed (${upRes.status}).`, 'failed');
  }

  // 3) Poll status briefly (photo pulls process async)
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish_id: publishId }),
      signal: AbortSignal.timeout(15_000),
    });
    const stJson = await st.json().catch(() => ({}));
    const status = stJson.data?.status;
    if (status === 'PUBLISH_COMPLETE' || status === 'SEND_COMPLETE') break;
    if (status === 'PUBLISH_FAILED') {
      throw new PublishError(stJson.data?.fail_reason ?? 'TikTok publish failed.', 'failed');
    }
  }

  return { id: publishId, url: 'https://www.tiktok.com' };
}

/* ------------------------------ Dispatcher ----------------------------- */

export interface PublishInput {
  platform: 'tiktok' | 'youtube';
  title: string;
  body: string;
  hashtags: string[];
  media: { url: string; type?: string }[];
}

export async function publishPost(input: PublishInput): Promise<{ id: string; url: string }> {
  if (input.platform === 'youtube') {
    const video = input.media.find((m) => m.type === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(m.url));
    if (!video) {
      throw new PublishError(
        'YouTube needs a video file URL — add one to this post (media field), or publish to TikTok as a photo post.',
        'failed'
      );
    }
    return youtubeUpload(video.url, input.title, input.body, input.hashtags);
  }
  const images = input.media.filter((m) => !m.type || m.type === 'image').map((m) => m.url);
  const video = input.media.find((m) => m.type === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(m.url));
  if (!images.length && !video) {
    throw new PublishError(
      'No media found — add at least one product image URL (or a video) before publishing to TikTok.',
      'failed'
    );
  }
  return tiktokPublish({
    title: input.title,
    body: input.body,
    hashtags: input.hashtags,
    imageUrls: images,
    videoUrl: video?.url,
  });
}
