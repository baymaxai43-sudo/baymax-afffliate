'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from './ui';
import { Icon } from './icons';

const STEPS = [
  {
    icon: 'zap',
    title: 'Welcome aboard! 👋',
    text: "I'm Baymax, your autonomous affiliate copilot. I run this private store end-to-end: content, posting, tracking.",
  },
  {
    icon: 'box',
    title: 'Drop in AliExpress links',
    text: 'Paste a product link in Products and I pull the title, price and photo automatically — then build promo content around it.',
  },
  {
    icon: 'sparkles',
    title: 'Content on autopilot',
    text: 'I generate TikTok & YouTube posts, schedule them at your best posting times, and publish without you lifting a finger.',
  },
  {
    icon: 'chat',
    title: 'Just talk to me',
    text: 'Ask anything in Chat — "promote my cheapest product", "how did clicks go?", "record a $12 sale" — and I’ll do it.',
  },
  {
    icon: 'chart',
    title: 'Everything tracked',
    text: 'Short links log every click, sales get recorded, and Analytics shows what’s actually making money.',
  },
];

export function Tour({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  async function finish() {
    setLeaving(true);
    try {
      await api('/auth/tour', { method: 'POST' });
    } catch {
      /* ignore */
    }
    onDone?.();
    if (last) router.push('/chat');
  }

  function next() {
    if (last) finish();
    else setStep((n) => n + 1);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-navy/50 backdrop-blur-sm">
      <div
        className={`bx-modal rounded-3xl shadow-2xl w-full max-w-md p-7 text-center transition-all ${
          leaving ? 'opacity-0 scale-95' : 'fade-up'
        }`}
      >
        <div className="relative inline-block mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/baymax-hero.png" alt="Baymax" className="h-24 w-auto mx-auto drop-shadow-lg" />
          <span className="absolute -right-1 -top-1 w-7 h-7 rounded-full bg-sky-deep text-white flex items-center justify-center text-sm font-bold shadow-lg">
            {step + 1}
          </span>
        </div>

        <div className="w-10 h-10 rounded-xl bg-sky-deep/10 text-sky-deep flex items-center justify-center mx-auto mb-3">
          <Icon name={s.icon} />
        </div>

        <h2 className="text-xl font-extrabold text-navy tracking-tight">{s.title}</h2>
        <p className="text-sm text-navy/60 mt-2 leading-relaxed min-h-[64px]">{s.text}</p>

        <div className="flex items-center justify-center gap-1.5 my-5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-sky-deep' : 'w-1.5 bg-navy/15'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={finish}>
            Skip tour
          </Button>
          <Button className="flex-1" onClick={next}>
            {last ? "Let's go 🚀" : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
