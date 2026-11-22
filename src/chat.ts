// Circle chat on the standalone site: text, voice (up to 60 s) and event cards (dua requests, challenges).
// Server: supabase/chat.sql. Until it is run, chatReady() is false and nothing about the chat is shown.
import { useCallback, useEffect, useRef, useState } from 'react';
import { isCloud, meRpc, serverHas, cloudMe } from './cloud';
import { currentSubscription } from './push';
import { _t } from './i18n';

export type MsgKind = 'text' | 'voice' | 'event' | 'photo' | 'file' | 'ai';
export interface MsgFile { name: string; size: number; mime: string; thumb?: string; w?: number; h?: number; ok: boolean }
export const FILE_MAX = 5 * 1024 * 1024;
/** r: reply to a message; t: an event card (dua, ch) or a reply tied to someone's dua request (t 'dua', to). */
/** tr: the message belongs to an umrah trip's own chat (the host's id); the Circle chat hides it. */
/** On an assistant answer (kind 'ai'): n its name, at/all/rt the reminder it set (when, for everyone, text), pr the prayer. */
export interface MsgRef { r?: number; t?: 'dua' | 'ch' | 'pr' | 'poll' | 'in' | 'ask' | 'st' | 'bz' | 'post'; d?: string; to?: string; k?: string; tr?: string; um?: string; p?: string; o?: string[]; n?: string; at?: string; all?: boolean; rt?: string; pr?: string; bz?: number; tl?: string; tt?: string }
/** What the circle assistant needs from the phone besides the message. */
export interface AiAskExtra { name: string; me?: string; lang?: string; place: Record<string, unknown>; circle: string }
/** Calls to the assistant in a message: «@Марьям», «@Помощник», or the name the person gave it. */
export function callsAi(body: string, name: string) {
  const names = ['марьям', 'maryam', 'юсуф', 'yusuf', 'помощник', 'assistant', name.trim().toLowerCase()].filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(^|\\s)@(${names.join('|')})(?=$|[\\s,.!?:])`, 'i').test(body);
}
export interface Msg {
  id: number; uid: string; kind: MsgKind; body: string; ref: MsgRef | null;
  sec: number | null; bars: number[] | null; reacts: Record<string, string>;
  deleted: boolean; at: string; voice: boolean; file?: MsgFile | null; pending?: boolean; failed?: boolean;
}
interface ListRes { msgs: Msg[]; seen: number; voice: boolean; owner: string }

let readyP: Promise<boolean> | null = null;
export function chatReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.chat.ok') === '1') return Promise.resolve(true); } catch { /* */ }
  readyP ??= serverHas('lm_chat_list', { p_uid: null, p_token: null, p_code: null }).then((ok) => {
    if (ok) try { sessionStorage.setItem('lm.chat.ok', '1'); } catch { /* */ }
    return ok;
  });
  return readyP;
}

/** Read ticks need supabase/chat-reads.sql; until it is run, my messages show one tick as before. */
let readsP: Promise<boolean> | null = null;
let trP: Promise<boolean> | null = null;
/** Whether chat-transcribe.sql is run: until then «Расшифровать» is not shown. */
export function trReady(): Promise<boolean> {
  try { if (sessionStorage.getItem('lm.chattr') === '1') return Promise.resolve(true); } catch { /* */ }
  trP ??= serverHas('lm_chat_tr_save', { p_secret: null, p_id: 0, p_text: null }).then((ok) => {
    if (ok) try { sessionStorage.setItem('lm.chattr', '1'); } catch { /* */ }
    return ok;
  });
  return trP;
}

export function readsReady(): Promise<boolean> {
  if (!isCloud) return Promise.resolve(false);
  try { if (sessionStorage.getItem('lm.reads.ok') === '1') return Promise.resolve(true); } catch { /* */ }
  readsP ??= serverHas('lm_chat_reads', { p_uid: null, p_token: null, p_code: null }).then((ok) => {
    if (ok) try { sessionStorage.setItem('lm.reads.ok', '1'); } catch { /* */ }
    return ok;
  });
  return readsP;
}
/** How far my message got: 'sent' nobody has read it yet, 'some' read by some, 'all' read by everyone it was sent to. */
export type ReadState = 'sent' | 'some' | 'all';
export function readStateOf(rd: number, tot: number): ReadState { return rd <= 0 ? 'sent' : rd >= tot ? 'all' : 'some'; }

let linked = false;
/** Ties this phone's push subscription to me, so the server can announce new messages. */
async function linkPush() {
  if (linked) return;
  linked = true;
  try {
    const sub = await currentSubscription();
    if (sub) await meRpc('lm_push_link', { p_endpoint: sub.endpoint });
  } catch { /* no push or older server */ }
}

const merge = (a: Msg[], b: Msg[]) => {
  const m = new Map<number, Msg>();
  for (const x of a) m.set(x.id, x);
  for (const x of b) m.set(x.id, x);
  return [...m.values()].sort((x, y) => x.id - y.id);
};

export interface ChatApi {
  code: string | undefined;
  ready: boolean;
  /** Photos and documents: true once supabase/chat-files.sql is on the server. */
  filesOn: boolean;
  msgs: Msg[];
  /** Last message id I had seen when the chat was opened (for the «new» line). */
  seenAtOpen: number | null;
  /** For my message: how far it got, and who has read it (null until chat-reads.sql is run). */
  readOf: (m: Msg) => { state: ReadState; by: string[]; tot: number } | null;
  /** Last message id marked as seen for this circle. */
  seen: number;
  unread: number;
  voiceOn: boolean;
  owner: string;
  more: boolean;
  error: string;
  send: (body: string, ref?: MsgRef | null, kind?: 'text' | 'event') => Promise<boolean>;
  sendVoice: (blob: Blob, sec: number, bars: number[], ref?: MsgRef | null) => Promise<string>;
  react: (id: number, e: string) => void;
  retry: (m: Msg) => void;
  remove: (id: number) => Promise<boolean>;
  report: (id: number, reason: string) => Promise<boolean>;
  older: () => Promise<void>;
  setVoice: (on: boolean) => Promise<boolean>;
  voiceUrl: (id: number) => Promise<string>;
  /** Id of the last voice message I sent from this phone (0 = none yet). */
  lastVoiceId: () => number;
  /** Photo or document: '' when sent, else an error code (big, type, day, error). */
  sendFile: (f: File, caption: string, ref?: MsgRef | null) => Promise<string>;
  fileUrl: (id: number) => Promise<string>;
  /** «Расшифровать»: the text of a voice message ('…' = no words made out), or an error code (limit, nosql, busy, net). */
  transcribe: (id: number) => Promise<{ text?: string; err?: string }>;
  /** The assistant in this circle: on/off, who may ask it to remind everyone, and its live reminders (msg id → on for me; missing = cancelled or past). */
  ai: { ready: boolean; on: boolean; all: 'owner' | 'all'; mine: Record<number, boolean> };
  askAi: (body: string, extra: AiAskExtra) => Promise<{ dua?: string; err?: string }>;
  aiPing: (msgId: number, act: 'me' | 'notme' | 'cancel') => Promise<boolean>;
  setAi: (on: boolean, all: 'owner' | 'all') => Promise<boolean>;
}

const voiceCache = new Map<number, string>();

/** One circle's chat. Polls every 3 s while open, every 20 s otherwise (dua replies and the badge). */
export function useChat(code: string | undefined, open: boolean): ChatApi {
  const [ready, setReady] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [seen, setSeen] = useState(0);
  const [seenAtOpen, setSeenAtOpen] = useState<number | null>(null);
  const lastVoice = useRef(0);
  const wantSeen = useRef(false);
  // others' read marks: uid → [last message read, joined at (ms)]
  const [reads, setReads] = useState<Record<string, [number, number]> | null>(null);
  const readsOn = useRef(false);
  useEffect(() => { readsReady().then((ok) => { readsOn.current = ok; }); }, []);
  const [voiceOn, setVoiceOn] = useState(true);
  const [owner, setOwner] = useState('');
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const last = useRef(0);
  const me = cloudMe()?.uid ?? '';

  const [filesOn, setFilesOn] = useState(false);
  const [ai, setAiState] = useState<ChatApi['ai']>({ ready: false, on: true, all: 'owner', mine: {} });
  const lastSent = useRef(0);
  const loadAi = useCallback(async () => {
    if (!code) return;
    try {
      const [g, mine] = await Promise.all([
        meRpc<{ on: boolean; all: 'owner' | 'all' } | null>('lm_chat_ai_get', { p_code: code }),
        meRpc<{ msg: number; on: boolean }[] | null>('lm_chat_ai_mine', { p_code: code }),
      ]);
      if (!g) return;
      setAiState({ ready: true, on: g.on !== false, all: g.all === 'all' ? 'all' : 'owner', mine: Object.fromEntries((mine ?? []).map((x) => [x.msg, x.on])) });
    } catch { /* circle-ai.sql not run yet */ }
  }, [code]);
  useEffect(() => { chatReady().then(setReady); }, []);
  useEffect(() => { if (ready) serverHas('lm_chat_file', { p_uid: null, p_token: null, p_id: 0 }).then(setFilesOn); }, [ready]);

  const pull = useCallback(async (full = false) => {
    if (!code) return;
    try {
      const r = await meRpc<ListRes | null>('lm_chat_list', { p_code: code, p_after: full ? 0 : last.current, p_before: 0 });
      if (!r) return;
      if (open && readsOn.current) meRpc<Record<string, [number, number]> | null>('lm_chat_reads', { p_code: code }).then((x) => { if (x) setReads(x); }).catch(() => {});
      setVoiceOn(r.voice !== false); setOwner(r.owner || ''); setSeen((s) => Math.max(s, r.seen || 0)); setError((e) => (DM_ERRS().includes(e) ? e : ''));
      if (wantSeen.current) { wantSeen.current = false; setSeenAtOpen(r.seen || 0); }
      if (full) { setMore(r.msgs.length >= 60); if (open) loadAi(); }
      if (full || r.msgs.length) {
        setMsgs((old) => {
          // after a full load drop what is gone (deleted by the owner, people who left)
          const minNew = r.msgs[0]?.id ?? Infinity;
          const next = full ? merge(old.filter((m) => m.pending || m.id < minNew), r.msgs) : merge(old, r.msgs);
          last.current = next.filter((m) => !m.pending).reduce((a, m) => Math.max(a, m.id), 0);
          return next;
        });
      }
    } catch { setError(_t("Нет связи, сообщения обновятся сами")); }
  }, [code, open, loadAi]);

  // full reload now and then picks up reactions and deletions on older messages
  useEffect(() => {
    if (!ready || !code) return;
    let n = 0, t: number | undefined, alive = true;
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === 'visible') await pull(n % 3 === 0);
      n++;
      t = window.setTimeout(tick, open ? 3000 : 20000);
    };
    tick();
    const vis = () => { if (document.visibilityState === 'visible') pull(true); };
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; clearTimeout(t); document.removeEventListener('visibilitychange', vis); };
  }, [ready, code, open, pull]);

  useEffect(() => { if (ready && open) linkPush(); }, [ready, open]);
  // the «new messages» line: what I had read before opening; if nothing was loaded yet, take it from the first answer
  useEffect(() => { if (open) { setSeenAtOpen(seen || null); wantSeen.current = !seen; } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // mark as read while the chat is open
  const top = msgs.filter((m) => !m.pending).reduce((a, m) => Math.max(a, m.id), 0);
  useEffect(() => {
    if (!open || !code || !top || top <= seen) return;
    setSeen(top);
    meRpc('lm_chat_seen', { p_code: code, p_id: top }).catch(() => {});
    window.dispatchEvent(new Event('lm-chat-seen'));
  }, [open, code, top, seen]);

  const unread = msgs.filter((m) => m.id > seen && m.uid !== me && !m.deleted && !m.pending).length;
  const readOf = useCallback((m: Msg) => {
    if (!reads || m.pending || m.id <= 0) return null;
    const at = Date.parse(m.at);
    const to = Object.entries(reads).filter(([, [, j]]) => !j || j <= at + 1000);
    const by = to.filter(([, [l]]) => l >= m.id).map(([u]) => u);
    return { state: readStateOf(by.length, to.length), by, tot: to.length };
  }, [reads]);

  const tmp = useRef(-1);
  const send = async (body: string, ref: MsgRef | null = null, kind: 'text' | 'event' = 'text') => {
    const b = body.trim().slice(0, 2000);
    if (!b || !code) return false;
    const id = tmp.current--;
    const local: Msg = { id: 1e15 + -id, uid: me, kind, body: b, ref, sec: null, bars: null, reacts: {}, deleted: false, at: new Date().toISOString(), voice: false, pending: true };
    setMsgs((m) => [...m, local]);
    try {
      const r = await meRpc<Msg & { error?: string }>('lm_chat_send', { p_code: code, p_body: b, p_ref: ref, p_kind: kind });
      if (r?.error) throw new Error(r.error);
      setMsgs((m) => merge(m.filter((x) => x !== local), [r]));
      last.current = Math.max(last.current, r.id);
      lastSent.current = r.id;
      setError((e) => (DM_ERRS().includes(e) ? '' : e));
      return true;
    } catch (e) {
      setMsgs((m) => m.map((x) => (x === local ? { ...x, failed: true } : x)));
      const em = String((e as Error).message);
      setError(em === 'slow' ? _t("Слишком часто. Подожди минуту") : dmErr(em) || _t("Не отправилось. Нажми на сообщение, чтобы повторить"));
      return false;
    }
  };

  const sendVoice = async (blob: Blob, sec: number, bars: number[], ref: MsgRef | null = null) => {
    if (!code) return 'error';
    const b64 = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] || '');
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
    try {
      const r = await meRpc<Msg & { error?: string }>('lm_chat_voice_send', { p_code: code, p_mime: blob.type || 'audio/webm', p_b64: b64, p_sec: Math.round(sec), p_bars: bars, p_ref: ref });
      if (r?.error) return r.error;
      voiceCache.set(r.id, URL.createObjectURL(blob));
      lastVoice.current = r.id;
      setMsgs((m) => merge(m, [r]));
      last.current = Math.max(last.current, r.id);
      return '';
    } catch (e) { const d = dmCode(String((e as Error)?.message)); if (d) setError(dmErr(d)); return d || 'error'; }
  };

  const react = (id: number, e: string) => {
    setMsgs((m) => m.map((x) => {
      if (x.id !== id) return x;
      const r = { ...x.reacts };
      if (r[me] === e) delete r[me]; else r[me] = e;
      return { ...x, reacts: r };
    }));
    meRpc<Msg | null>('lm_chat_react', { p_id: id, p_emoji: e }).then((r) => { if (r) setMsgs((m) => merge(m, [r])); }).catch(() => {});
  };

  const remove = async (id: number) => {
    const ok = await meRpc<boolean>('lm_chat_delete', { p_id: id }).catch(() => false);
    if (ok) setMsgs((m) => m.map((x) => (x.id === id ? { ...x, deleted: true, body: '', reacts: {}, voice: false, file: null } : x)));
    return ok;
  };
  const report = (id: number, reason: string) => meRpc<boolean>('lm_chat_report', { p_id: id, p_reason: reason }).catch(() => false);

  const older = async () => {
    if (!code || !msgs.length) return;
    const first = msgs.find((m) => !m.pending)?.id ?? 0;
    const r = await meRpc<ListRes | null>('lm_chat_list', { p_code: code, p_after: 0, p_before: first }).catch(() => null);
    if (!r) return;
    setMore(r.msgs.length >= 60);
    setMsgs((m) => merge(r.msgs, m));
  };

  const setVoice = async (on: boolean) => {
    const ok = await meRpc<boolean>('lm_chat_settings', { p_code: code, p_voice: on }).catch(() => false);
    if (ok) setVoiceOn(on);
    return ok;
  };

  const voiceUrl = async (id: number) => {
    const c = voiceCache.get(id);
    if (c) return c;
    const r = await meRpc<{ mime: string; b64: string } | null>('lm_chat_voice', { p_id: id });
    if (!r?.b64) return '';
    const bin = atob(r.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
    voiceCache.set(id, url);
    return url;
  };

  const retry = (m: Msg) => { setMsgs((x) => x.filter((y) => y !== m)); send(m.body, m.ref, m.kind === 'event' ? 'event' : 'text'); };

  const sendFile = async (f: File, caption: string, ref: MsgRef | null = null) => {
    if (!code) return 'error';
    try {
      let photo = /^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name);
      let blob: Blob = f, meta: Record<string, unknown> = { name: f.name.slice(0, 120), mime: f.type || 'application/octet-stream' };
      if (photo) {
        const p = await shrinkPhoto(f).catch(() => null);
        if (p) { blob = p.blob; meta = { name: f.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', thumb: p.thumb, w: p.w, h: p.h }; }
        else photo = false; // a picture this browser cannot open goes as a document
      }
      if (blob.size > FILE_MAX) return 'big';
      const r = await meRpc<Msg & { error?: string }>('lm_chat_file_send', { p_code: code, p_kind: photo ? 'photo' : 'file', p_meta: meta, p_b64: await toB64(blob), p_body: caption.trim().slice(0, 1000), p_ref: ref });
      if (r?.error) return r.error;
      fileCache.set(r.id, URL.createObjectURL(blob));
      setMsgs((m) => merge(m, [r]));
      last.current = Math.max(last.current, r.id);
      return '';
    } catch (e) { const d = dmCode(String((e as Error)?.message)); if (d) setError(dmErr(d)); return d || 'error'; }
  };

  const fileUrl = async (id: number) => {
    const c = fileCache.get(id);
    if (c) return c;
    const r = await meRpc<{ mime: string; b64: string } | null>('lm_chat_file', { p_id: id });
    if (!r?.b64) return '';
    const url = URL.createObjectURL(b64Blob(r.b64, r.mime));
    fileCache.set(id, url);
    return url;
  };

  const transcribe = async (id: number) => {
    const me = cloudMe();
    if (!me) return { err: 'auth' };
    try {
      const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: me.uid, token: me.token, id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { err: j.error || 'net' };
      const text = String(j.text ?? '');
      setMsgs((m) => (j.msg?.id ? merge(m, [j.msg]) : m.map((x) => (x.id === id ? { ...x, body: text } : x))));
      return { text };
    } catch { return { err: 'net' }; }
  };

  const askAi = async (body: string, extra: AiAskExtra) => {
    const id = cloudMe();
    if (!code || !id) return { err: 'auth' };
    try {
      const r = await fetch('/api/circle-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: id.uid, token: id.token, code, msg_id: lastSent.current, text: body, ...extra }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { err: j.error || 'net' };
      if (j.off) return { err: 'off' };
      if (j.msg?.id) { setMsgs((m) => merge(m, [j.msg])); last.current = Math.max(last.current, j.msg.id); if (j.msg.ref?.at) setAiState((a) => ({ ...a, mine: { ...a.mine, [j.msg.id]: true } })); }
      return { dua: j.dua || '' };
    } catch { return { err: 'net' }; }
  };
  const aiPing = async (msgId: number, act: 'me' | 'notme' | 'cancel') => {
    const r = await meRpc<{ ok?: boolean; error?: string }>('lm_chat_ai_ping', { p_msg: msgId, p_act: act }).catch(() => null);
    if (!r?.ok) return false;
    if (act !== 'cancel') setAiState((a) => ({ ...a, mine: { ...a.mine, [msgId]: act === 'me' } }));
    if (act === 'cancel') setAiState((a) => { const mine = { ...a.mine }; delete mine[msgId]; return { ...a, mine }; });
    return true;
  };
  const setAi = async (on: boolean, all: 'owner' | 'all') => {
    const ok = await meRpc<boolean>('lm_chat_ai_set', { p_code: code, p_on: on, p_all: all }).catch(() => false);
    if (ok) setAiState((a) => ({ ...a, on, all }));
    return ok;
  };

  return { code, ai, askAi, aiPing, setAi, ready, filesOn, msgs, seenAtOpen, readOf, seen, unread, voiceOn, owner, more, error, send, sendVoice, react, retry, remove, report, older, setVoice, voiceUrl, lastVoiceId: () => lastVoice.current, sendFile, fileUrl, transcribe };
}

/** Unread messages in each of my circles, for the bottom bar and the circle chips. Every 30 s while visible. */
export function useChatUnread(): Record<string, number> {
  const [u, setU] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!isCloud) return;
    let alive = true, t: number | undefined;
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === 'visible' && cloudMe() && (await chatReady())) {
        const r = await meRpc<Record<string, number> | null>('lm_chat_unread').catch(() => null);
        if (r && alive) setU(r);
      }
      t = window.setTimeout(tick, 30000);
    };
    tick();
    const now = () => { clearTimeout(t); tick(); };
    window.addEventListener('lm-chat-seen', now);
    document.addEventListener('visibilitychange', now);
    return () => { alive = false; clearTimeout(t); window.removeEventListener('lm-chat-seen', now); document.removeEventListener('visibilitychange', now); };
  }, []);
  return u;
}

/** Messages answering someone's dua request: replies to its event card, or tied to it directly. */
export function duaReplies(msgs: Msg[], asker: string, day: string): Msg[] {
  const ev = msgs.filter((m) => m.kind === 'event' && m.ref?.t === 'dua' && m.uid === asker && (m.ref.d ?? '') >= day).map((m) => m.id);
  return msgs.filter((m) => !m.deleted && m.uid !== asker && m.kind !== 'event' && ((m.ref?.r && ev.includes(m.ref.r)) || (m.ref?.t === 'dua' && m.ref.to === asker && (m.ref.d ?? '') >= day)));
}
export const duaEventId = (msgs: Msg[], asker: string, day: string) =>
  [...msgs].reverse().find((m) => m.kind === 'event' && m.ref?.t === 'dua' && m.uid === asker && (m.ref.d ?? '') >= day)?.id;

const fileCache = new Map<number, string>();

function toB64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}
function b64Blob(b64: string, mime: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Photos are shrunk on the phone: up to 1600 px, JPEG ~80%, plus a tiny preview for the list. */
async function shrinkPhoto(f: File): Promise<{ blob: Blob; thumb: string; w: number; h: number }> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const draw = (max: number) => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return c;
    };
    const big = draw(1600);
    const blob = await new Promise<Blob>((res, rej) => big.toBlob((b) => (b ? res(b) : rej(new Error('jpeg'))), 'image/jpeg', 0.8));
    const thumb = draw(48).toDataURL('image/jpeg', 0.6);
    return { blob, thumb, w: big.width, h: big.height };
  } finally { URL.revokeObjectURL(url); }
}

/** Errors from the chat-of-two guard (supabase/dm.sql). They stay on screen until a message goes through. */
const DM_ERRS = () => ['dm_first', 'dm_blocked', 'dm_locked'].map(dmErr);
export function dmCode(m: string): string { const x = /dm_(first|blocked|locked)/.exec(m || ''); return x ? x[0] : ''; }
export function dmErr(m: string): string {
  const c = dmCode(m);
  return c === 'dm_first' ? _t("Ссылки, фото и файлы можно после первого ответа собеседника.")
    : c === 'dm_blocked' ? _t("Этот чат закрыт: один из вас заблокировал другого.")
      : c === 'dm_locked' ? _t("Личные сообщения закрыты до проверки жалоб.") : '';
}
