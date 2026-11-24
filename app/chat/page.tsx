'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/icons';

interface Attachment {
  name: string;
  path: string;
  mime: string;
  size: number;
  url: string;
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  meta?: { toolTrace?: { name: string; ok: boolean }[]; provider?: string; attachments?: Attachment[] };
}

interface PendingFile {
  file: File;
  preview?: string;
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

const MAX_FILES = 6;
const MAX_SIZE = 15 * 1024 * 1024; // 15MB — matches backend limit

function ext(name: string): string {
  const m = name.match(/\.([a-z0-9]{1,6})$/i);
  return m ? m[1].toUpperCase() : 'FILE';
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(f: File): boolean {
  return f.type.startsWith('image/');
}

/** Attachment URLs from the backend are either absolute (Supabase) or root-relative (local mode behind /api). */
function resolveUrl(url: string): string {
  return url.startsWith('/') ? '/api' + url : url;
}

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
  const [thinking, setThinking] = useState<{ phase: 'upload' | 'agent' } | null>(null);
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<string>('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

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
    if (!thinking || thinking.phase !== 'agent') {
      setStep(0);
      return;
    }
    const id = setInterval(() => {
      setStep((s) => Math.min(s + 1, AGENT_STEPS.length - 1));
    }, 1400);
    return () => clearInterval(id);
  }, [thinking]);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    setError('');
    setPending((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= MAX_FILES) {
          setError(`Max ${MAX_FILES} files per message`);
          break;
        }
        if (file.size > MAX_SIZE) {
          setError(`"${file.name}" is larger than 15 MB`);
          continue;
        }
        if (next.some((p) => p.file.name === file.name && p.file.size === file.size)) continue;
        next.push({
          file,
          preview: isImageFile(file) ? URL.createObjectURL(file) : undefined,
        });
      }
      return next;
    });
  }

  function removePending(index: number) {
    setPending((prev) => {
      const target = prev[index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function send(text: string) {
    const message = text.trim();
    if ((!message && !pending.length) || thinking) return;
    setError('');

    const outgoing = pending;
    setPending([]);
    setInput('');
    const optimistic: Msg = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    let sent: Attachment[] = [];
    try {
      if (outgoing.length) {
        setThinking({ phase: 'upload' });
        const fd = new FormData();
        outgoing.forEach((p) => fd.append('files', p.file));
        const up = await api<{ files: Attachment[] }>('/chat/upload', { method: 'POST', body: fd });
        sent = up.files;
        // reflect real attachments on the optimistic message
        setMessages((m) =>
          m.map((msg) => (msg.id === optimistic.id ? { ...msg, meta: { attachments: sent } } : msg))
        );
      }

      setThinking({ phase: 'agent' });
      const res = await api<{ reply: string; toolTrace: { name: string; ok: boolean }[]; provider: string }>(
        '/chat',
        { body: { message: message || 'Please review the attached files.', attachments: sent.length ? sent : undefined } }
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
      outgoing.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      setThinking(null);
    }
  }

  const empty = messages.length === 0 && !thinking;
  const liveProvider = provider === 'gemini' || provider === 'groq';

  return (
    <div
      className="relative h-[calc(100dvh-7rem)] max-w-3xl mx-auto"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        dragDepth.current = 0;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
      }}
    >
      {/* ambient glass backdrop */}
      <div className="ambient" aria-hidden="true">
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>

      {/* drag & drop overlay */}
      {dragging && (
        <div className="absolute inset-0 z-30 rounded-3xl bg-sky/25 backdrop-blur-md border-2 border-dashed border-sky-deep/70 flex flex-col items-center justify-center gap-2 pointer-events-none fade-up">
          <Icon name="paperclip" className="w-8 h-8 text-sky-deep" />
          <div className="text-sm font-extrabold text-navy">Drop files to attach</div>
          <div className="text-xs text-navy/60 font-semibold">.zip · .pdf · .jpeg · any format · up to 15 MB each</div>
        </div>
      )}

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
                ? thinking.phase === 'upload'
                  ? 'attaching files…'
                  : 'agent working autonomously'
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
          </div>
        </div>

        {/* ── messages ── */}
        <div className="flex-1 min-h-0 overflow-y-auto chat-scroll pr-1 space-y-5 py-5">
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
                I can write posts, schedule them, track clicks and sales — just ask. Drop a file to share it too.
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
                {thinking.phase === 'upload' ? (
                  <div className="flex gap-1.5 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-deep dot" />
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-deep dot" />
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-deep dot" />
                    <span className="text-xs text-navy/45 font-medium ml-1">Uploading attachments…</span>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
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

        {/* ── pending attachments ── */}
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-3 fade-up">
            {pending.map((p, i) => (
              <div key={`${p.file.name}-${i}`} className="glass-soft rounded-xl flex items-center gap-2 pl-1.5 pr-2 py-1.5 max-w-[15rem]">
                {p.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.preview} alt="" className="w-9 h-9 rounded-lg object-cover" />
                ) : (
                  <span className="w-9 h-9 rounded-lg bg-sky-deep/10 text-sky-deep flex items-center justify-center text-[10px] font-extrabold">
                    {ext(p.file.name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-navy truncate">{p.file.name}</div>
                  <div className="text-[10px] text-navy/40">{fmtSize(p.file.size)}</div>
                </div>
                <button
                  onClick={() => removePending(i)}
                  aria-label={`Remove ${p.file.name}`}
                  className="p-1 rounded-full text-navy/40 hover:text-danger hover:bg-danger/10 transition"
                >
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── composer ── */}
        <div className="pt-1">
          <div className="glass flex items-center gap-2 rounded-full px-2 py-1.5 focus-within:border-sky-deep/50 focus-within:ring-2 focus-within:ring-sky-deep/15 transition">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Attach files (.zip, .pdf, .jpeg…)"
              className="glass-soft w-9 h-9 rounded-full flex items-center justify-center text-navy/55 hover:text-sky-deep transition shrink-0"
              aria-label="Attach files"
            >
              <Icon name="paperclip" className="w-4 h-4" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask Baymax — or drop / attach any file…"
              className="flex-1 bg-transparent px-2 py-2 text-sm text-ink placeholder:text-navy/35 outline-none min-w-0"
            />
            <button
              onClick={() => send(input)}
              disabled={(!input.trim() && !pending.length) || Boolean(thinking)}
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
  const attachments = m.meta?.attachments ?? [];
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
          {m.content || (attachments.length ? '📎' : '')}
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {attachments.map((a) => {
              const href = resolveUrl(a.url);
              const image = a.mime.startsWith('image/');
              return image ? (
                <a key={a.path} href={href} target="_blank" rel="noreferrer" title={a.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={href}
                    alt={a.name}
                    className="h-20 max-w-[10rem] w-auto object-cover rounded-xl border border-white/70 shadow-md hover:-translate-y-0.5 transition"
                  />
                </a>
              ) : (
                <a
                  key={a.path}
                  href={href}
                  download={a.name}
                  title={`${a.name} (${fmtSize(a.size)})`}
                  className="glass-soft inline-flex items-center gap-2 rounded-xl px-2.5 py-2 hover:border-sky-deep/40 hover:-translate-y-0.5 transition-all max-w-[14rem]"
                >
                  <span className="w-8 h-8 rounded-lg bg-sky-deep/10 text-sky-deep flex items-center justify-center text-[9px] font-extrabold shrink-0">
                    {ext(a.name)}
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block text-xs font-semibold text-navy truncate">{a.name}</span>
                    <span className="block text-[10px] text-navy/40">{fmtSize(a.size)}</span>
                  </span>
                </a>
              );
            })}
          </div>
        )}

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
