'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, Input } from '@/components/ui';
import { Icon } from '@/components/icons';

interface Summary {
  products: number;
  scheduled: number;
  published: number;
  clicks7d: number;
  sales7d: number;
  revenue7d: number;
}
interface Point {
  day: string;
  clicks: number;
  sales: number;
}

export default function AnalyticsPage() {
  return (
    <AppShell title="Analytics" back="/profile">
      <AnalyticsBody />
    </AppShell>
  );
}

function AnalyticsBody() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<Point[]>([]);
  const [top, setTop] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [saleForm, setSaleForm] = useState({ value: '', note: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [s, t, tp, sl] = await Promise.all([
        api<Summary>('/analytics/summary'),
        api<{ series: Point[] }>('/analytics/timeseries?days=14'),
        api<{ top: any[] }>('/analytics/top-products'),
        api<{ sales: any[] }>('/analytics/sales'),
      ]);
      setSummary(s);
      setSeries(t.series);
      setTop(tp.top);
      setSales(sl.sales);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function recordSale() {
    const value = Number(saleForm.value);
    if (!value) return;
    setBusy(true);
    try {
      await api('/analytics/sales', { body: { value, note: saleForm.note || undefined } });
      setSaleForm({ value: '', note: '' });
      await load();
    } catch (e: any) {
      alert(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const maxClicks = Math.max(1, ...series.map((p) => p.clicks));

  return (
    <div className="space-y-6">
      {/* stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Clicks (7d)', value: summary?.clicks7d ?? '—', icon: 'eye', tone: 'text-sky-deep bg-sky-deep/10' },
          { label: 'Sales (7d)', value: summary?.sales7d ?? '—', icon: 'zap', tone: 'text-success bg-success/10' },
          { label: 'Revenue (7d)', value: summary ? `$${summary.revenue7d.toFixed(2)}` : '—', icon: 'chart', tone: 'text-navy bg-navy/5' },
          { label: 'Published posts', value: summary?.published ?? '—', icon: 'check', tone: 'text-warn bg-warn/10' },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${c.tone}`}>
              <Icon name={c.icon} className="w-[18px] h-[18px]" />
            </div>
            <div className="text-2xl font-extrabold text-navy tracking-tight">{c.value}</div>
            <div className="text-xs font-semibold text-navy/45 mt-0.5">{c.label}</div>
          </Card>
        ))}
      </div>

      {/* chart */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-navy">Clicks — last 14 days</h2>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-navy/50">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-deep" /> clicks
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-success" /> sales
            </span>
          </div>
        </div>
        <div className="flex items-end gap-1.5 h-40">
          {series.map((p) => (
            <div key={p.day} className="flex-1 flex flex-col items-center gap-1 group relative min-w-0">
              <div className="text-[9px] font-bold text-navy/0 group-hover:text-navy/70 transition absolute -top-4">
                {p.clicks}
              </div>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-sky-deep to-sky transition-all min-h-[3px]"
                style={{ height: `${(p.clicks / maxClicks) * 100}%` }}
              />
              <div
                className="w-full rounded-b-sm bg-success/80"
                style={{ height: `${Math.max(p.sales ? 6 : 0, (p.sales / maxClicks) * 100)}px` }}
              />
              <span className="text-[9px] text-navy/35 font-medium hidden sm:block">
                {p.day.slice(8)}/{p.day.slice(5, 7)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* top products */}
        <Card>
          <div className="px-5 py-4 border-b border-navy/5">
            <h2 className="font-bold text-navy">Top products (30d)</h2>
          </div>
          {top.length === 0 ? (
            <p className="px-5 py-8 text-sm text-navy/45 text-center">No clicks tracked yet — share your short links!</p>
          ) : (
            <ul className="divide-y divide-navy/5">
              {top.map((p) => (
                <li key={p.id} className="px-5 py-3.5 flex items-center gap-3">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" className="w-9 h-9 rounded-lg object-cover bg-sky/20" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-sky-deep/10 flex items-center justify-center">
                      <Icon name="box" className="w-4 h-4 text-sky-deep" />
                    </div>
                  )}
                  <span className="text-sm font-semibold text-navy truncate flex-1">{p.title}</span>
                  <Badge tone="blue">{p.clicks} clicks</Badge>
                  {p.sales > 0 && <Badge tone="green">{p.sales} sales</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* sales */}
        <Card>
          <div className="px-5 py-4 border-b border-navy/5 flex items-center justify-between">
            <h2 className="font-bold text-navy">Record a sale</h2>
            <span className="text-[11px] text-navy/40">from your affiliate dashboard</span>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy/40 font-bold text-sm">$</span>
                <Input
                  value={saleForm.value}
                  onChange={(v) => setSaleForm({ ...saleForm, value: v.replace(/[^0-9.]/g, '') })}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
              <Button variant="sky" onClick={recordSale} disabled={busy || !saleForm.value}>
                Record
              </Button>
            </div>
            <Input
              value={saleForm.note}
              onChange={(v) => setSaleForm({ ...saleForm, note: v })}
              placeholder="Note (optional) — e.g. order #12345"
            />
            <div className="max-h-52 overflow-y-auto space-y-2">
              {sales.length === 0 ? (
                <p className="text-xs text-navy/40 text-center py-4">No sales recorded yet.</p>
              ) : (
                sales.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 bg-success/5 rounded-xl px-3.5 py-2.5">
                    <span className="text-sm font-extrabold text-success">
                      +${Number(s.value).toFixed(2)}
                    </span>
                    <span className="text-xs text-navy/55 truncate flex-1">
                      {s.products?.title ?? s.meta?.note ?? 'manual sale'}
                    </span>
                    <span className="text-[10px] text-navy/35 shrink-0">
                      {new Date(s.occurred_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
