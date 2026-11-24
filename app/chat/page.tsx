'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui';
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

    // Poll tool activity while waiting (the agent works server-side)
    let dots = 0;
    pollRef.current = setInterval(() => {
      dots = (dots + 1) % 4;
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

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      {/* chat header */}
      <div className="flex items-center gap-3 pb-4">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Baymax" className="w-10 h-10 rounded-xl shadow-md" />
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-cloud" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-navy leading-tight">Baymax</div>
          <div className="text-xs text-navy/45">
            {provider ? `${provider} · autonomous copilot` : 'your affiliate copilot'}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {provider === 'demo' && (
            <span className="text-[11px] font-bold text-warn bg-warn/10 px-2 py-1 rounded-full">DEMO MODE</span>
          )}
          <Button variant="ghost" size="sm" onClick={clearChat} title="Clear chat">
            <Icon name="trash" className="w-4 h-4" /> Clear
          </Button>
        </div>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto chat-scroll pr-1 space-y-5">
        {empty && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascot.png" alt="" className="w-16 h-16 mb-4 drop-shadow-lg" />
            <h2 className="text-xl font-extrabold text-navy tracking-tight">What should we do next?</h2>
            <p className="text-sm text-navy/50 mt-1 mb-6 max-w-sm">
              I can write posts, schedule them, track clicks and sales — just ask.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs font-semibold text-navy/70 bg-white border border-navy/10 hover:border-sky-deep hover:text-sky-deep px-3.5 py-2 rounded-full transition shadow-sm"
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg shadow-sm mt-0.5" />
            <div className="bg-white border border-navy/5 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1.5 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-deep dot" />
                <span className="w-1.5 h-1.5 rounded-full bg-sky-deep dot" />
                <span className="w-1.5 h-1.5 rounded-full bg-sky-deep dot" />
                <span className="text-xs text-navy/40 font-medium ml-1">Baymax is working…</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center text-xs text-danger font-semibold bg-danger/5 rounded-lg px-3 py-2">{error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <div className="pt-4">
        <div className="flex items-center gap-2 bg-white border border-navy/10 rounded-full px-2 py-1.5 shadow-[0_4px_20px_rgba(11,22,51,.08)] focus-within:border-sky-deep/60 focus-within:ring-2 focus-within:ring-sky-deep/15 transition">
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
            className="w-10 h-10 rounded-full bg-navy text-white flex items-center justify-center hover:bg-navy-2 transition disabled:opacity-30 shrink-0"
            aria-label="Send"
          >
            <Icon name="send" className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-navy/35 text-center mt-2">
          Baymax-Shoppey can take real actions in your store · full autopilot
        </p>
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
        <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg shadow-sm mt-0.5 shrink-0" />
      )}
      <div className={`max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={
            isUser
              ? 'bg-navy text-white rounded-2xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-md shadow-navy/10 inline-block text-left'
              : 'bg-white border border-navy/5 rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm inline-block'
          }
        >
          {m.content}
        </div>
        {tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tools.map((t, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${
                  t.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
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
