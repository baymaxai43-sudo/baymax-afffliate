'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, EmptyState, Modal } from '@/components/ui';
import { Icon } from '@/components/icons';

type Step = 'captions' | 'caption_check' | 'image' | 'video' | 'video_poll' | 'done';
type Status = 'queued' | 'running' | 'review' | 'approved' | 'failed';
interface Caption { title: string; body: string; hashtags: string[] }
interface Job {
  id: string;
  status: Status;
  step: Step;
  captions: { tiktok: Caption; youtube: Caption } | null;
  quality: { score: number; issues: string[]; rewrites: number } | null;
  image_url: string | null;
  video_url: string | null;
  error: string | null;
  attempts: number;
  auto: boolean;
  meta: { videoProgress?: number; contentIds?: string[] };
  created_at: string;
  products?: { id: string; title: string; image_url?: string | null } | null;
}
interface StudioStatus { captions: string; image: string | null; video: string | null; ready: boolean }
interface Product { id: string; title: string; image_url?: string | null; status: string }

const STAGES: { key: string; label: string; steps: Step[] }[] = [
  { key: 'captions', label: 'Captions', steps: ['captions'] },
  { key: 'check', label: 'Check', steps: ['caption_check'] },
  { key: 'image', label: 'Image', steps: ['image'] },
  { key: 'video', label: 'Video', steps: ['video', 'video_poll'] },
  { key: 'ready', label: 'Ready', steps: ['done'] },
];
/** "groq (openai/gpt-oss-120b)" → "Groq" (full id stays in the tooltip). */
const engine = (label?: string | null) => {
  if (label === undefined) return '…';
  if (!label || label === 'unavailable') return 'Not set';
  const name = label.split(' ')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
};
const stageIndex = (step: Step) => STAGES.findIndex((s) => s.steps.includes(step));

export default function StudioPage() {
  return (
    <AppShell title="Studio" back="/products">
      <StudioBody />
    </AppShell>
  );
}

function StudioBody() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [picker, setPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ jobs: Job[] }>('/studio/jobs');
      setJobs(r.jobs);
    } catch {
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    load();
    api<StudioStatus>('/studio/status').then(setStatus).catch(() => {});
  }, [load]);

  // Live progress while anything is still working
  const active = useMemo(() => (jobs ?? []).some((j) => j.status === 'queued' || j.status === 'running'), [jobs]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [active, load]);

  return (
    <div className="space-y-5 bx-studio">
      <div className="flex flex-wrap items-center gap-3">
        <div className="bx-engines" aria-label="Engines">
          <span title={status?.captions}><Icon name="file" className="w-3.5 h-3.5" /> Captions · {engine(status?.captions)}</span>
          <span title={status?.image ?? undefined}><Icon name="camera" className="w-3.5 h-3.5" /> Image · {status ? engine(status.image) : '…'}</span>
          <span title={status?.video ?? undefined}><Icon name="play" className="w-3.5 h-3.5" /> Video · {status ? engine(status.video) : '…'}</span>
        </div>
        <Button variant="sky" className="ml-auto" onClick={() => setPicker(true)} disabled={status ? !status.ready : false}>
          <Icon name="sparkles" className="w-4 h-4" /> New video
        </Button>
      </div>

      {status && !status.ready && (
        <p className="bx-studio-warn">
          Add <code>AGNES_API_KEY</code> on the backend to turn on image and video generation.
        </p>
      )}

      {jobs === null ? (
        <div className="text-center py-16 text-navy/40 text-sm">Loading…</div>
      ) : jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="sparkles" />}
            title="No videos yet"
            hint="Pick a product and Baymax writes the captions, checks them, makes an ad image and turns it into a vertical video."
            action={<Button variant="sky" onClick={() => setPicker(true)}>Make your first video</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} onChange={load} />
          ))}
        </div>
      )}

      <ProductPicker open={picker} onClose={() => setPicker(false)} onStarted={() => { setPicker(false); load(); }} />
    </div>
  );
}

function StageTracker({ job }: { job: Job }) {
  const current = stageIndex(job.step);
  return (
    <ol className="bx-stages">
      {STAGES.map((s, i) => {
        const done = i < current || (job.step === 'done' && i === current);
        const now = i === current && job.step !== 'done';
        const failed = now && job.status === 'failed';
        return (
          <li key={s.key} className={done ? 'is-done' : failed ? 'is-failed' : now ? 'is-now' : ''}>
            <span className="bx-stage-dot">{done ? <Icon name="check" className="w-3 h-3" /> : i + 1}</span>
            <span className="bx-stage-label">
              {s.label}
              {now && s.key === 'video' && job.meta?.videoProgress ? ` ${job.meta.videoProgress}%` : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const STATUS_TONE: Record<Status, 'gray' | 'blue' | 'green' | 'amber' | 'red'> = {
  queued: 'gray',
  running: 'blue',
  review: 'amber',
  approved: 'green',
  failed: 'red',
};
const STATUS_LABEL: Record<Status, string> = {
  queued: 'Queued',
  running: 'Working',
  review: 'Ready to review',
  approved: 'Scheduled',
  failed: 'Failed',
};

function JobCard({ job, onChange }: { job: Job; onChange: () => void }) {
  const [tab, setTab] = useState<'tiktok' | 'youtube'>('tiktok');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Caption | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const caption = job.captions?.[tab];

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr('');
    try {
      await fn();
      onChange();
    } catch (e: any) {
      setErr(e?.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const approve = () => act(() => api(`/studio/jobs/${job.id}/approve`, { body: {} }));
  const retry = (from?: 'captions' | 'image' | 'video') => act(() => api(`/studio/jobs/${job.id}/retry`, { body: from ? { from } : {} }));
  const remove = () => {
    if (!confirm('Delete this video job?')) return;
    act(() => api(`/studio/jobs/${job.id}`, { method: 'DELETE' }));
  };
  const saveCaption = () =>
    act(async () => {
      if (!draft) return;
      await api(`/studio/jobs/${job.id}/captions`, {
        method: 'PATCH',
        body: { [tab]: { ...draft, hashtags: draft.hashtags } },
      });
      setEditing(false);
    });

  const canEdit = job.status === 'review';

  return (
    <Card className="bx-job">
      <div className="bx-job-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {job.products?.image_url ? <img src={job.products.image_url} alt="" className="bx-job-thumb" /> : <span className="bx-job-thumb" />}
        <div className="min-w-0">
          <h3>{job.products?.title ?? 'Deleted product'}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <Badge tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</Badge>
            {job.quality && <Badge tone={job.quality.score >= 7 ? 'green' : 'amber'}>Quality {job.quality.score}/10</Badge>}
            {job.auto && <Badge tone="blue">Autopilot</Badge>}
          </div>
        </div>
        <button type="button" className="bx-icon-btn ml-auto" onClick={remove} aria-label="Delete job" title="Delete" disabled={busy}>
          <Icon name="trash" className="w-4 h-4" />
        </button>
      </div>

      <StageTracker job={job} />

      {job.error && job.status !== 'approved' && (
        <p className={`bx-job-error ${job.status === 'failed' ? '' : 'is-soft'}`}>
          {job.status === 'failed' ? job.error : `Retrying: ${job.error}`}
        </p>
      )}

      {(job.video_url || job.image_url) && (
        <div className="bx-job-media">
          {job.video_url ? (
            <video src={job.video_url} poster={job.image_url ?? undefined} controls playsInline preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.image_url!} alt="Generated ad image" />
          )}
        </div>
      )}

      {job.captions && (
        <div className="bx-job-captions">
          <div className="bx-tabs" role="tablist">
            {(['tiktok', 'youtube'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? 'is-active' : ''}
                onClick={() => { setTab(t); setEditing(false); }}
              >
                {t === 'tiktok' ? 'TikTok' : 'YouTube'}
              </button>
            ))}
            {canEdit && !editing && (
              <button className="bx-tab-edit" onClick={() => { setDraft(caption ?? null); setEditing(true); }}>Edit</button>
            )}
          </div>
          {editing && draft ? (
            <div className="space-y-2">
              <input className="bx-cap-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <textarea className="bx-cap-input" rows={5} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              <input
                className="bx-cap-input"
                value={draft.hashtags.map((h) => `#${h}`).join(' ')}
                onChange={(e) => setDraft({ ...draft, hashtags: e.target.value.split(/\s+/).map((h) => h.replace(/^#/, '')).filter(Boolean) })}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={saveCaption} disabled={busy}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : caption ? (
            <div className="bx-cap">
              <strong>{caption.title}</strong>
              <p>{caption.body}</p>
              <span>{caption.hashtags.map((h) => `#${h}`).join(' ')}</span>
            </div>
          ) : null}
        </div>
      )}

      {err && <p className="bx-job-error">{err}</p>}

      <div className="bx-job-actions">
        {job.status === 'review' && (
          <>
            <Button variant="sky" onClick={approve} disabled={busy}>
              <Icon name="calendar" className="w-4 h-4" /> Approve &amp; schedule
            </Button>
            <Button variant="outline" size="sm" onClick={() => retry('video')} disabled={busy}>Redo video</Button>
            <Button variant="ghost" size="sm" onClick={() => retry('image')} disabled={busy}>Redo image</Button>
          </>
        )}
        {job.status === 'failed' && (
          <Button variant="sky" onClick={() => retry()} disabled={busy}>
            <Icon name="refresh" className="w-4 h-4" /> Retry
          </Button>
        )}
        {job.status === 'approved' && (
          <Link href="/content?status=scheduled" className="bx-job-link">
            Scheduled for TikTok and YouTube <Icon name="chevron-right" className="w-4 h-4" />
          </Link>
        )}
        {(job.status === 'queued' || job.status === 'running') && (
          <span className="bx-job-working"><span className="bx-pulse" /> Working in the background</span>
        )}
      </div>
    </Card>
  );
}

function ProductPicker({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    api<{ products: Product[] }>('/products?status=active')
      .then((r) => setProducts(r.products))
      .catch(() => setProducts([]));
  }, [open]);

  async function start(p: Product) {
    setBusy(p.id);
    setErr('');
    try {
      await api('/studio/jobs', { body: { product_id: p.id } });
      onStarted();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not start');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Make a video">
      {products === null ? (
        <p className="text-sm text-navy/50 py-6 text-center">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="text-sm text-navy/60 py-6 text-center">
          No products yet. <Link href="/products" className="underline">Add one from an AliExpress link</Link>.
        </p>
      ) : (
        <div className="bx-pick-list">
          {err && <p className="bx-job-error">{err}</p>}
          {products.map((p) => (
            <button key={p.id} type="button" className="bx-pick" onClick={() => start(p)} disabled={Boolean(busy) || !p.image_url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.image_url ? <img src={p.image_url} alt="" /> : <span className="bx-pick-empty"><Icon name="camera" className="w-4 h-4" /></span>}
              <span className="bx-pick-title">{p.title}</span>
              <span className="bx-pick-cta">{busy === p.id ? 'Starting…' : p.image_url ? 'Start' : 'Needs photo'}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
