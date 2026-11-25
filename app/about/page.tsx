'use client';

import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui';

export default function AboutPage() {
  return (
    <AppShell title="About Baymax">
      <div className="mx-auto max-w-3xl space-y-5">
        <Card className="overflow-hidden">
          <div className="relative bg-gradient-to-br from-[#b9d5f2] via-[#d8e9fa] to-[#eef5fc] px-7 py-10 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/baymax-hero.png" alt="Baymax" className="mx-auto h-36 w-auto drop-shadow-xl" />
            <p className="mt-4 text-[10px] font-extrabold tracking-[.2em] text-[#6389b2]">YOUR AFFILIATE INTELLIGENCE</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#18365e]">Meet Baymax</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#5a7899]">A friendly AI workspace for product discovery, affiliate operations and marketing execution.</p>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {[
              ['Discover', 'Organize products and affiliate offers.'],
              ['Create', 'Plan and prepare promotional content.'],
              ['Grow', 'Understand clicks, sales and performance.'],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl bg-[#edf4fc] p-4">
                <h2 className="text-sm font-extrabold text-[#244a75]">{title}</h2>
                <p className="mt-1 text-xs leading-5 text-[#6b83a0]">{description}</p>
              </div>
            ))}
          </div>
        </Card>
        <div className="flex justify-center">
          <Link href="/dashboard" className="rounded-full border border-white/80 bg-white/65 px-5 py-2.5 text-xs font-bold text-[#416b9c] shadow-sm hover:bg-white">Back to Home</Link>
        </div>
      </div>
    </AppShell>
  );
}
