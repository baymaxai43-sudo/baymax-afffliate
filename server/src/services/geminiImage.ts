/**
 * Optional Gemini image fallback. Gemini's free tier has NO image models,
 * so this only runs when GEMINI_IMAGE_MODEL is set on a billed project.
 */
import { config } from '../config';
import { saveMedia } from '../storage';
import { AgnesError } from './agnes';

export const geminiImageConfigured = () => Boolean(config.geminiApiKey && config.geminiImageModel);

export async function geminiImage(input: { prompt: string; sourceUrl?: string }): Promise<string> {
  const parts: any[] = [{ text: input.prompt }];
  if (input.sourceUrl?.startsWith('http')) {
    const img = await fetch(input.sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (img.ok) {
      const mimeType = img.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
      parts.push({ inlineData: { mimeType, data: Buffer.from(await img.arrayBuffer()).toString('base64') } });
    }
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.geminiImageModel
  )}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const retry = res.status === 429 || res.status >= 500;
    throw new AgnesError(`gemini image ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status, retry);
  }
  const data = await res.json();
  const out = (data?.candidates?.[0]?.content?.parts ?? []).find((p: any) => p.inlineData?.data);
  if (!out) throw new AgnesError('gemini image returned no image', 0, true);
  const saved = await saveMedia({
    filename: 'gemini-image.png',
    mimetype: out.inlineData.mimeType || 'image/png',
    buffer: Buffer.from(out.inlineData.data, 'base64'),
  });
  return saved.url;
}
