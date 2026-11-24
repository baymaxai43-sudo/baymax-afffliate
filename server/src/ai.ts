/**
 * Unified AI gateway: Gemini (primary) → Groq (fallback) → explicit error.
 * Plain REST calls — no vendor SDKs.
 */
import { config } from './config';

export type AIMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: null; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface AIResult {
  text?: string;
  toolCalls?: ToolCall[];
  provider: 'gemini' | 'groq' | 'error';
}

interface ChatOptions {
  messages: AIMessage[];
  tools?: AITool[];
  json?: boolean;
  temperature?: number;
}

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export function aiProviderLabel(): string {
  if (config.geminiApiKey) return `gemini (${config.geminiModel})`;
  if (config.groqApiKey) return `groq (${config.groqModel})`;
  return 'unavailable';
}

/* ------------------------------- Gemini ------------------------------- */

function geminiContents(messages: AIMessage[]) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents: unknown[] = [];
  // Merge consecutive same-role messages, keep order (tool results become user turns)
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.name, response: safeJson(m.content) } }],
      });
      continue;
    }
    if (m.role === 'assistant') {
      if ('toolCalls' in m && m.toolCalls) {
        contents.push({
          role: 'model',
          parts: m.toolCalls.map((tc) => ({ functionCall: { name: tc.name, args: tc.args } })),
        });
      } else {
        contents.push({ role: 'model', parts: [{ text: m.content }] });
      }
      continue;
    }
    contents.push({ role: 'user', parts: [{ text: m.content }] });
  }
  return { system, contents };
}

async function callGemini(opts: ChatOptions): Promise<AIResult> {
  const { system, contents } = geminiContents(opts.messages);
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.85,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (opts.tools?.length) {
    body.tools = [
      {
        functionDeclarations: opts.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  const res = await fetch(`${GEMINI_URL(config.geminiModel)}?key=${encodeURIComponent(config.geminiApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? '').join('') || undefined;
  const toolCalls: ToolCall[] = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      id: `call_${p.functionCall.name}_${Date.now()}_${i}`,
      name: p.functionCall.name,
      args: p.functionCall.args ?? {},
    }));
  if (!text && !toolCalls.length) throw new Error('gemini returned empty response');
  return { text, toolCalls: toolCalls.length ? toolCalls : undefined, provider: 'gemini' };
}

/* -------------------------------- Groq -------------------------------- */

function groqMessages(messages: AIMessage[]) {
  return messages.map((m) => {
    if (m.role === 'system') return { role: 'system', content: m.content };
    if (m.role === 'user') return { role: 'user', content: m.content };
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    }
    if ('toolCalls' in m && m.toolCalls) {
      return {
        role: 'assistant',
        content: m.content ?? null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      };
    }
    return { role: 'assistant', content: m.content };
  });
}

async function callGroq(opts: ChatOptions): Promise<AIResult> {
  const body: Record<string, unknown> = {
    model: config.groqModel,
    messages: groqMessages(opts.messages),
    temperature: opts.temperature ?? 0.85,
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    ...(opts.tools?.length
      ? {
          tools: opts.tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
          tool_choice: 'auto',
        }
      : {}),
  };
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc: any) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || '{}');
    } catch {
      args = {};
    }
    return { id: tc.id, name: tc.function.name, args };
  });
  if (!msg?.content && !toolCalls.length) throw new Error('groq returned empty response');
  return {
    text: msg?.content || undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    provider: 'groq',
  };
}

/* ------------------------------ Entry point ---------------------------- */

export async function chat(opts: ChatOptions): Promise<AIResult> {
  const errors: string[] = [];
  if (config.geminiApiKey) {
    try {
      return await callGemini(opts);
    } catch (e) {
      errors.push(String(e));
    }
  }
  if (config.groqApiKey) {
    try {
      return await callGroq(opts);
    } catch (e) {
      errors.push(String(e));
    }
  }
  // No demo fallback — surface the real failure (visible in logs + UI)
  const detail = errors.length
    ? errors.join(' | ')
    : 'no AI key configured — set GEMINI_API_KEY or GROQ_API_KEY on the backend (Render)';
  console.error('[ai] all providers failed:', detail);
  throw new Error(detail);
}

function safeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return { result: content };
  }
}

/** Parse a JSON array/object out of a model response, tolerating fences. */
export function parseJson<T>(raw: string): T | null {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s) as T;
  } catch {
    const start = s.indexOf('[') >= 0 && (s[0] !== '[' && s[0] !== '{') ? s.indexOf('[') : s.indexOf('{');
    if (start >= 0) {
      const end = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
      if (end > start) {
        try {
          return JSON.parse(s.slice(start, end + 1)) as T;
        } catch {
          /* fallthrough */
        }
      }
    }
  }
  return null;
}

