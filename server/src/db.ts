import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
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
