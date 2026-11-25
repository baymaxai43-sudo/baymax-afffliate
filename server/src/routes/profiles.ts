import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getSetting, setSetting } from '../db';

export interface Profile {
  id: string;
  name: string;
  email: string;
  niche: string;
  bio: string;
  color: string;
  createdAt: string;
}

interface ProfileStore {
  items: Profile[];
  activeId: string | null;
}

const KEY = 'profiles';
const COLORS = ['#22d3ee', '#4f8cff', '#8b5cf6', '#a3ff6b', '#f472b6', '#f59e0b'];
const MAX_PROFILES = 20;

async function load(): Promise<ProfileStore> {
  const store = await getSetting<ProfileStore>(KEY, { items: [], activeId: null });
  return { items: Array.isArray(store?.items) ? store.items : [], activeId: store?.activeId ?? null };
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  /** List every profile and which one is active. */
  app.get('/profiles', async () => load());

  /** Create a profile. The first one becomes active automatically. */
  app.post<{ Body: Partial<Profile> }>(
    '/profiles',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 60 },
            email: { type: 'string', maxLength: 120 },
            niche: { type: 'string', maxLength: 80 },
            bio: { type: 'string', maxLength: 280 },
          },
        },
      },
    },
    async (req, reply) => {
      const store = await load();
      if (store.items.length >= MAX_PROFILES) return reply.code(400).send({ error: `Limit of ${MAX_PROFILES} profiles reached` });
      const name = clean(req.body.name, 60);
      if (!name) return reply.code(400).send({ error: 'Name is required' });
      const profile: Profile = {
        id: randomUUID(),
        name,
        email: clean(req.body.email, 120),
        niche: clean(req.body.niche, 80),
        bio: clean(req.body.bio, 280),
        color: COLORS[store.items.length % COLORS.length],
        createdAt: new Date().toISOString(),
      };
      const next: ProfileStore = { items: [...store.items, profile], activeId: store.activeId ?? profile.id };
      await setSetting(KEY, next);
      return reply.code(201).send({ profile, ...next });
    }
  );

  /** Make a profile the active one. */
  app.patch<{ Params: { id: string } }>('/profiles/:id/active', async (req, reply) => {
    const store = await load();
    if (!store.items.some((p) => p.id === req.params.id)) return reply.code(404).send({ error: 'Profile not found' });
    const next = { ...store, activeId: req.params.id };
    await setSetting(KEY, next);
    return next;
  });

  /** Remove a profile. If it was active, the first remaining one takes over. */
  app.delete<{ Params: { id: string } }>('/profiles/:id', async (req, reply) => {
    const store = await load();
    const items = store.items.filter((p) => p.id !== req.params.id);
    if (items.length === store.items.length) return reply.code(404).send({ error: 'Profile not found' });
    const activeId = store.activeId === req.params.id ? items[0]?.id ?? null : store.activeId;
    const next = { items, activeId };
    await setSetting(KEY, next);
    return next;
  });
}
