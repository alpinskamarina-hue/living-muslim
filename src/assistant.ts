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

// ───── «Память помощника»: a short note about the person, kept on this phone ─────
// Chat messages that leave the window sent with each question (the last ASK_WINDOW) are folded into it by /api/remember.
export const ASK_WINDOW = 40;
const MEM = 'lm.ai.mem';
export interface AiMemory { text: string; upto: number; at?: number }
const memSubs = new Set<() => void>();
export function getMemory(): AiMemory {
  try { const x = JSON.parse(localStorage.getItem(MEM) || 'null'); if (x && typeof x.text === 'string') return { text: x.text, upto: Number(x.upto) || 0, at: x.at }; } catch { /* */ }
  return { text: '', upto: 0 };
}
export function setMemory(m: AiMemory) {
  try { if (m.text || m.upto) localStorage.setItem(MEM, JSON.stringify(m)); else localStorage.removeItem(MEM); } catch { /* private mode */ }
  memSubs.forEach((f) => f());
}
export function onMemory(f: () => void) { memSubs.add(f); return () => { memSubs.delete(f); }; }

/** Plain text of a message for the memory (tool rounds: only what the assistant did). */
const memLine = (m: AiMsg) => (m.hidden ? '' : [m.content, ...(m.acts ?? []).map((a) => `[${a}]`)].filter(Boolean).join(' ').trim());

let folding = false;
/** Folds `msgs` (older than the window, newer than what is already remembered) into the note. Quiet on failure. */
export async function fold(msgs: AiMsg[], force = false): Promise<void> {
  if (folding) return;
  const mem = getMemory();
  const old = (force ? msgs : msgs.slice(0, Math.max(0, msgs.length - ASK_WINDOW))).filter((m) => m.at > mem.upto && memLine(m));
  if (!old.length || (!force && old.length < 8)) return;
  const t = await accessToken();
  if (!t) return;
  folding = true;
  try {
    const r = await fetch('/api/remember', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ memory: mem.text, messages: old.map((m) => ({ role: m.role, content: memLine(m) })), lang: LANG }),
    });
    if (!r.ok) return;
    const j = await r.json().catch(() => null);
    if (!j || typeof j.memory !== 'string') return;
    const now = getMemory(); // the person may have edited it meanwhile: then keep theirs, only move the mark
    setMemory({ text: now.text === mem.text ? j.memory : now.text, upto: Math.max(...old.map((m) => m.at)), at: Date.now() });
  } catch { /* try again next time */ } finally { folding = false; }
}

/** The name people see: their own, or simply «Помощник». */
export const aiName = (s: Settings) => s.aiName?.trim() || _t("Помощник");

export type AskResult = { text: string; left?: number | null; calls?: { id: string; name: string; input: Record<string, unknown> }[]; content?: unknown[] } | { error: 'signin' | 'limit' | 'nokey' | 'refused' | 'net' | 'busy' };

export async function ask(history: AiMsg[], s: Settings, ctx = ''): Promise<AskResult> {
  const memory = s.aiMemory === false ? '' : getMemory().text;
  const t = await accessToken();
  if (!t) return { error: 'signin' };
  try {
    const r = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        messages: history.map(({ role, content, raw }) => ({ role, content: raw ?? content })),
        lang: LANG, name: s.aiName?.trim() || '', me: s.me || '', madhab: s.madhab, you: s.aiYou || '', len: s.aiLen || '', tone: s.aiTone || '', ctx, memory,
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
