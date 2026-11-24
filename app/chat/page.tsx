'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/icons';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  meta?: { toolTrace?: { name: string; ok: boolean }[]; provider?: string };
}

const SUGGESTIONS = [
  'Promote my newest product on TikTok',
  'How are clicks looking this week?',
  'Generate 2 YouTube posts for my best product',
  'Record a $15 sale',
  'Is autopilot on?',
];

const TOOL_LABELS: Record<string, string> = {
  list_products: 'Reading products',
  add_product: 'Adding product',
  generate_content: 'Writing posts',
  get_analytics: 'Checking analytics',
  list_content: 'Reviewing content',
  record_sale: 'Recording sale',
  get_autopilot: 'Reading autopilot',
  set_autopilot: 'Updating autopilot',
  run_scheduler_now: 'Running scheduler',
};

/** Autonomous agent pipeline shown while a reply is being produced. */
const AGENT_STEPS = ['Understanding', 'Planning', 'Acting', 'Replying'];

export default function ChatPage() {
  return (
    <AppShell title="Chat">
      <ChatBody />
    </AppShell>
  );
}

function ChatBody() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState<{ tools: string[] } | null>(null);
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<string>('');
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api<{ messages: Msg[] }>('/chat/messages').then((r) => {
      setMessages(r.messages);
      const lastAssistant = [...r.messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant?.meta?.provider) setProvider(lastAssistant.meta.provider);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  // Advance the autonomous pipeline while the agent works server-side
  useEffect(() => {
    if (!thinking) {
      setStep(0);
      return;
    }
    const id = setInterval(() => {
      setStep((s) => Math.min(s + 1, AGENT_STEPS.length - 1));
    }, 1400);
    return () => clearInterval(id);
  }, [thinking]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || thinking) return;
    setError('');
    setInput('');
    const optimistic: Msg = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setThinking({ tools: [] });
    setStep(0);

    // Poll tool activity while waiting (the agent works server-side)
    pollRef.current = setInterval(() => {
      setThinking({ tools: [] });
    }, 800);

    try {
      const res = await api<{ reply: string; toolTrace: { name: string; ok: boolean }[]; provider: string }>(
        '/chat',
        { body: { message } }
      );
      setProvider(res.provider);
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.reply,
          created_at: new Date().toISOString(),
          meta: { toolTrace: res.toolTrace, provider: res.provider },
        },
      ]);
    } catch (e: any) {
      setError(e?.message ?? 'Message failed');
    } finally {
      if (pollRef.current) clearInterval(pollRef.current);
      setThinking(null);
    }
  }

  async function clearChat() {
    try {
      await api('/chat/messages', { method: 'DELETE' });
      setMessages([]);
    } catch {
      /* ignore */
    }
  }

  const empty = messages.length === 0 && !thinking;
  const liveProvider = provider === 'gemini' || provider === 'groq';

  return (
    <div className="relative h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      {/* ambient glass backdrop */}
      <div className="ambient" aria-hidden="true">
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>

      <div className="relative z-10 flex flex-col h-full glass rounded-3xl px-4 py-4 md:px-6">
        {/* ── agent header ── */}
        <div className="flex items-center gap-3 pb-4 border-b border-white/60">
          <span className={`shrink-0 ${thinking ? 'halo' : ''}`}>
            <span className="block relative rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/baymax-icon.png" alt="Baymax" className="w-10 h-10 rounded-xl shadow-md bg-white" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-white/80" />
            </span>
          </span>
          <div className="min-w-0">
            <div className="font-extrabold text-navy leading-tight tracking-tight">Baymax</div>
            <div className="text-xs text-navy/50 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              {thinking
                ? 'agent working autonomously'
                : liveProvider
                  ? `${provider} · autonomous copilot`
                  : 'autonomous copilot'}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {liveProvider && (
              <span className="glass-soft hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-navy/70 uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-deep" />
                {provider}
              </span>
            )}
            <button
              onClick={clearChat}
              title="Clear chat"
              className="glass-soft inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-navy/60 hover:text-navy transition"
            >
              <Icon name="trash" className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>

        {/* ── messages ── */}
        <div className="flex-1 overflow-y-auto chat-scroll pr-1 space-y-5 py-5">
          {empty && (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="relative mb-5">
                <span className="absolute inset-0 rounded-full bg-sky/40 blur-2xl scale-125" aria-hidden="true" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/baymax-hero.png" alt="" className="relative h-24 w-auto drop-shadow-lg" />
              </div>
              <div className="glass-soft rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-deep mb-4">
                system online · ready to act
              </div>
              <h2 className="text-xl font-extrabold text-navy tracking-tight">What should we do next?</h2>
              <p className="text-sm text-navy/50 mt-1 mb-6 max-w-sm">
                I can write posts, schedule them, track clicks and sales — just ask.
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="glass-soft text-xs font-semibold text-navy/70 hover:text-sky-deep hover:border-sky-deep/40 hover:-translate-y-0.5 px-3.5 py-2 rounded-full transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}

          {thinking && (
            <div className="flex items-start gap-3 fade-up">
              <span className="halo shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/baymax-icon.png" alt="" className="w-8 h-8 rounded-lg shadow-sm mt-0.5 bg-white" />
              </span>
              <div className="glass-soft sweep rounded-2xl rounded-tl-md px-4 py-3 max-w-[85%]">
                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                  {AGENT_STEPS.map((s, i) => (
                    <span
                      key={s}
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-all ${
                        i < step
                          ? 'bg-sky-deep/15 text-sky-deep'
                          : i === step
                            ? 'bg-white text-navy shadow-sm ring-1 ring-sky-deep/40 animate-pulse'
                            : 'bg-navy/5 text-navy/35'
                      }`}
                    >
                      {i < step ? '✓ ' : ''}
                      {s}
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-deep dot" />
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-deep dot" />
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-deep dot" />
                  <span className="text-xs text-navy/45 font-medium ml-1">Baymax is on it…</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="glass-soft text-center text-xs text-danger font-semibold rounded-xl px-3 py-2 mx-auto w-fit">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── composer ── */}
        <div className="pt-1">
          <div className="glass flex items-center gap-2 rounded-full px-2 py-1.5 focus-within:border-sky-deep/50 focus-within:ring-2 focus-within:ring-sky-deep/15 transition">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask Baymax to promote, schedule, track…"
              className="flex-1 bg-transparent px-4 py-2 text-sm text-ink placeholder:text-navy/35 outline-none min-w-0"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || Boolean(thinking)}
              className="btn-send w-10 h-10 rounded-full text-white flex items-center justify-center disabled:opacity-30 shrink-0"
              aria-label="Send"
            >
              <Icon name="send" className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-navy/40 text-center mt-2 flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Baymax-Shoppey takes real actions in your store · full autopilot
          </p>
        </div>
      </div>
    </div>
  );
}

function Message({ m }: { m: Msg }) {
  const isUser = m.role === 'user';
  const tools = m.meta?.toolTrace ?? [];
  return (
    <div className={`flex gap-3 fade-up ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/baymax-icon.png" alt="" className="w-8 h-8 rounded-lg shadow-sm mt-0.5 shrink-0 bg-white" />
      )}
      <div className={`max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={
            isUser
              ? 'bubble-user text-white rounded-2xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap inline-block text-left'
              : 'glass rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap inline-block'
          }
        >
          {m.content}
        </div>
        {tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tools.map((t, i) => (
              <span
                key={i}
                className={`glass-soft inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${
                  t.ok ? 'text-success' : 'text-danger'
                }`}
              >
                <Icon name={t.ok ? 'check' : 'x'} className="w-3 h-3" />
                {TOOL_LABELS[t.name] ?? t.name}
              </span>
            ))}
          </div>
        )}
        <div className="text-[10px] text-navy/30 mt-1 px-1">
          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
