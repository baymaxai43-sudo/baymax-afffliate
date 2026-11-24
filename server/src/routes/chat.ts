import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import { runAgent } from '../services/agent';
import { saveAttachment, readLocalAttachment } from '../storage';

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  /** Multipart upload: up to 6 files, 15MB each — any format (.zip .pdf .jpeg …). */
  app.post('/chat/upload', { preHandler: app.requireAuth }, async (req, reply) => {
    if (!req.isMultipart()) return reply.code(400).send({ error: 'multipart/form-data required' });
    const files = [];
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      const buffer = await part.toBuffer();
      files.push(
        await saveAttachment({ filename: part.filename, mimetype: part.mimetype, buffer })
      );
      if (files.length >= 6) break;
    }
    if (!files.length) return reply.code(400).send({ error: 'no files provided' });
    return { files };
  });

  /** LOCAL_STORE only: serve disk-stored attachments (prod serves from Supabase Storage). */
  app.get<{ Params: { name: string } }>('/chat/files/:name', async (req, reply) => {
    const found = await readLocalAttachment(req.params.name);
    if (!found) return reply.code(404).send({ error: 'not found' });
    return reply
      .header('content-type', found.mime)
      .header('cache-control', 'public, max-age=86400')
      .send(found.buffer);
  });

  app.get<{ Querystring: { limit?: string } }>('/chat/messages', { preHandler: app.requireAuth }, async (req) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { data } = await db()
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return { messages: (data ?? []).reverse() };
  });

  app.delete('/chat/messages', { preHandler: app.requireAuth }, async () => {
    await db().from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    return { ok: true };
  });

  const attachmentSchema = {
    type: 'object',
    required: ['name', 'path', 'mime', 'size', 'url'],
    properties: {
      name: { type: 'string', maxLength: 255 },
      path: { type: 'string', maxLength: 512 },
      mime: { type: 'string', maxLength: 128 },
      size: { type: 'number' },
      url: { type: 'string', maxLength: 2048 },
    },
  };

  app.post<{ Body: { message?: string; attachments?: unknown[] } }>(
    '/chat',
    {
      preHandler: app.requireAuth,
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', minLength: 1, maxLength: 4000 },
            attachments: { type: 'array', maxItems: 6, items: attachmentSchema },
          },
        },
      },
    },
    async (req) => {
      const message = (req.body?.message ?? '').trim();
      const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
      if (!message) return { reply: 'Say something and I\'ll get on it.', toolTrace: [], provider: 'error' };
      const { data: recent } = await db()
        .from('chat_messages')
        .select('role,content')
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: false })
        .limit(12);

      const history = (recent ?? []).reverse();
      let result: Awaited<ReturnType<typeof runAgent>>;
      try {
        result = await runAgent(message, history);
      } catch (e: any) {
        // No demo fallback — tell the owner exactly what failed
        result = {
          reply: `⚠️ AI request failed: ${e?.message ?? e}. Check GEMINI_API_KEY / GROQ_API_KEY on Render.`,
          toolTrace: [],
          provider: 'error',
        };
      }

      const now = new Date().toISOString();
      await db().from('chat_messages').insert([
        { role: 'user', content: message, created_at: now, meta: attachments.length ? { attachments } : {} },
        {
          role: 'assistant',
          content: result.reply,
          created_at: new Date(Date.now() + 1).toISOString(),
          meta: { toolTrace: result.toolTrace, provider: result.provider },
        },
      ]);

      return result;
    }
  );
}
