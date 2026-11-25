'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, EmptyState, Input, Modal } from '@/components/ui';
import { Icon } from '@/components/icons';

interface Product {
  id: string;
  title: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  image_url?: string | null;
  affiliate_url: string;
  short_code?: string | null;
  status: string;
  created_at: string;
}

export default function ProductsPage() {
  return (
    <AppShell
      title="Products"
      back="/dashboard"
    >
      <ProductsBody />
    </AppShell>
  );
}

function ProductsBody() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ title: '', price: '', image_url: '', affiliate_url: '' });
  const [working, setWorking] = useState<string | null>(null);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const formFileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);

  async function uploadImage(file: File, productId?: string): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api<{ url: string }>(productId ? `/products/${productId}/image` : '/studio/upload', { body: fd });
      return r.url;
    } catch (e: any) {
      alert(e?.message ?? 'Upload failed');
      return null;
    }
  }

  function pickPhoto(p: Product) {
    uploadFor.current = p.id;
    fileRef.current?.click();
  }

  async function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const id = uploadFor.current;
    if (!file || !id) return;
    setWorking(id);
    await uploadImage(file, id);
    setWorking(null);
    await load();
  }

  async function onFormPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const url = await uploadImage(file);
    setBusy(false);
    if (url) setForm((f) => ({ ...f, image_url: url }));
  }

  async function makeVideo(p: Product) {
    setWorking(p.id);
    try {
      await api('/studio/jobs', { body: { product_id: p.id } });
      router.push('/studio');
    } catch (e: any) {
      alert(e?.message ?? 'Could not start the video');
      setWorking(null);
    }
  }

  async function load(search = q) {
    try {
      const r = await api<{ products: Product[] }>(`/products${search ? `?q=${encodeURIComponent(search)}` : ''}`);
      setProducts(r.products);
    } catch {
      setProducts([]);
    }
  }

  useEffect(() => {
    load();
    const handler = () => setOpen(true);
    window.addEventListener('open-add-product', handler);
    return () => window.removeEventListener('open-add-product', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFromUrl() {
    setBusy(true);
    setError('');
    try {
      await api('/products', { body: { url } });
      setUrl('');
      setOpen(false);
      setManual(false);
      await load();
    } catch (e: any) {
      if (String(e?.message ?? '').includes('manually')) {
        setManual(true);
      }
      setError(e?.message ?? 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function addManual() {
    setBusy(true);
    setError('');
    try {
      await api('/products', {
        body: {
          title: form.title,
          affiliate_url: form.affiliate_url,
          price: form.price ? Number(form.price) : undefined,
          image_url: form.image_url || undefined,
        },
      });
      setForm({ title: '', price: '', image_url: '', affiliate_url: '' });
      setOpen(false);
      setManual(false);
      setUrl('');
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p: Product) {
    await api(`/products/${p.id}`, { method: 'PATCH', body: { status: p.status === 'active' ? 'paused' : 'active' } });
    await load();
  }

  async function remove(p: Product) {
    if (!confirm(`Delete "${p.title}"?`)) return;
    await api(`/products/${p.id}`, { method: 'DELETE' });
    await load();
  }

  async function copyLink(p: Product) {
    if (!p.short_code) return;
    await navigator.clipboard.writeText(`${window.location.origin}/c/${p.short_code}`);
    alert('Trackable link copied!');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <Input value={q} onChange={(v) => { setQ(v); load(v); }} placeholder="Search products…" />
        </div>
        <span className="text-xs font-semibold text-navy/40">
          {products ? `${products.length} product${products.length === 1 ? '' : 's'}` : '…'}
        </span>
      </div>

      {products === null ? (
        <div className="text-center py-16 text-navy/40 text-sm">Loading…</div>
      ) : products.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="box" />}
            title="No products yet"
            hint="Paste an AliExpress affiliate link and I'll import the product and start building promo content for it."
          />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map((p) => (
            <Card key={p.id} className="overflow-hidden flex flex-col">
              <div className="h-40 bg-gradient-to-br from-sky/20 to-sky-deep/10 relative flex items-center justify-center overflow-hidden">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Icon name="box" className="w-10 h-10 text-sky-deep/40" />
                )}
                <span className="absolute top-2.5 left-2.5">
                  <Badge tone={p.status === 'active' ? 'green' : 'gray'}>{p.status}</Badge>
                </span>
                <button
                  type="button"
                  onClick={() => pickPhoto(p)}
                  className="bx-photo-btn"
                  aria-label={p.image_url ? 'Replace photo' : 'Upload photo'}
                  title={p.image_url ? 'Replace photo' : 'Upload photo'}
                  disabled={working === p.id}
                >
                  <Icon name="camera" className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-navy text-sm leading-snug line-clamp-2 min-h-[2.5rem]">{p.title}</h3>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className="text-lg font-extrabold text-sky-deep">
                    {p.price != null ? `${p.price} ${p.currency ?? ''}` : '—'}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="sky"
                  className="mt-3 w-full"
                  onClick={() => makeVideo(p)}
                  disabled={working === p.id || !p.image_url}
                  title={p.image_url ? 'Captions → image → video' : 'Add a photo first'}
                >
                  <Icon name="sparkles" className="w-3.5 h-3.5" /> {working === p.id ? 'Starting…' : 'Make video'}
                </Button>
                <div className="flex gap-2 mt-2">
                  {p.short_code && (
                    <Button size="sm" variant="outline" onClick={() => copyLink(p)}>
                      <Icon name="copy" className="w-3.5 h-3.5" /> Link
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => toggle(p)}>
                    {p.status === 'active' ? 'Pause' : 'Activate'}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(p)} className="ml-auto">
                    <Icon name="trash" className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhotoPicked} />
      <input ref={formFileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFormPhotoPicked} />

      <Modal open={open} onClose={() => { setOpen(false); setError(''); setManual(false); }} title="Add product">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-navy/70 mb-1.5">AliExpress affiliate link</label>
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={setUrl}
                placeholder="https://s.click.aliexpress.com/… or item link"
                onKeyDown={(e) => e.key === 'Enter' && addFromUrl()}
                autoFocus
              />
              <Button variant="sky" onClick={addFromUrl} disabled={busy || !url.trim()}>
                {busy ? 'Importing…' : 'Import'}
              </Button>
            </div>
            <p className="text-[11px] text-navy/40 mt-1.5">
              I’ll pull the title, price &amp; photo automatically, then you can generate content.
            </p>
          </div>

          {error && <p className="text-xs text-danger font-semibold bg-danger/5 rounded-lg px-3 py-2">{error}</p>}

          {manual && (
            <div className="border-t border-navy/5 pt-4 space-y-3">
              <p className="text-xs font-bold text-navy/70 uppercase tracking-wide">Add manually</p>
              <Input value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Product title *" />
              <div className="grid grid-cols-2 gap-3">
                <Input value={form.price} onChange={(v) => setForm({ ...form, price: v })} placeholder="Price (USD)" />
                <Input
                  value={form.affiliate_url}
                  onChange={(v) => setForm({ ...form, affiliate_url: v })}
                  placeholder="Affiliate link *"
                />
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  value={form.image_url}
                  onChange={(v) => setForm({ ...form, image_url: v })}
                  placeholder="Image URL, or upload a photo"
                />
                <Button variant="outline" onClick={() => formFileRef.current?.click()} disabled={busy}>
                  <Icon name="camera" className="w-4 h-4" /> Upload
                </Button>
              </div>
              {form.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.image_url} alt="" className="h-24 w-24 rounded-xl object-cover" />
              )}
              <Button variant="sky" className="w-full" onClick={addManual} disabled={busy || !form.title || !form.affiliate_url}>
                Save product
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
