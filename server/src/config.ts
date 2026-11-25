export const config = {
  port: Number(process.env.PORT || 4000),
  supabaseUrl: process.env.SUPABASE_URL || 'https://opcdbpbnhabdcqkfrjrt.supabase.co',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),

  // AI — Gemini primary, Groq fallback
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',

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
