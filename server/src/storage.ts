/**
 * Chat attachment storage.
 * - Production: Supabase Storage bucket `chat-attachments` (public, UUID paths)
 * - LOCAL_STORE: disk under .local-store/attachments (served by /chat/files/:name)
 */
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

const BUCKET = 'chat-attachments';
const LOCAL_DIR = path.join(process.cwd(), '.local-store', 'attachments');

export interface SavedAttachment {
  name: string;
  path: string;
  mime: string;
  size: number;
  url: string;
}

const isLocal = () => Boolean(process.env.LOCAL_STORE);

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

let bucketReady: Promise<void> | null = null;
async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { error } = await supabase().storage.createBucket(BUCKET, { public: true });
      if (error && !/already exists|duplicate/i.test(error.message)) {
        bucketReady = null;
        throw new Error(`storage bucket: ${error.message}`);
      }
    })();
  }
  return bucketReady;
}

const MIME_BY_EXT: Record<string, string> = {
  zip: 'application/zip',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  csv: 'text/csv',
  txt: 'text/plain',
  mp4: 'video/mp4',
  svg: 'image/svg+xml',
};

function inferMime(filename: string, declared: string): string {
  if (declared && declared !== 'application/octet-stream') return declared;
  const m = filename.match(/\.([a-z0-9]{1,6})$/i);
  const guess = m ? MIME_BY_EXT[m[1].toLowerCase()] : undefined;
  return guess || declared || 'application/octet-stream';
}

function safeName(filename: string): string {
  const base = path.basename(filename || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return base.slice(-80) || 'file';
}

export async function saveAttachment(file: {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}): Promise<SavedAttachment> {
  const objectPath = `${randomUUID()}-${safeName(file.filename)}`;
  const meta = {
    name: file.filename || objectPath,
    path: objectPath,
    mime: inferMime(file.filename || '', file.mimetype),
    size: file.buffer.length,
  };

  if (isLocal()) {
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    await fs.writeFile(path.join(LOCAL_DIR, objectPath), file.buffer);
    await fs.writeFile(path.join(LOCAL_DIR, `${objectPath}.mime`), meta.mime, 'utf8');
    return { ...meta, url: `/chat/files/${encodeURIComponent(objectPath)}` };
  }

  await ensureBucket();
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(objectPath, file.buffer, { contentType: meta.mime, upsert: false });
  if (error) throw new Error(`upload failed: ${error.message}`);
  const { data } = supabase().storage.from(BUCKET).getPublicUrl(objectPath);
  return { ...meta, url: data.publicUrl };
}

/** Serve a locally-stored attachment (LOCAL_STORE mode). Traversal-safe. */
export async function readLocalAttachment(name: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const safe = path.basename(name);
  try {
    const buffer = await fs.readFile(path.join(LOCAL_DIR, safe));
    let mime = 'application/octet-stream';
    try {
      mime = (await fs.readFile(path.join(LOCAL_DIR, `${safe}.mime`), 'utf8')).trim() || mime;
    } catch {
      /* no sidecar — guess below */
      if (/\.(jpe?g)$/i.test(safe)) mime = 'image/jpeg';
      else if (/\.png$/i.test(safe)) mime = 'image/png';
      else if (/\.pdf$/i.test(safe)) mime = 'application/pdf';
      else if (/\.zip$/i.test(safe)) mime = 'application/zip';
    }
    return { buffer, mime };
  } catch {
    return null;
  }
}
