export const config = {
  port: Number(process.env.PORT || 4000),
  supabaseUrl: process.env.SUPABASE_URL || 'https://opcdbpbnhabdcqkfrjrt.supabase.co',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),

  // AI — Groq does the thinking (primary), Gemini free-tier text is the fallback.
  // AI_PRIMARY=gemini flips the order.
  aiPrimary: (process.env.AI_PRIMARY || 'groq').toLowerCase() === 'gemini' ? 'gemini' : 'groq',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  // Free-tier text model (gemini-3.1-pro-preview is paid-only)
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  // Optional: only works on a billed Gemini project (no free image tier)
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  groqBaseUrl: (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),

  // Agnes AI — image generation + image-to-video (free models)
  agnesApiKey: process.env.AGNES_API_KEY || '',
  agnesBaseUrl: (process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1').replace(/\/$/, ''),
  agnesImageModel: process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.5-flash',
  agnesVideoModel: process.env.AGNES_VIDEO_MODEL || 'agnes-video-2.5-flash',
  videoSeconds: process.env.VIDEO_SECONDS || '8',

  // Keep-alive for Render free tier (sleeps after 15 min idle).
  // Render sets RENDER_EXTERNAL_URL automatically; KEEPALIVE_URL overrides.
  keepAliveUrl: (process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, ''),
  keepAliveMinutes: Number(process.env.KEEPALIVE_MINUTES || 12),

  // AliExpress affiliate (optional — link scraping works without these)
  aliexpressAppKey: process.env.ALIEXPRESS_APP_KEY || '',
  aliexpressAppSecret: process.env.ALIEXPRESS_APP_SECRET || '',
  aliexpressTrackingId: process.env.ALIEXPRESS_TRACKING_ID || '',

  // Social OAuth
  youtubeClientId: process.env.YOUTUBE_CLIENT_ID || '',
  youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
  tiktokClientKey: process.env.TIKTOK_CLIENT_KEY || '',
  tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET || '',

  cronSecret: process.env.CRON_SECRET || '',
  // Owner password hash — lives on the backend host (Render env var)
  ownerPasswordHash: process.env.OWNER_PASSWORD_HASH || '',
};

export const aiConfigured = () => Boolean(config.geminiApiKey || config.groqApiKey);
