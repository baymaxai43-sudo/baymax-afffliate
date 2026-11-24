import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import { runAgent } from '../services/agent';

export async function chatRoutes(app: FastifyInstance): Promise<void> {
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

  app.post<{ Body: { message?: string } }>(
    '/chat',
    {
      preHandler: app.requireAuth,
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: { message: { type: 'string', minLength: 1, maxLength: 4000 } },
        },
      },
    },
    async (req) => {
      const message = (req.body?.message ?? '').trim();
      if (!message) return { reply: 'Say something and I\'ll get on it.', toolTrace: [], provider: 'demo' };
      const { data: recent } = await db()
        .from('chat_messages')
        .select('role,content')
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: false })
        .limit(12);

      const history = (recent ?? []).reverse();
      const result = await runAgent(message, history);

      const now = new Date().toISOString();
      await db().from('chat_messages').insert([
        { role: 'user', content: message, created_at: now },
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
