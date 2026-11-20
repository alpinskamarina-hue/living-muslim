// The in-app assistant («Помощник»): the conversation lives only on this device; each question goes to /api/ask,
// which adds the owner's instructions and asks Claude. Owner-only: reading and saving those instructions.
import { accessToken } from './auth';
import { _t, LANG } from './i18n';
import type { Settings } from './types';

export interface AiMsg {
  role: 'user' | 'assistant'; content: string; at: number;
  /** asked by voice */ voice?: boolean;
  /** The API content of a tool round: the model's blocks, or the phone's tool results (then hidden). */
  raw?: unknown[]; hidden?: boolean;
  /** What the assistant did in the app, one line each. */
  acts?: string[];
  /** A book the person attached with 📎: its shelf id (the reply shows «Открыть» and «Сделать цель»). */
  book?: string;
}

const LS = 'lm.ai.chat';
const KEEP = 60;

export function loadChat(): AiMsg[] {
  try { const x = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; }
}
export function saveChat(m: AiMsg[]) {
  try { if (m.length) localStorage.setItem(LS, JSON.stringify(m.slice(-KEEP))); else localStorage.removeItem(LS); } catch { /* private mode */ }
}

/** The name people see: their own, or simply «Помощник». */
export const aiName = (s: Settings) => s.aiName?.trim() || _t("Помощник");

export type AskResult = { text: string; left?: number | null; calls?: { id: string; name: string; input: Record<string, unknown> }[]; content?: unknown[] } | { error: 'signin' | 'limit' | 'nokey' | 'refused' | 'net' | 'busy' };

export async function ask(history: AiMsg[], s: Settings, ctx = ''): Promise<AskResult> {
  const t = await accessToken();
  if (!t) return { error: 'signin' };
  try {
    const r = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        messages: history.map(({ role, content, raw }) => ({ role, content: raw ?? content })),
        lang: LANG, name: s.aiName?.trim() || '', me: s.me || '', madhab: s.madhab, you: s.aiYou || '', len: s.aiLen || '', tone: s.aiTone || '', ctx,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) return { error: 'signin' };
    if (r.status === 429) return { error: 'limit' };
    if (r.status === 503 && j.error === 'nokey') return { error: 'nokey' };
    if (!r.ok) return { error: 'busy' };
    if (j.refused || (!j.text && !j.calls?.length)) return { error: 'refused' };
    return { text: j.text || '', left: j.left, calls: j.calls, content: j.content };
  } catch { return { error: 'net' }; }
}

// ───── Owner: what the assistant is taught ─────
const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';

export interface AiConfig { instructions: string; knowledge: string; updated_at?: string }

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const t = await accessToken();
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t || KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) { let m = ''; try { const j = await r.json(); m = j.message || j.hint || ''; } catch { /* */ } throw new Error(`${r.status} ${m}`.trim()); }
  return (await r.json()) as T;
}
export const getAiConfig = () => rpc<AiConfig | null>('lm_ai_config_get', {});
export const setAiConfig = (c: AiConfig) => rpc<AiConfig>('lm_ai_config_set', { p_instructions: c.instructions, p_knowledge: c.knowledge });
