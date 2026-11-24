import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';
import { createLocalClient } from './localStore';

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    // Offline / preview mode: file-backed JSON store (no Supabase needed)
    if (process.env.LOCAL_STORE === '1') {
      client = createLocalClient() as unknown as SupabaseClient;
      return client;
    }
    if (!config.supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_KEY is not set');
    }
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Read a settings value (jsonb). */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await db().from('settings').select('value').eq('key', key).maybeSingle();
  if (error || !data) return fallback;
  return data.value as T;
}

/** Upsert a settings value. */
export async function setSetting(key: string, value: unknown): Promise<void> {
  const { error } = await db()
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`settings upsert failed: ${error.message}`);
}
