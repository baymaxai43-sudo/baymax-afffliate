'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, EmptyState, Modal } from '@/components/ui';
import { Icon } from '@/components/icons';

interface Post {
  id: string;
  platform: 'tiktok' | 'youtube';
  format: string;
  title: string;
  body: string;
  hashtags: string[];
  status: string;
  scheduled_at?: string | null;
  published_at?: string | null;
  external_url?: string | null;
  error?: string | null;
  products?: { id: string; title: string; image_url?: string | null } | null;
}

interface Product {
  id: string;
  title: string;
}

const TABS = ['all', 'draft', 'scheduled', 'published', 'failed'] as const;

export default function ContentPage() {
  return (
    <AppShell title="Content">
      <ContentBody />
    </AppShell>
  );
}

function ContentBody() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('all');
  const [genOpen, setGenOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(['tiktok', 'youtube']);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Post | null>(null);
  const [toast, setToast] = useState('');

  async function load() {
    try {
      const r = await api<{ content: Post[] }>(`/content${tab !== 'all' ? `?status=${tab}` : ''}`);
      setPosts(r.content);
    } catch {
      setPosts([]);
    }
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('status');
    if (requested && TABS.includes(requested as (typeof TABS)[number])) {
      setTab(requested as (typeof TABS)[number]);
    }
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function openGenerate() {
    setGenOpen(true);
    try {
      const r = await api<{ products: Product[] }>('/products');
      setProducts(r.products);
    } catch {
      setProducts([]);
    }
  }

  async function generate(schedule: boolean) {
    if (!selected.length) return;
    setBusy(true);
    try {
      const r = await api<{ count: number }>('/content/generate', {
        body: {
          product_ids: selected,
          platforms: platforms.length ? platforms : undefined,
          count: 1,
          schedule,
        },
      });
      setGenOpen(false);
      setSelected([]);
      setToast(schedule ? `Scheduled ${r.count} post(s) 🎉` : `Created ${r.count} draft post(s) ✍️`);
      setTimeout(() => setToast(''), 3000);
      setTab(schedule ? 'scheduled' : 'draft');
      await load();
    } catch (e: any) {
      alert(e?.message ?? 'Generation failed');
    } finally {
      setBusy(false);
    }
  }

  async function schedule(p: Post) {
    try {
      await api(`/content/${p.id}/schedule`, { method: 'POST', body: {} });
      await load();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  async function publishNow(p: Post) {
    setBusy(true);
    try {
      await api(`/content/${p.id}/publish`, { method: 'POST' });
      setToast('Published! 🚀');
      setTimeout(() => setToast(''), 2500);
      await load();
    } catch (e: any) {
      alert(e?.message ?? 'Publish failed');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(p: Post) {
    try {
      await api(`/content/${p.id}/regenerate`, { method: 'POST' });
      await load();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    }
  }

  async function remove(p: Post) {
    if (!confirm('Delete this post?')) return;
    await api(`/content/${p.id}`, { method: 'DELETE' });
    await load();
  }

  const counts: Record<string, number> = {};
  (posts ?? []).forEach((p) => (counts[p.status] = (counts[p.status] ?? 0) + 1));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs font-bold px-3.5 py-2 rounded-full transition capitalize ${
              tab === t ? 'bg-navy text-white shadow-md' : 'bg-white text-navy/55 border border-navy/10 hover:border-navy/30'
            }`}
          >
            {t}
            {t !== 'all' && counts[t] ? ` · ${counts[t]}` : ''}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={load}>
            <Icon name="refresh" className="w-4 h-4" /> Refresh
          </Button>
          <Button variant="sky" size="sm" onClick={openGenerate}>
            <Icon name="sparkles" className="w-4 h-4" /> Generate content
          </Button>
        </div>
      </div>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-navy text-white text-sm font-semibold px-5 py-3 rounded-full shadow-2xl fade-up">
          {toast}
        </div>
      )}

      {posts === null ? (
        <div className="text-center py-16 text-navy/40 text-sm">Loading…</div>
      ) : posts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="sparkles" />}
            title={tab === 'all' ? 'No content yet' : `No ${tab} posts`}
            hint="Generate TikTok & YouTube posts from your products — Baymax writes hooks, scripts, hashtags and schedules them."
            action={
              <Button variant="sky" onClick={openGenerate}>
                Generate content
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Card key={p.id} className="p-4 flex flex-wrap items-center gap-3 hover:shadow-md transition">
              <div className="w-10 h-10 rounded-xl bg-sky-deep/10 text-sky-deep flex items-center justify-center shrink-0 text-lg">
                {p.platform === 'tiktok' ? '🎵' : '▶️'}
              </div>
              <div className="min-w-0 flex-1 basis-52">
                <p className="font-bold text-navy text-sm truncate">{p.title}</p>
                <p className="text-xs text-navy/45 truncate">
                  {p.products?.title ?? '—'} · {p.format.replace('_', ' ')}
                  {p.scheduled_at && p.status === 'scheduled' && (
                    <> · {new Date(p.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                  )}
                </p>
                {p.error && <p className="text-xs text-danger mt-0.5 truncate">{p.error}</p>}
              </div>
              <Badge
                tone={
                  p.status === 'published' ? 'green' : p.status === 'scheduled' ? 'amber' : p.status === 'failed' ? 'red' : 'gray'
                }
              >
                {p.status}
              </Badge>
              <div className="flex gap-1.5 ml-auto">
                <Button size="sm" variant="outline" onClick={() => setViewing(p)}>
                  <Icon name="eye" className="w-3.5 h-3.5" /> View
                </Button>
                {p.status === 'draft' && (
                  <Button size="sm" variant="ghost" onClick={() => schedule(p)}>
                    <Icon name="calendar" className="w-3.5 h-3.5" /> Schedule
                  </Button>
                )}
                {(p.status === 'draft' || p.status === 'failed' || p.status === 'scheduled') && (
                  <Button size="sm" variant="sky" onClick={() => publishNow(p)} disabled={busy}>
                    <Icon name="play" className="w-3.5 h-3.5" /> Publish
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => regenerate(p)} title="Regenerate">
                  <Icon name="refresh" className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove(p)} title="Delete">
                  <Icon name="trash" className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Generate modal */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate content with AI">
        {products.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-navy/55 mb-4">Add a product first — then I can write posts for it.</p>
            <Button variant="ghost" onClick={() => setGenOpen(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-navy/70 uppercase tracking-wide mb-2">Products</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {products.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-navy/10 hover:border-sky-deep/40 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={(e) =>
                        setSelected(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))
                      }
                      className="accent-sky-deep w-4 h-4"
                    />
                    <span className="truncate text-navy/80 font-medium">{p.title}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-navy/70 uppercase tracking-wide mb-2">Platforms</label>
              <div className="flex gap-2">
                {['tiktok', 'youtube'].map((pl) => (
                  <button
                    key={pl}
                    onClick={() =>
                      setPlatforms(platforms.includes(pl) ? platforms.filter((x) => x !== pl) : [...platforms, pl])
                    }
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold capitalize border transition ${
                      platforms.includes(pl)
                        ? 'bg-sky-deep text-white border-sky-deep shadow-lg shadow-sky-deep/20'
                        : 'bg-white text-navy/50 border-navy/10'
                    }`}
                  >
                    {pl === 'tiktok' ? '🎵 ' : '▶️ '}
                    {pl}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => generate(false)} disabled={busy || !selected.length}>
                {busy ? 'Writing…' : 'Save as draft'}
              </Button>
              <Button variant="sky" className="flex-1" onClick={() => generate(true)} disabled={busy || !selected.length}>
                {busy ? 'Writing…' : '⚡ Generate & schedule'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* View modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.title ?? ''} width="max-w-xl">
        {viewing && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge tone="blue">{viewing.platform}</Badge>
              <Badge>{viewing.format.replace('_', ' ')}</Badge>
              {viewing.external_url && (
                <a
                  href={viewing.external_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-sky-deep hover:underline inline-flex items-center gap-1"
                >
                  View live <Icon name="external" className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="bg-cloud rounded-xl p-4 text-sm leading-relaxed text-navy/80 whitespace-pre-wrap max-h-72 overflow-y-auto">
              {viewing.body}
            </div>
            {viewing.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {viewing.hashtags.map((h) => (
                  <span key={h} className="text-xs font-semibold text-sky-deep bg-sky-deep/10 px-2 py-1 rounded-full">
                    #{h}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
