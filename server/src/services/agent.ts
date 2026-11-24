/**
 * Baymax-Shoppey autonomous agent: a tool-calling loop over the store.
 * The chat UI drives it; it can list/add products, generate & schedule content,
 * record sales, read analytics, and control autopilot.
 */
import { chat, type AIMessage, type AITool, type ToolCall } from '../ai';
import { db, getSetting, setSetting } from '../db';
import { generatePosts } from './contentGen';
import { getAutopilot, tick, type AutopilotSettings } from './scheduler';
import { scrapeProduct } from './products';

const SYSTEM = `You are Baymax-Shoppey, the owner's private autonomous affiliate marketing assistant.
You manage ONE personal AliExpress affiliate store and promote its products on TikTok and YouTube on full autopilot.

Personality: warm, sharp, concise — like a competent chief-of-staff. Short paragraphs, no fluff, no markdown headers in chat replies (plain text, you may use line breaks and • bullets).

Capabilities (use tools, don't just describe):
• products: list, inspect, add from an AliExpress link
• content: generate TikTok/YouTube posts, schedule them
• analytics: clicks, sales, post performance
• autopilot: read/update settings, run the scheduler now
• sales: record a sale manually when the affiliate dashboard confirms one

Rules:
- Prefer calling tools over guessing. Never invent numbers — always read them from tools.
- When the owner asks to "promote X" or "post something", actually generate + schedule content.
- Keep replies under ~120 words unless asked for detail.
- If a tool fails, say what happened and the one next step.`;

const TOOLS: AITool[] = [
  {
    name: 'list_products',
    description: 'List products in the store with status and short links. Optional search query.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'optional search text' } },
      required: [],
    },
  },
  {
    name: 'add_product',
    description: 'Add a product from an AliExpress affiliate URL (fetches title/price/image) or manual fields.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'AliExpress product/affiliate link' },
        title: { type: 'string' },
        price: { type: 'number' },
        image_url: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'generate_content',
    description:
      'Generate posts for a product on TikTok and/or YouTube and schedule them at the next autopilot slots. Pass "publish_now"=true to publish immediately instead.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        platforms: { type: 'array', items: { type: 'string', enum: ['tiktok', 'youtube'] } },
        count_per_platform: { type: 'number' },
        publish_now: { type: 'boolean' },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'get_analytics',
    description: 'Get store analytics: totals, clicks last 7 days, top products, recent sales.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_content',
    description: 'List scheduled/published/failed posts, newest first. Optional status filter.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'scheduled', 'published', 'failed'] },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'record_sale',
    description: 'Record a confirmed sale (from the affiliate dashboard) so revenue is tracked.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        value: { type: 'number' },
        currency: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['value'],
    },
  },
  {
    name: 'get_autopilot',
    description: 'Read autopilot settings (enabled, daily posts per platform, posting times, brand voice).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_autopilot',
    description: 'Update autopilot settings. Only pass fields that should change.',
    parameters: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        dailyPerPlatform: { type: 'number' },
        times: { type: 'array', items: { type: 'string' } },
        brandVoice: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'run_scheduler_now',
    description: 'Run the scheduler immediately: publish due posts and generate the next autopilot batch.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

function shortCode(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'list_products': {
        const q = String(args.query ?? '').trim();
        let query = db().from('products').select('id,title,price,currency,status,short_code,image_url,created_at').order('created_at', { ascending: false }).limit(20);
        if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
        const { data } = await query;
        if (!data?.length) return JSON.stringify({ products: [], note: 'store is empty' });
        return JSON.stringify({
          products: data.map((p) => ({
            id: p.id,
            title: p.title,
            price: p.price,
            status: p.status,
            link: p.short_code ? `/c/${p.short_code}` : null,
          })),
        });
      }
      case 'add_product': {
        const url = String(args.url ?? '').trim();
        if (url) {
          const scraped = await scrapeProduct(url);
          const payload = {
            title: scraped.title,
            description: scraped.description ?? null,
            price: scraped.price ?? (args.price as number | undefined) ?? null,
            currency: scraped.currency ?? 'USD',
            image_url: scraped.imageUrl ?? (args.image_url as string | undefined) ?? null,
            affiliate_url: scraped.affiliateUrl,
            short_code: shortCode(),
            source: 'aliexpress',
            status: 'active',
          };
          const { data, error } = await db().from('products').insert(payload).select().single();
          if (error) throw new Error(error.message);
          return JSON.stringify({ added: true, id: data.id, title: data.title, price: data.price });
        }
        const title = String(args.title ?? '').trim();
        if (!title) throw new Error('Provide url or title');
        const { data, error } = await db()
          .from('products')
          .insert({
            title,
            price: (args.price as number | undefined) ?? null,
            currency: 'USD',
            image_url: (args.image_url as string | undefined) ?? null,
            affiliate_url: String((args as any).affiliate_url ?? ''),
            short_code: shortCode(),
            status: 'active',
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return JSON.stringify({ added: true, id: data.id, title: data.title });
      }
      case 'generate_content': {
        const productId = String(args.product_id ?? '');
        const { data: product, error } = await db().from('products').select('*').eq('id', productId).single();
        if (error || !product) throw new Error('Product not found');
        const platforms = (Array.isArray(args.platforms) && args.platforms.length
          ? args.platforms
          : ['tiktok', 'youtube']) as ('tiktok' | 'youtube')[];
        const count = Math.min(Number(args.count_per_platform ?? 1) || 1, 3);
        const autopilot = await getAutopilot();
        const created: any[] = [];
        for (const platform of platforms) {
          const posts = await generatePosts(product, platform, count, { brandVoice: autopilot.brandVoice });
          for (const p of posts) {
            const row = {
              product_id: product.id,
              platform: p.platform,
              format: p.format,
              title: p.title,
              body: p.body,
              hashtags: p.hashtags,
              media: product.image_url ? [{ url: product.image_url, type: 'image' }] : [],
              status: args.publish_now ? 'scheduled' : 'draft',
              scheduled_at: args.publish_now ? new Date().toISOString() : null,
              meta: { generated_by: 'agent' },
            };
            const { data, error } = await db().from('content').insert(row).select().single();
            if (error) throw new Error(error.message);
            created.push({ id: data.id, platform, title: p.title, status: data.status });
          }
        }
        if (args.publish_now) await tick({ generate: false });
        return JSON.stringify({ created, count: created.length });
      }
      case 'get_analytics': {
        const since = new Date(Date.now() - 7 * 86400_000).toISOString();
        const [productsRes, clicksRes, salesRes, clickEvents] = await Promise.all([
          db().from('products').select('id', { count: 'exact', head: true }),
          db().from('events').select('id', { count: 'exact', head: true }).eq('kind', 'click').gte('occurred_at', since),
          db().from('events').select('value,currency,occurred_at,product_id').eq('kind', 'sale').order('occurred_at', { ascending: false }).limit(10),
          db().from('events').select('product_id').eq('kind', 'click').gte('occurred_at', since).limit(1000),
        ]);
        const revenue = (salesRes.data ?? []).reduce((s, e) => s + Number(e.value ?? 0), 0);
        const byProduct: Record<string, number> = {};
        for (const e of clickEvents.data ?? []) {
          if (e.product_id) byProduct[e.product_id] = (byProduct[e.product_id] ?? 0) + 1;
        }
        const topIds = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 5);
        let top: unknown[] = [];
        if (topIds.length) {
          const { data: rows } = await db()
            .from('products')
            .select('id,title')
            .in('id', topIds.map(([id]) => id));
          top = topIds.map(([id, count]) => ({
            title: rows?.find((r) => r.id === id)?.title ?? 'unknown',
            clicks: count,
          }));
        }
        return JSON.stringify({
          products: productsRes.count ?? 0,
          clicks_last_7d: clicksRes.count ?? 0,
          sales_last_7d: (salesRes.data ?? []).length,
          revenue_last_7d: revenue,
          recent_sales: (salesRes.data ?? []).slice(0, 5),
          top_products: top,
        });
      }
      case 'list_content': {
        let query = db()
          .from('content')
          .select('id,platform,format,title,status,scheduled_at,published_at,error,products:product_id(title)')
          .order('created_at', { ascending: false })
          .limit(Math.min(Number(args.limit ?? 15) || 15, 50));
        if (args.status) query = query.eq('status', String(args.status));
        const { data } = await query;
        return JSON.stringify({ posts: data ?? [] });
      }
      case 'record_sale': {
        const value = Number(args.value ?? 0);
        if (!value) throw new Error('value required');
        const { error } = await db().from('events').insert({
          kind: 'sale',
          product_id: (args.product_id as string | undefined) ?? null,
          value,
          currency: String(args.currency ?? 'USD'),
          source: 'manual',
          meta: { note: args.note ?? null },
        });
        if (error) throw new Error(error.message);
        return JSON.stringify({ recorded: true, value });
      }
      case 'get_autopilot': {
        return JSON.stringify(await getAutopilot());
      }
      case 'set_autopilot': {
        const current = await getAutopilot();
        const next: AutopilotSettings = {
          enabled: typeof args.enabled === 'boolean' ? args.enabled : current.enabled,
          dailyPerPlatform:
            typeof args.dailyPerPlatform === 'number'
              ? Math.max(0, Math.min(6, args.dailyPerPlatform))
              : current.dailyPerPlatform,
          times: Array.isArray(args.times) && args.times.length
            ? (args.times as string[]).slice(0, 6)
            : current.times,
          brandVoice: typeof args.brandVoice === 'string' && args.brandVoice ? args.brandVoice : current.brandVoice,
        };
        await setSetting('autopilot', next);
        return JSON.stringify({ updated: next });
      }
      case 'run_scheduler_now': {
        const result = await tick();
        return JSON.stringify(result);
      }
      default:
        return JSON.stringify({ error: `unknown tool ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}

export interface AgentResponse {
  reply: string;
  toolTrace: { name: string; ok: boolean }[];
  provider: string;
}

export async function runAgent(userMessage: string, history: { role: 'user' | 'assistant'; content: string }[]): Promise<AgentResponse> {
  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content }) as AIMessage),
    { role: 'user', content: userMessage },
  ];

  const trace: { name: string; ok: boolean }[] = [];
  let provider = 'error';

  for (let round = 0; round < 6; round++) {
    const res = await chat({ messages, tools: TOOLS, temperature: 0.4 });
    provider = res.provider;

    if (res.toolCalls?.length) {
      for (const call of res.toolCalls) {
        const resultJson = await executeTool(call.name, call.args);
        trace.push({ name: call.name, ok: !resultJson.includes('"error"') });
        messages.push({ role: 'assistant', content: null, toolCalls: [call] } as AIMessage);
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: resultJson,
        });
      }
      continue;
    }

    const reply = res.text?.trim() || "I couldn't generate a reply — try again.";
    return { reply, toolTrace: trace, provider };
  }

  return {
    reply: "I hit my action limit for this request — try again and I'll continue.",
    toolTrace: trace,
    provider,
  };
}

export { TOOLS as AGENT_TOOLS, executeTool as runToolByName };
