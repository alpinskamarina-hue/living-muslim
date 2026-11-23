import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ic, IcT, Rx } from './LIcon';
import { FounderMark } from './FounderBadge';
import { FILE_MAX, callsAi, trReady, type ChatApi, type Msg, type MsgRef, type ReadState } from '../chat';
import { aiName } from '../assistant';
import { placeOf } from '../plansCloud';
import { setAskFor } from '../cweek';
import type { Member, Reacts } from '../circle';
import { askAnswers } from '../cweek';
import { blockUser, isDm } from '../cloud';
import { ensureLive, useLoc, useLocReady } from '../location';
import { LiveMap, LocCard, LocSheet } from './Location';
import { prayerTimes } from '../prayer';
import { enablePush, currentSubscription, DEFAULT_PREFS } from '../push';
import type { AppState } from '../types';
import { plural } from '../dates';
import { _t, _tj, LANG, LOC, isEn } from '../i18n';
import { DAY_AYAHS } from '../ayahs';
import { Globe, TrText } from './TrText';
import { chatLangs, fromLabel, inLabel, langName, offerOn, outLang, rememberSent, setOutLang, translateOut, useTrSettings, voiceAuto } from '../translate';
import { openPerson, personOk, INTENTS, type IntentKind } from '../person';

type Names = Record<string, { name: string; avatarUrl: string; color: string } | undefined>;
export interface Draft { text: string; ref: MsgRef | null; label?: string }

const QUICK = [_t("🤲 Амин"), _t("✨ МашаАллах"), _t("💪 Я с тобой")];
const EMOJI = ['🤲', '❤️', '✨', '💪', '👍'];
const RX_NAME: Record<string, string> = { '🤲': _t("Амин"), '❤️': _t("Люблю ради Аллаха"), '✨': _t("МашаАллах"), '💪': _t("Я с тобой"), '👍': _t("Согласен") };
const PRAYER: Record<string, string> = { fajr: _t("Фаджр"), dhuhr: _t("Зухр"), asr: _t("Аср"), maghrib: _t("Магриб"), isha: _t("Иша") };
export const MAX_SEC = 60;

const hm = (iso: string) => new Date(iso).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(iso) === dayKey(now.toISOString())) return _t("Сегодня");
  if (dayKey(iso) === dayKey(y.toISOString())) return _t("Вчера");
  return d.toLocaleDateString(LOC, { day: 'numeric', month: 'long', weekday: 'short' });
}

/** The prayer that started less than 20 minutes ago, if any. */
function prayerNow(state: AppState): string {
  try {
    const t = prayerTimes(state.settings, new Date());
    const now = Date.now();
    for (const a of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) if (now >= t[a].getTime() && now - t[a].getTime() < 20 * 60000) return PRAYER[a];
  } catch { /* no place set */ }
  return '';
}

const ANCH = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
/** The prayer whose time it is now (from its start until the next one), or '' before Fajr / without a place. */
function prayerOfNow(state: AppState): string {
  try {
    const t = prayerTimes(state.settings, new Date());
    let cur = '';
    for (const a of ANCH) if (Date.now() >= t[a].getTime()) cur = a;
    return cur;
  } catch { return ''; }
}
/** Prayer periods of a day, for dividers in the chat: [start ms, anchor]. */
const periodCache = new Map<string, [number, string][]>();
function periodOf(state: AppState, iso: string): [number, string] | null {
  const d = new Date(iso);
  const k = `${dayKey(iso)}|${state.settings.lat}|${state.settings.lng}|${state.settings.method}`;
  let list = periodCache.get(k);
  if (!list) {
    try { const t = prayerTimes(state.settings, d); list = ANCH.map((a) => [t[a].getTime(), a] as [number, string]); } catch { list = []; }
    periodCache.set(k, list);
  }
  let got: [number, string] | null = null;
  for (const x of list) if (d.getTime() >= x[0]) got = x;
  return got;
}
const POLL_E = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
export interface ChatAction { ic: string; label: string; run: () => void; c?: string }

/** One line for a message in quotes and previews. */
export function shortOf(m: Msg, n = 90) {
  if (m.kind === 'voice') return _t("🎙 Голосовое");
  if (m.ref?.t === 'poll') return `📊 ${m.body.slice(0, n)}`;
  if (m.ref?.t === 'pr') return `✅ ${m.body.slice(0, n)}`;
  if (m.ref?.t === 'post') return `📣 ${m.body.slice(0, n)}`;
  if (m.kind === 'photo') return _t("📷 Фото") + (m.body ? ` · ${m.body.slice(0, n)}` : '');
  if (m.kind === 'file') return `📄 ${m.file?.name || _t("Файл")}` + (m.body ? ` · ${m.body.slice(0, n)}` : '');
  return m.body.slice(0, n);
}
const sizeOf = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} ${_t("МБ")}` : `${Math.max(1, Math.round(b / 1024))} ${_t("КБ")}`);
const iconOf = (name: string) => (/\.pdf$/i.test(name) ? '📕' : /\.(docx?|odt|rtf|txt)$/i.test(name) ? '📝' : /\.(xlsx?|csv|ods)$/i.test(name) ? '📊' : /\.(pptx?|key)$/i.test(name) ? '📽' : /\.(zip|rar|7z)$/i.test(name) ? '🗜' : /\.(mp3|m4a|ogg|wav)$/i.test(name) ? '🎵' : /\.(mp4|mov|webm)$/i.test(name) ? '🎬' : '📄');

function Photo({ m, chat, onOpen }: { m: Msg; chat: ChatApi; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const box = useRef<HTMLSpanElement>(null);
  const f = m.file!;
  useEffect(() => {
    if (!f.ok || url) return;
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); chat.fileUrl(m.id).then(setUrl).catch(() => {}); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [m.id, f.ok]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f.ok) return <span className="cc-gone">{_t("📷 Фото больше не доступно")}</span>;
  const w = Math.min(230, f.w || 230), h = f.w && f.h ? Math.round((w * f.h) / f.w) : 170;
  return (
    <span ref={box} className="cc-photo" style={{ width: w, height: Math.min(320, h), backgroundImage: f.thumb ? `url(${f.thumb})` : undefined }} onClick={() => url && onOpen(url)}>
      {url && <img src={url} alt="" />}
    </span>
  );
}

function FileCard({ m, chat }: { m: Msg; chat: ChatApi }) {
  const [busy, setBusy] = useState(false);
  const f = m.file!;
  if (!f.ok) return <span className="cc-gone">📄 {f.name} · {_t("файл больше не доступен")}</span>;
  const open = async () => {
    setBusy(true);
    const url = await chat.fileUrl(m.id).catch(() => '');
    setBusy(false);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = f.name || 'file'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  };
  return (
    <button type="button" className="cc-file" onClick={open}>
      <i>{iconOf(f.name)}</i>
      <span><b>{f.name || _t("Файл")}</b><small>{sizeOf(f.size)} · {busy ? _t("загружаю…") : _t("скачать")}</small></span>
    </button>
  );
}

function Ava({ id, names }: { id: string; names: Names }) {
  const p = names[id];
  const open = personOk() ? () => openPerson(id) : undefined;
  return p?.avatarUrl ? <img className="cc-ava" src={p.avatarUrl} alt="" onClick={open} /> : <span className="cc-ava" style={{ background: p?.color || '#1f7a4d' }} onClick={open}>{(p?.name || '?').slice(0, 1).toUpperCase()}</span>;
}

export function Voice({ m, chat, mine }: { m: Msg; chat: ChatApi; mine: boolean }) {
  const [state, setState] = useState<'idle' | 'load' | 'play'>('idle');
  const [pos, setPos] = useState(0);
  const a = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { a.current?.pause(); }, []);
  const toggle = async () => {
    if (state === 'play') { a.current?.pause(); setState('idle'); return; }
    if (!a.current) {
      setState('load');
      const url = await chat.voiceUrl(m.id).catch(() => '');
      if (!url) { setState('idle'); return; }
      const el = new Audio(url);
      el.ontimeupdate = () => setPos(el.duration && isFinite(el.duration) ? el.currentTime / el.duration : el.currentTime / (m.sec || 1));
      el.onended = () => { setState('idle'); setPos(0); };
      a.current = el;
    }
    // only one voice message plays at a time
    window.dispatchEvent(new CustomEvent('lm-voice', { detail: m.id }));
    await a.current.play().catch(() => setState('idle'));
    setState('play');
  };
  useEffect(() => {
    const stop = (e: Event) => { if ((e as CustomEvent).detail !== m.id && a.current && !a.current.paused) { a.current.pause(); setState('idle'); } };
    window.addEventListener('lm-voice', stop);
    return () => window.removeEventListener('lm-voice', stop);
  }, [m.id]);
  const trOn = useTrReady();
  useTrSettings();
  const [tr, setTr] = useState<'' | 'load' | string>('');
  const [open, setOpen] = useState(false);
  // one tap «Расшифровать» also translates the text when it is in another language
  const [tapped, setTapped] = useState(false);
  const text = m.body;
  const vAuto = !mine && voiceAuto(chat.code);
  const doTr = async (auto = false) => {
    setTr('load');
    if (!auto) setTapped(true);
    const r = await (auto ? autoTranscribe(chat, m.id) : chat.transcribe(m.id));
    setTr(r.err ? (TR_ERR[r.err] ?? TR_ERR.busy)() : '');
    if (!r.err && !auto) setOpen(true);
  };
  // «Голосовые в текст»: voice messages of others from the last week are transcribed by themselves, one after another
  useEffect(() => {
    if (vAuto && trOn && m.voice && !text && tr === '' && Date.now() - Date.parse(m.at) < 7 * 864e5) void doTr(true);
  }, [vAuto, trOn, m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m.voice && !text) return <span className="cc-gone">{_t("🎙 Голосовое больше не доступно")}</span>;
  const bars = m.bars?.length ? m.bars : Array.from({ length: 24 }, (_, i) => 3 + ((m.id * 7 + i * 13) % 6));
  const long = text.length > 140;
  return (
    <span className="cc-vwrap">
      {m.voice ? (
        <span className={`cc-voice${mine ? ' mine' : ''}`}>
          <button type="button" className="cc-play" onClick={toggle} aria-label={state === 'play' ? _t("Пауза") : _t("Слушать")}>{state === 'play' ? '❚❚' : state === 'load' ? '…' : '▶'}</button>
          <span className="cc-wave" aria-hidden="true">{bars.map((b, i) => <i key={i} className={i / bars.length < pos ? 'on' : ''} style={{ height: `${4 + b * 2.2}px` }} />)}</span>
          <small>0:{String(m.sec || 0).padStart(2, '0')}</small>
        </span>
      ) : <span className="cc-gone">{_t("🎙 Голосовое удалено через 30 дней, текст остался")}</span>}
      {text ? (
        text === '…' ? <span className="cc-tr none">{_t("Слов не разобрать")}</span>
          : <><span className={`cc-tr${long && !open ? ' cut' : ''}`} onClick={long ? () => setOpen((o) => !o) : undefined}><TrText id={m.id} text={text} code={chat.code} mine={mine} cls="cc-tr-in" go={tapped || vAuto} /></span>{long && <button type="button" className="cc-tr-more" onClick={() => setOpen((o) => !o)}>{open ? _t("свернуть") : _t("читать дальше")}</button>}</>
      ) : trOn && m.voice && (
        tr === 'load' ? <span className="cc-tr-btn wait">{vAuto ? _t("Расшифровываю и перевожу…") : _t("Расшифровываю…")}</span>
          : <button type="button" className="cc-tr-btn" onClick={() => void doTr()}><span aria-hidden="true">Аа</span> {tr || _t("Расшифровать")}</button>
      )}
    </span>
  );
}

/** Automatic transcriptions go one at a time, so a chat full of voice messages does not send them all at once. */
let trChain: Promise<unknown> = Promise.resolve();
function autoTranscribe(chat: ChatApi, id: number) {
  const p = trChain.then(() => chat.transcribe(id));
  trChain = p.catch(() => null);
  return p;
}

const TR_ERR: Record<string, () => string> = {
  limit: () => _t("На сегодня расшифровки закончились"),
  net: () => _t("Нет связи, нажми ещё раз"),
  busy: () => _t("Не получилось, нажми ещё раз"),
  nosql: () => _t("Расшифровка ещё не подключена"),
  nokey: () => _t("Расшифровка ещё не подключена"),
  auth: () => _t("Нет доступа к этому голосовому"),
  gone: () => _t("Голосовое удалено"),
};

let trCache: boolean | null = null;
function useTrReady() {
  const [ok, setOk] = useState(trCache ?? false);
  useEffect(() => { if (trCache == null) trReady().then((v) => { trCache = v; setOk(v); }); }, []);
  return ok;
}

/** Hold the mic to record, release to send, slide left to cancel. A short tap records hands-free with buttons. */
export function useRecorder(onDone: (blob: Blob, sec: number, bars: number[]) => void) {
  const relRef = useRef<() => void>(() => {});
  const [rec, setRec] = useState<null | { start: number; locked: boolean }>(null);
  const [sec, setSec] = useState(0);
  const [msg, setMsg] = useState('');
  const r = useRef<{ mr?: MediaRecorder; stream?: MediaStream; chunks: Blob[]; levels: number[]; cancel: boolean; ctx?: AudioContext; timer?: number; down: number; up: boolean }>({ chunks: [], levels: [], cancel: false, down: 0, up: false });
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

  const cleanup = () => {
    const x = r.current;
    clearInterval(x.timer);
    x.stream?.getTracks().forEach((t) => t.stop());
    x.ctx?.close().catch(() => {});
    x.mr = undefined; x.stream = undefined; x.ctx = undefined;
    setRec(null); setSec(0);
  };

  const start = async (clientX = 0) => {
    const x = r.current;
    x.down = Date.now(); x.up = false; x.cancel = false; x.chunks = []; x.levels = [];
    // the mic button is replaced while recording, so listen on the window for release and swipe
    const up = () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('pointermove', move); relRef.current(); };
    const move = (e: PointerEvent) => { if (clientX && e.clientX - clientX < -80 && x.mr && !x.up) { x.cancel = true; up(); } };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('pointermove', move);
    setMsg('');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { setMsg(_t("Нет доступа к микрофону. Разреши его в настройках браузера")); return; }
    const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    const mr = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 24000 });
    x.mr = mr; x.stream = stream;
    try {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      x.ctx = ctx;
      const buf = new Uint8Array(an.fftSize);
      x.timer = window.setInterval(() => {
        an.getByteTimeDomainData(buf);
        let s = 0; for (const v of buf) s += ((v - 128) / 128) ** 2;
        x.levels.push(Math.sqrt(s / buf.length));
        const t = (Date.now() - x.down) / 1000;
        setSec(Math.floor(t));
        if (t >= MAX_SEC) stop(false);
      }, 100);
    } catch { /* no levels: a plain wave is drawn */ }
    mr.ondataavailable = (e) => { if (e.data.size) x.chunks.push(e.data); };
    mr.onstop = () => {
      const dur = (Date.now() - x.down) / 1000;
      const blob = new Blob(x.chunks, { type: mr.mimeType || type || 'audio/webm' });
      const lv = x.levels;
      const max = Math.max(0.02, ...lv);
      const bars = Array.from({ length: 28 }, (_, i) => {
        const part = lv.slice(Math.floor((i * lv.length) / 28), Math.floor(((i + 1) * lv.length) / 28));
        const v = part.length ? Math.max(...part) : 0;
        return Math.round(Math.min(1, v / max) * 9);
      });
      const cancel = x.cancel;
      cleanup();
      if (!cancel && dur >= 1 && blob.size > 200) onDone(blob, Math.min(MAX_SEC, dur), bars);
      else if (!cancel) setMsg(_t("Слишком коротко. Удерживай кнопку и говори"));
    };
    mr.start(250);
    // released before the microphone was ready: a tap, so keep recording hands-free
    setRec({ start: x.down, locked: x.up });
  };

  const stop = (cancel: boolean) => {
    const x = r.current;
    x.cancel = cancel;
    if (x.mr && x.mr.state !== 'inactive') x.mr.stop(); else cleanup();
  };

  /** Pointer up on the mic: a short press keeps recording with buttons, a long one sends. */
  const release = () => {
    const x = r.current;
    x.up = true;
    if (!x.mr) return;
    if (x.cancel) stop(true);
    else if (Date.now() - x.down < 350) setRec((v) => (v ? { ...v, locked: true } : v));
    else if (!rec?.locked) stop(false);
  };
  relRef.current = release;

  return { supported, rec, sec, msg, setMsg, start, stop, release };
}

export function CircleChat({ chat: all, me, names, members, reacts, today, isOwner, state, update, draft, onDraftUsed, onAmin, title, topic, emptyNote, placeholder, actions, onUmrah, other, biz, notice, onPost }: {
  /** A line on top of the composer (the newcomer rules of an open circle). */
  notice?: import('react').ReactNode;
  onPost?: (id: number) => void;
  chat: ChatApi; me: string; names: Names; members: Member[]; reacts: Reacts; today: string; isOwner: boolean;
  state: AppState; update: (fn: (s: AppState) => AppState) => void;
  draft: Draft | null; onDraftUsed: () => void; onAmin: (asker: string) => void; title: string;
  /** A branch of the circle chat (an umrah trip): only its messages are shown and everything sent is tagged with it. */
  topic?: string; emptyNote?: string; placeholder?: string;
  /** In a chat of two: the other person's name until their profile loads. */
  other?: string;
  /** The circle's main screen: «＋» opens these actions, prayer quick buttons, ayah of the day. */
  actions?: ChatAction[];
  /** Opens the umrah trip someone was called to from the chat («Насим зовёт на умру»). */
  onUmrah?: (host: string) => void;
  /** A business circle: a message can become a task, a meeting or a decision; their cards open the tab. */
  biz?: { make: (k: 'task' | 'event' | 'dec', m: Msg) => void; open: (k: 'task' | 'event' | 'dec') => void };
}) {
  const main = Boolean(actions);
  const [plus, setPlus] = useState(false);
  const [locSheet, setLocSheet] = useState(false);
  const [liveMap, setLiveMap] = useState(false);
  const [unfold, setUnfold] = useState<number[]>([]);
  const chat = useTopic(all, topic);
  const [text, setText] = useState('');
  const [ref, setRef] = useState<MsgRef | null>(null);
  const [menu, setMenu] = useState<Msg | null>(null);
  const [opts, setOpts] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const nm = (id: string) => (id === me ? _t("Ты") : names[id]?.name || other || _t("Участник"));
  const byId = new Map(chat.msgs.map((m) => [m.id, m]));
  const quiet = prayerNow(state);

  useEffect(() => {
    if (!draft) return;
    setText(draft.text); setRef(draft.ref);
    onDraftUsed();
    setTimeout(() => ta.current?.focus(), 50);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // stay at the bottom when new messages come, unless I scrolled up to read
  const count = chat.msgs.length;
  const lastId = chat.msgs[count - 1]?.id;
  const first = useRef(true);
  useLayoutEffect(() => {
    const near = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 260;
    if (first.current || near || chat.msgs[count - 1]?.uid === me) window.scrollTo(0, document.documentElement.scrollHeight);
    if (count) first.current = false;
  }, [lastId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [file, setFile] = useState<File | null>(null);
  const [view, setView] = useState('');
  const fileIn = useRef<HTMLInputElement>(null);
  const pickKind = (photo: boolean, cam = false) => {
    setPlus(false);
    const el = fileIn.current;
    if (!el) return;
    el.accept = photo ? 'image/*' : '';
    if (cam) el.setAttribute('capture', 'environment'); else el.removeAttribute('capture');
    el.click();
  };
  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const pic = /^image\//.test(f.type);
    if (!pic && f.size > FILE_MAX) { flash(_t("Файл больше 5 МБ. Отправь ссылку на него")); return; }
    setFile(f);
    setTimeout(() => ta.current?.focus(), 50);
  };
  const sendFile = async () => {
    if (!file) return;
    const f = file, cap = text, r = ref;
    setSending(true); setFile(null); setText(''); setRef(null);
    const e = await chat.sendFile(f, cap, r);
    setSending(false);
    if (e) {
      setFile(f); setText(cap); setRef(r);
      flash(e === 'big' ? _t("Файл больше 5 МБ. Отправь ссылку на него") : e === 'type' ? _t("Такой тип файла нельзя отправить") : e === 'day' ? _t("На сегодня лимит файлов исчерпан (50 МБ)") : e === 'slow' ? _t("Слишком часто. Подожди минуту") : _t("Файл не отправился. Попробуй ещё раз"));
    }
  };
  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(''), 2600); };
  // «Место»: one point or live sharing (location.sql)
  const locOk = useLocReady() && main;
  const liveMsg = chat.msgs.some((m) => m.ref?.t === 'loc' && m.ref.lv && new Date(m.ref.lv).getTime() > Date.now() && !m.deleted);
  const loc = useLoc(chat.code, locOk, liveMsg || liveMap);
  useEffect(() => { ensureLive(); }, []);
  const locDmWait = isDm(chat.code) && !chat.msgs.some((m) => m.uid !== me && m.kind !== 'event');
  const locTile = locOk && loc.data?.on !== false && !locDmWait;

  const myAi = aiName(state.settings);
  const [thinking, setThinking] = useState(false);
  const circleNow = () => members.map((m) => `${m.id === me ? 'the asker' : names[m.id]?.name || 'member'}: ${m.day === today ? `${m.prayers}/5 prayers, ${m.done}/${m.total} habits` : 'not marked today'}`).join('; ');
  // «Ответ на их языке»: my text goes out in the language the others write in, with a mark for them
  useTrSettings();
  const offer = offerOn(chat.code) && !topic;
  const langs = offer ? chatLangs(chat.msgs, me) : [];
  const saved = offer ? outLang(chat.code) : '';
  const outLangs = saved && !langs.includes(saved) ? [...langs, saved] : langs;
  const outTo = saved;
  const [outOpen, setOutOpen] = useState(false);
  const [prev, setPrev] = useState<{ src: string; to: string; text: string; err?: string } | null>(null);
  const outSrc = text.trim();
  const outNow = Boolean(outTo && outSrc && !file && !callsAi(outSrc, myAi));
  useEffect(() => {
    if (!outNow || !chat.code || (prev && prev.src === outSrc && prev.to === outTo)) return;
    const h = setTimeout(async () => {
      const r = await translateOut(outSrc, outTo, chat.code as string);
      setPrev({ src: outSrc, to: outTo, text: r.text || '', err: r.err });
    }, 700);
    return () => clearTimeout(h);
  }, [outSrc, outTo, outNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevNow = prev && prev.src === outSrc && prev.to === outTo ? prev : null;

  const send = async (body = text, kind: 'text' | 'event' = 'text') => {
    if (!body.trim()) return;
    let r = ref;
    let out = body;
    if (kind === 'text' && body === text && outNow && chat.code) {
      const src = body.trim();
      let tx = prevNow?.text || '';
      if (!tx) {
        setSending(true);
        const res = await translateOut(src, outTo, chat.code);
        setSending(false);
        tx = res.text || '';
        if (!tx) { flash(_t("Перевод не получился. Нажми ещё раз или выбери «Как есть»")); return; }
      }
      out = tx;
      r = { ...(r ?? {}), tl: LANG, tt: outTo };
      rememberSent(tx, src);
      setOutOpen(false);
    }
    if (body === text) setText('');
    setRef(null);
    const ok = await chat.send(out, r, kind);
    if (!ok || kind !== 'text' || topic || !chat.ai.ready || !callsAi(body, myAi)) return;
    if (!chat.ai.on) { flash(_t("Владелец круга выключил помощника в этом круге")); return; }
    setThinking(true);
    const res = await chat.askAi(body, { name: myAi, me: state.settings.me, lang: state.settings.lang, place: placeOf(state.settings), circle: circleNow() });
    setThinking(false);
    if (res.err) flash(res.err === 'limit' ? _t("На сегодня помощник в круге ответил уже 20 раз. Завтра снова") : res.err === 'off' ? _t("Владелец круга выключил помощника в этом круге") : _t("Помощник сейчас не ответил. Попробуй ещё раз"));
    if (res.dua) { setAskFor(chat.code, { t: res.dua, d: today }); flash(_t("Просьба о дуа записана в круге")); }
  };

  const recorder = useRecorder(async (blob, sec, bars) => {
    setSending(true);
    const e = await chat.sendVoice(blob, sec, bars, ref);
    setSending(false);
    if (!e) setRef(null);
    else flash(e === 'voice_off' ? _t("Владелец круга выключил голосовые") : e === 'big' ? _t("Слишком длинное голосовое") : _t("Голосовое не отправилось. Попробуй ещё раз"));
  });

  const replyTo = (m: Msg) => { setRef({ r: m.id }); setMenu(null); setTimeout(() => ta.current?.focus(), 50); };

  // long press opens the menu
  const press = useRef<{ t?: number; x: number; y: number }>({ x: 0, y: 0 });
  const holdProps = (m: Msg) => ({
    onPointerDown: (e: React.PointerEvent) => { press.current = { x: e.clientX, y: e.clientY, t: window.setTimeout(() => { try { navigator.vibrate?.(12); } catch { /* */ } setMenu(m); }, 450) }; },
    onPointerMove: (e: React.PointerEvent) => { if (Math.abs(e.clientX - press.current.x) + Math.abs(e.clientY - press.current.y) > 12) clearTimeout(press.current.t); },
    onPointerUp: () => clearTimeout(press.current.t),
    onPointerCancel: () => clearTimeout(press.current.t),
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setMenu(m); },
  });

  const chatPushOn = state.settings.reminders?.on && state.settings.reminders.chat !== false;
  const toggleChatPush = async () => {
    const r = state.settings.reminders;
    if (chatPushOn) { update((s) => ({ ...s, settings: { ...s.settings, reminders: { ...(s.settings.reminders ?? DEFAULT_PREFS), chat: false } } })); flash(_t("Уведомления о сообщениях выключены")); return; }
    const next = { ...(r ?? { ...DEFAULT_PREFS, prayers: [] }), on: true, chat: true };
    if (!r?.on || !(await currentSubscription())) {
      const err = await enablePush(state.settings, next);
      if (err) { flash(err === 'ios-install' ? _t("На iPhone сначала добавь приложение на экран «Домой»") : err === 'denied' ? _t("Уведомления запрещены в настройках браузера") : _t("Этот браузер не умеет уведомления")); return; }
    }
    update((s) => ({ ...s, settings: { ...s.settings, reminders: next } }));
    flash(_t("Уведомления о сообщениях включены. Во время намаза они ждут"));
  };

  const reply = ref?.r ? byId.get(ref.r) : null;
  let lastDay = '';
  let lastPer = '';
  let newLine = false;
  let ayahShown = false;
  const nowP = main ? prayerOfNow(state) : '';
  const prayed = (p: string) => chat.msgs.some((m) => m.uid === me && m.ref?.t === 'pr' && m.ref.p === p && m.ref.d === today && !m.deleted);
  const sayPrayed = () => { if (nowP && !prayed(nowP)) chat.send(_t("помолился {0}", PRAYER[nowP]), { t: 'pr', p: nowP, d: today }, 'event'); };
  // «X, Y помолились Аср»: one line per prayer and day, shown where the latest one is.
  const prGroups = new Map<string, string[]>();
  const prLast = new Map<string, number>();
  for (const m of chat.msgs) if (m.kind === 'event' && m.ref?.t === 'pr' && !m.deleted) { const k = `${m.ref.d}|${m.ref.p}`; const l = prGroups.get(k) ?? []; if (!l.includes(m.uid)) l.push(m.uid); prGroups.set(k, l); prLast.set(k, m.id); }
  // Several trip events in a row («Юсуф едет», «назначил амира») fold into one line until tapped.
  const foldOf = new Map<number, number>(); // message id → first id of its run
  const foldN = new Map<number, number>(); // first id → run length
  {
    let run: number[] = [];
    let runDay = '';
    const flush = () => { if (run.length >= 2) { foldN.set(run[0], run.length); for (const id of run) foldOf.set(id, run[0]); } run = []; };
    for (const m of chat.msgs) {
      const plain = m.kind === 'event' && m.ref?.tr && !m.ref?.um && !m.ref?.t && !m.deleted;
      if (plain && (!run.length || dayKey(m.at) === runDay)) { if (!run.length) runDay = dayKey(m.at); run.push(m.id); }
      else { flush(); if (plain) { runDay = dayKey(m.at); run.push(m.id); } }
    }
    flush();
  }
  const ayah = DAY_AYAHS[Math.floor(Date.parse(today) / 86400000) % DAY_AYAHS.length];
  const ayahCard = main && ayah ? (
    <div key="ayah" className="cc-ayah">
      <small><IcT t={_t("📖 Аят дня")} /></small>
      <p lang="ar" dir="rtl">{ayah.ar}</p>
      <span>«{isEn ? ayah.en : ayah.ru}»</span>
      <small>{isEn ? `${ayah.ne} ${ayah.s}:${ayah.a}` : _t("Коран, {0} {1}:{2}", ayah.n, ayah.s, ayah.a)}</small>
    </div>
  ) : null;
  const quick: [string, () => void][] = main
    ? (nowP ? [[prayed(nowP) ? _t("✓ Ты помолился {0}", PRAYER[nowP]) : _t("✅ Помолился {0}", PRAYER[nowP]), sayPrayed]] : [])
    : QUICK.map((t) => [t, () => send(t)]);
  // the 📎 sheet, like WhatsApp: attachments first, then the circle's own things
  const sheet: ChatAction[] = main ? [
    ...(chat.filesOn ? [
      { ic: '📄', label: _t("Документ"), c: '#7f66ff', run: () => pickKind(false) },
      { ic: '📷', label: _t("Камера"), c: '#ff2e74', run: () => pickKind(true, true) },
      { ic: '🖼', label: _t("Галерея"), c: '#bf59cf', run: () => pickKind(true) },
    ] : []),
    ...(locTile ? [{ ic: '📍', label: _t("Место"), c: '#11553a', run: () => setLocSheet(true) }] : []),
    ...(actions ?? []),
    { ic: 'mosque-go', label: _t("Иду в мечеть"), c: '#1f7a4d', run: () => send(_t("📍 Иду в мечеть")) },
    ...(nowP && !prayed(nowP) ? [{ ic: 'prayed', label: _t("Помолился"), c: '#25a35a', run: sayPrayed }] : []),
  ] : [];

  return (
    <div className="cc">
      <div className="cc-bar">
        <span>{main ? '' : _tj("{0}  {1} · видят только люди круга", members.length, plural(members.length, _t("участник"), _t("участника"), _t("участников")))}</span>
        <button type="button" className="cc-dots" aria-label={_t("Настройки чата")} onClick={() => setOpts((v) => !v)}>⋯</button>
      </div>
      {opts && (
        <div className="cc-opts">
          <button type="button" onClick={toggleChatPush}>{chatPushOn ? _t("🔔 Уведомления о сообщениях: вкл") : _t("🔕 Уведомления о сообщениях: выкл")}</button>
          {isOwner && <button type="button" onClick={async () => { const on = !chat.voiceOn; if (await chat.setVoice(on)) flash(on ? _t("Голосовые включены") : _t("Теперь в круге только текст")); }}><IcT t={chat.voiceOn ? _t("🎙 Голосовые в круге: вкл") : _t("🎙 Голосовые в круге: выкл (только текст)")} /></button>}
          {isOwner && locOk && loc.data && <button type="button" onClick={async () => { const on = !loc.data!.on; if (await loc.setOn(on)) flash(on ? _t("Место в круге включено") : _t("Место в круге выключено")); }}><IcT t={loc.data.on ? _t("📍 Место в круге: вкл") : _t("📍 Место в круге: выкл")} /></button>}
          {isOwner && chat.ai.ready && <button type="button" onClick={async () => { const on = !chat.ai.on; if (await chat.setAi(on, chat.ai.all)) flash(on ? _t("Помощник в круге включён") : _t("Помощника в круге больше нет")); }}>{chat.ai.on ? _t("✨ Помощник в круге: вкл") : _t("✨ Помощник в круге: выкл")}</button>}
          {isOwner && chat.ai.ready && chat.ai.on && <button type="button" onClick={async () => { const all = chat.ai.all === 'all' ? 'owner' : 'all'; if (await chat.setAi(true, all)) flash(all === 'all' ? _t("Напомнить всем может любой участник") : _t("Напомнить всем может только амир")); }}>{chat.ai.all === 'all' ? _t("📣 Напоминания всем: любой участник") : _t("📣 Напоминания всем: только амир")}</button>}
          {chat.ai.ready && chat.ai.on && <small>{_tj("Напиши «@{0}», чтобы попросить помощника: напомнить тебе или всем, записать просьбу о дуа, рассказать итоги круга. Без «@» он переписку не читает.", myAi)}</small>}
          <small>{_tj("Долгое нажатие на сообщение: ответить, реакция, пожаловаться{0}.", isOwner ? _t(", удалить любое (ты владелец круга)") : _t(", удалить своё"))}</small>
        </div>
      )}
      {quiet && <div className="cc-quiet">{_tj("🕌 Сейчас {0}. Уведомления придут после намаза", quiet)}</div>}

      <div className="cc-list">
        {chat.more && <button type="button" className="link-btn cc-older" onClick={() => chat.older()}>{_t("Показать раньше")}</button>}
        {!chat.msgs.length && (
          <div className="cc-empty">
            <i>💬</i>
            <b>{_t("Здесь пока тихо")}</b>
            <p>{_tj("Напиши братьям «Ассаляму алейкум» или ответь на просьбу о дуа. Сообщения видят только люди «{0}».", title)}</p>
          </div>
        )}
        {chat.msgs.map((m) => {
          const out: React.ReactNode[] = [];
          const dk = dayKey(m.at);
          if (dk !== lastDay) {
            lastDay = dk;
            const fri = new Date(m.at).getDay() === 5;
            out.push(<div key={`d${m.id}`} className="cc-day"><span>{dayLabel(m.at)}{fri ? _t(" · Джума мубарак 🕌") : ''}</span></div>);
            lastPer = '';
            if (dk === dayKey(new Date().toISOString()) && ayahCard) { out.push(ayahCard); ayahShown = true; }
          }
          if (main) {
            const per = periodOf(state, m.at);
            const pk = per ? `${dk}|${per[1]}` : '';
            if (per && pk !== lastPer) {
              lastPer = pk;
              out.push(<div key={`p${m.id}`} className="cc-per"><span>{PRAYER[per[1]]} · {hm(new Date(per[0]).toISOString())}</span></div>);
            }
          }
          if (!newLine && chat.seenAtOpen != null && m.id > chat.seenAtOpen && m.uid !== me && !m.pending) {
            newLine = true;
            const nNew = chat.msgs.filter((x) => x.id > (chat.seenAtOpen ?? 0) && x.uid !== me && !x.pending && !x.deleted).length;
            out.push(<div key={`n${m.id}`} className="cc-new"><span>{nNew > 0 ? `${nNew} ${plural(nNew, _t("непрочитанное сообщение"), _t("непрочитанных сообщения"), _t("непрочитанных сообщений"))}` : _t("Новые сообщения")}</span></div>);
          }
          const mine = m.uid === me;
          const rs = Object.entries(m.reacts || {});
          const groups = rs.reduce<Record<string, string[]>>((a, [u, e]) => { (a[e] ??= []).push(u); return a; }, {});

          if (m.kind === 'event' && m.ref?.t === 'dua') {
            const ask = { t: m.body, d: m.ref.d || today };
            const got = askAnswers(reacts, m.uid, ask);
            const done = got.includes(me);
            out.push(
              <div key={m.id} className="cc-ev" {...holdProps(m)}>
                <p><Ic e="dua" cls="lead" /><b>{mine ? _t("Ты просишь дуа") : _t("{0} просит дуа", nm(m.uid))}</b></p>
                <q>{m.deleted ? _t("Просьба снята") : m.body}</q>
                {!m.deleted && (
                  <div className="cc-ev-row">
                    {mine ? <small>{got.length ? <IcT t={_t("🤲 Дуа сделали: {0}", got.map(nm).join(', '))} /> : _t("Пока никто не ответил")}</small> : (
                      <button type="button" className={done ? 'on' : ''} onClick={() => { if (!done) { onAmin(m.uid); chat.send(_t("🤲 Амин"), { r: m.id }); } }}>{done ? _t("✓ Ты сделал дуа") : <IcT t={_t("🤲 Амин")} />}{got.length ? ` · ${got.length}` : ''}</button>
                    )}
                    <button type="button" onClick={() => replyTo(m)}>{_t("Ответить")}</button>
                  </div>
                )}
              </div>,
            );
            return out;
          }
          if (m.kind === 'event' && m.ref?.t === 'pr') {
            const k = `${m.ref.d}|${m.ref.p}`;
            if (prLast.get(k) !== m.id) return out;
            const who = (prGroups.get(k) ?? []).map((u) => (u === me ? _t("Ты") : nm(u)));
            out.push(<div key={m.id} className="cc-sys cc-pr">✅ <b>{who.join(', ')}</b> {who.length > 1 || who[0] === _t("Ты") ? _t("помолились {0}", PRAYER[m.ref.p || ''] || '') : _t("помолился {0}", PRAYER[m.ref.p || ''] || '')}</div>);
            return out;
          }
          if (m.kind === 'event' && m.ref?.t === 'poll') {
            const o = (m.ref.o ?? []).slice(0, 4);
            const votes = o.map((_, i) => rs.filter(([, e]) => e === POLL_E[i]).map(([u]) => u));
            const total = votes.reduce((n, v) => n + v.length, 0);
            const myV = POLL_E.indexOf(m.reacts?.[me] ?? '');
            out.push(
              <div key={m.id} className="cc-poll" {...holdProps(m)}>
                <p>📊 <b>{mine ? _t("Твой опрос") : _t("Опрос от {0}", nm(m.uid))}</b></p>
                <q>{m.deleted ? _t("Опрос удалён") : m.body}</q>
                {!m.deleted && o.map((t, i) => (
                  <button key={i} type="button" className={myV === i ? 'on' : ''} onClick={() => chat.react(m.id, POLL_E[i])}>
                    <i style={{ width: `${total ? (votes[i].length / total) * 100 : 0}%` }} />
                    <span>{myV === i ? '✓ ' : ''}{t}</span><em title={votes[i].map(nm).join(', ')}>{votes[i].length}</em>
                  </button>
                ))}
                {!m.deleted && <small>{total ? _tj("Голосов: {0}. Нажми ещё раз, чтобы снять свой", total) : _t("Пока никто не голосовал")}</small>}
              </div>,
            );
            return out;
          }
          if (m.kind === 'event' && m.ref?.t === 'in') {
            const k = (m.ref.k || 'job') as IntentKind;
            const im = INTENTS[k] ?? INTENTS.job;
            out.push(
              <div key={m.id} className={`cc-in-card i-${im.cls}`}>
                <span><Ic e={im.ic} cls="lead" /><b>{mine ? _t("Ты") : nm(m.uid)}</b> {m.body}</span>
                {!mine && <small>{_t("Знаешь, кто может помочь? Подскажи или напиши.")}</small>}
                <div className="cc-ev-row">
                  {personOk() && <button type="button" onClick={() => openPerson(m.uid)}>{mine ? _t("Мой профиль") : _t("Открыть профиль")}</button>}
                  {!mine && <button type="button" onClick={() => { setText(`${nm(m.uid).split(' ')[0]}, `); setRef({ r: m.id }); setTimeout(() => ta.current?.focus(), 50); }}>{_t("Подсказать")}</button>}
                </div>
                <small className="cc-time">{hm(m.at)}</small>
              </div>,
            );
            return out;
          }
          if (m.kind === 'event' && m.ref?.t === 'post') {
            out.push(
              <div key={m.id} className="cc-post">
                <b>📣 {mine ? _t("Твой новый пост") : _tj("Новый пост · {0}", nm(m.uid))}</b>
                <span>{m.body.replace(/\s+/g, ' ')}</span>
                {onPost && <button type="button" onClick={() => onPost(Number(m.ref?.p))}>{_t("Открыть пост")}</button>}
                <small className="cc-time">{hm(m.at)}</small>
              </div>,
            );
            return out;
          }
          if (m.kind === 'event' && m.ref?.t === 'bz') {
            const k = m.ref.k === 'e' ? 'event' : m.ref.k === 'd' ? 'dec' : 'task';
            out.push(
              <div key={m.id} className={`cc-bz b-${k}`}>
                <span><b>{mine ? _t("Ты") : nm(m.uid)}</b> · {m.body}</span>
                {biz && !m.deleted && <button type="button" onClick={() => biz.open(k)}>{k === 'task' ? _t("Дела ›") : k === 'event' ? _t("Календарь ›") : _t("План ›")}</button>}
                <small className="cc-time">{hm(m.at)}</small>
              </div>,
            );
            return out;
          }
          if (m.kind === 'event' && m.ref?.um) {
            // A call to an umrah trip: the person called gets a card with a button, the others a plain line.
            const forMe = m.ref.to === me;
            out.push(forMe && !m.deleted ? (
              <div key={m.id} className="cc-um">
                <i aria-hidden="true">🕋</i>
                <span><small>{_tj("{0} зовёт тебя на умру", nm(m.uid))}</small><b>{/«(.+)»/.exec(m.body)?.[1] ?? _t("Умра")}</b></span>
                {onUmrah && <button type="button" onClick={() => onUmrah(m.ref!.um!)}>{_t("Открыть")}</button>}
              </div>
            ) : (
              <div key={m.id} className="cc-sys cc-trip">{mine ? _t("Ты") : nm(m.uid)}: {m.body}{onUmrah && !m.deleted && <> · <button type="button" className="link-btn" onClick={() => onUmrah(m.ref!.um!)}>{_t("поездка ›")}</button></>}</div>
            ));
            return out;
          }
          if (m.kind === 'event' && foldOf.has(m.id) && !unfold.includes(foldOf.get(m.id)!)) {
            const f = foldOf.get(m.id)!;
            if (f === m.id) out.push(<button key={m.id} type="button" className="cc-sys cc-trip cc-fold" onClick={() => setUnfold((u) => [...u, f])}>🕋 {_tj("{0} событий группы ›", foldN.get(f) ?? 0)}</button>);
            return out;
          }
          if (m.kind === 'event') {
            out.push(<div key={m.id} className={`cc-sys${m.ref?.tr ? ' cc-trip' : ''}`}>{m.ref?.tr ? '🕋' : '⚔️'} {m.ref?.tr ? names[m.uid]?.name || _t("Участник") : mine ? _t("Ты") : nm(m.uid)} {m.body}</div>);
            return out;
          }

          if (m.kind === 'ai') {
            const live = m.ref?.at && Object.prototype.hasOwnProperty.call(chat.ai.mine, m.id);
            const on = Boolean(chat.ai.mine[m.id]);
            const asker = m.uid === me;
            const at = m.ref?.at ? new Date(m.ref.at) : null;
            out.push(
              <div key={m.id} className="cc-row cc-ai-row">
                <div className="cc-ai" {...holdProps(m)}>
                  <b className="cc-ai-who"><i aria-hidden="true" />{m.ref?.n || _t("Помощник")} <small>↩ {asker ? _t("тебе") : nm(m.uid)}</small></b>
                  {m.deleted ? <span className="cc-gone">{_t("Сообщение удалено")}</span> : <span className="cc-t">{m.body}</span>}
                  {at && !m.deleted && (
                    <div className={`cc-ai-card${live ? '' : ' off'}`}>
                      <b>⏰ {at.toLocaleString(LOC, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{m.ref?.all ? _t(" · для всех") : ''}</b>
                      <span>{live ? m.ref?.rt : _t("Напоминание отменено или уже прошло")}</span>
                    </div>
                  )}
                  {live && at && at.getTime() > Date.now() && (
                    <div className="cc-ai-btns">
                      {on ? <button type="button" onClick={async () => { if (await chat.aiPing(m.id, 'notme')) flash(_t("Тебе не напомню")); }}>{_t("Не напоминать мне")}</button>
                        : <button type="button" className="on" onClick={async () => { if (await chat.aiPing(m.id, 'me')) flash(_t("Напомню и тебе")); }}>{m.ref?.all ? _t("Напоминать мне") : _t("Мне тоже")}</button>}
                      {(asker || isOwner) && <button type="button" onClick={async () => { if (!confirm(_t("Отменить это напоминание для всех, кому оно стоит?"))) return; if (await chat.aiPing(m.id, 'cancel')) flash(_t("Напоминание отменено")); }}>{_t("Отменить")}</button>}
                    </div>
                  )}
                  <small className="cc-time">{hm(m.at)}</small>
                </div>
              </div>,
            );
            return out;
          }
          const q = m.ref?.r ? byId.get(m.ref.r) : null;
          out.push(
            <div key={m.id} className={`cc-row${mine ? ' mine' : ''}`}>
              {!mine && <Ava id={m.uid} names={names} />}
              <div className={`cc-m${mine ? ' mine' : ''}${m.failed ? ' failed' : ''}`} {...holdProps(m)} onClick={m.failed ? () => chat.retry(m) : undefined}>
                {!mine && <b className="cc-who" onClick={personOk() ? (e) => { e.stopPropagation(); openPerson(m.uid); } : undefined}>{nm(m.uid)}<FounderMark uid={m.uid} /></b>}
                {q && <span className="cc-q"><b>{nm(q.uid)}</b>{q.deleted ? _t("Сообщение удалено") : shortOf(q)}</span>}
                {!q && m.ref?.t === 'st' && m.ref.to && <span className="cc-q cc-st"><b>{m.ref.to === me ? _t("Ответ на твою сторис") : _t("Ответ на сторис: {0}", nm(m.ref.to))}</b>{[m.ref.n, m.ref.k].filter(Boolean).join(' ')}</span>}
                {m.deleted ? <span className="cc-gone">{_t("Сообщение удалено")}</span> : m.ref?.t === 'loc' ? <LocCard m={m} mine={mine} live={loc.data?.live ?? []} onMap={() => { setLiveMap(true); loc.reload(); }} />
                  : m.kind === 'voice' ? <Voice m={m} chat={chat} mine={mine} />
                  : m.kind === 'photo' && m.file ? <><Photo m={m} chat={chat} onOpen={setView} />{m.body && <TrText id={m.id} text={m.body} code={chat.code} mine={mine} cls="cc-t cc-cap" />}</>
                  : m.kind === 'file' && m.file ? <><FileCard m={m} chat={chat} />{m.body && <TrText id={m.id} text={m.body} code={chat.code} mine={mine} cls="cc-t cc-cap" />}</>
                  : <TrText id={m.id} text={m.body} code={chat.code} mine={mine} tl={m.ref?.tl} tt={m.ref?.tt} />}
                <small className="cc-time">{m.failed ? <IcT t={_t("⚠ Не отправлено · нажми, чтобы повторить")} /> : <>{hm(m.at)}{mine ? (m.pending ? <> <Ic e="clock" cls="rx" /></> : <> <Ticks s={chat.readOf(m)?.state ?? 'sent'} /></>) : ''}</>}</small>
              </div>
              {rs.length > 0 && (
                <div className="cc-rs">
                  {Object.entries(groups).map(([e, us]) => <button key={e} type="button" data-e={e} className={us.includes(me) ? 'on' : ''} title={us.map(nm).join(', ')} onClick={() => chat.react(m.id, e)}><Rx e={e} /> {us.length}</button>)}
                </div>
              )}
            </div>,
          );
          return out;
        })}
        {!ayahShown && ayahCard}
        <div ref={end} />
      </div>

      {thinking && <div className="cc-ai-wait"><i aria-hidden="true" />{_tj("{0} пишет…", myAi)}</div>}
      {(note || chat.error || recorder.msg) && <div className="cc-note" onClick={() => recorder.setMsg('')}>{note || recorder.msg || chat.error}</div>}

      <div className="cc-compose">
        {notice}
        {reply && (
          <div className="cc-reply">
            <span><b>{_tj("Ответ {0}", reply.uid === me ? _t("себе") : nm(reply.uid))}</b>{shortOf(reply, 80)}</span>
            <button type="button" aria-label={_t("Отменить ответ")} onClick={() => setRef(null)}>✕</button>
          </div>
        )}
        {!reply && ref?.t === 'dua' && ref.to && (
          <div className="cc-reply">
            <span><b>{_t("Ответ на просьбу о дуа")}</b>{nm(ref.to)}</span>
            <button type="button" aria-label={_t("Отменить ответ")} onClick={() => setRef(null)}>✕</button>
          </div>
        )}
        {recorder.rec ? (
          <div className="cc-rec">
            <span className="cc-rec-t"><i className="cc-dot" /> <b>0:{String(recorder.sec).padStart(2, '0')}</b> <small>{_tj("до {0} сек", MAX_SEC)}</small></span>
            {recorder.rec.locked ? (
              <>
                <button type="button" className="link-btn" onClick={() => recorder.stop(true)}>{_t("Отменить")}</button>
                <button type="button" className="cc-send" aria-label={_t("Отправить голосовое")} onClick={() => recorder.stop(false)}><Ic e="send" /></button>
              </>
            ) : (
              <>
                <small className="cc-swipe">{_t("‹ влево, чтобы отменить")}</small>
                <span className="cc-mic big" aria-hidden="true"><Ic e="mic" /></span>
              </>
            )}
          </div>
        ) : (
          <>
            {quick.length > 0 && <div className="cc-quick">{quick.map(([t, f]) => <button key={t} type="button" onClick={f}><IcT t={t} rx /></button>)}</div>}
            {file && (
              <div className="cc-reply cc-pick">
                <span><b>{/^image\//.test(file.type) ? _t("📷 Фото") : `${iconOf(file.name)} ${_t("Файл")}`}</b>{file.name} · {sizeOf(file.size)}</span>
                <button type="button" aria-label={_t("Убрать файл")} onClick={() => setFile(null)}>✕</button>
              </div>
            )}
            {chat.ai.ready && chat.ai.on && !topic && /(^|\s)@[^\s@]{0,12}$/.test(text) && (
              <button type="button" className="cc-ai-sug" onClick={() => { setText(text.replace(/@[^\s@]{0,12}$/, `@${myAi} `)); ta.current?.focus(); }}><i aria-hidden="true" /><b>{myAi}</b> · {_t("помощник")}</button>
            )}
            {offer && outLangs.length > 0 && !file && (outOpen || outNow) && (
              <div className="tr-out">
                <div className="tr-out-h">
                  <b><Globe />{_t("Уйдёт так")}</b>
                  <span className="tr-chips">
                    {outLangs.map((k) => <button key={k} type="button" className={outTo === k ? 'on' : ''} aria-pressed={outTo === k} onClick={() => { setOutLang(chat.code as string, k); setOutOpen(true); }}>{langName(k)}</button>)}
                    <button type="button" className={!outTo ? 'on' : ''} aria-pressed={!outTo} onClick={() => { setOutLang(chat.code as string, ''); setOutOpen(false); }}>{_t("Как есть")}</button>
                  </span>
                </div>
                {outNow && (
                  <p className={`tr-out-t${prevNow?.text ? '' : ' wait'}`} dir="auto">
                    {prevNow?.text || (prevNow?.err ? _t("Перевод не получился, нажми «Отправить» ещё раз") : _t("Перевожу…"))}
                  </p>
                )}
                {outTo
                  ? <small>{members.length === 2 ? _tj("{0} увидит пометку «переведено {1}»", nm(members.find((x) => x.id !== me)?.id || ''), fromLabel(LANG)) : _tj("Все увидят пометку «переведено {0}»", fromLabel(LANG))}</small>
                  : <small>{_t("Выбери язык, и сообщение уйдёт переведённым. Пишешь как обычно")}</small>}
              </div>
            )}
            <div className="cc-in">
              <input ref={fileIn} type="file" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
              {!main && chat.filesOn && <button type="button" className="cc-clip" disabled={sending} aria-label={_t("Прикрепить фото или файл")} onClick={() => fileIn.current?.click()}>{sending ? '…' : <Ic e="clip" />}</button>}
              <div className={main ? 'cc-field' : 'cc-field plain'}>
              <textarea ref={ta} rows={1} value={text} maxLength={2000} placeholder={file ? _t("Подпись, можно без неё") : ref ? _t("Ответ…") : placeholder ?? _t("Написать в круг…")}
                onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(110, e.target.scrollHeight)}px`; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); if (file) sendFile(); else send(); } }} />
              {main && <button type="button" className="cc-plus" disabled={sending} aria-label={_t("Прикрепить и действия круга")} onClick={() => setPlus(true)}>{sending ? '…' : <ClipIcon />}</button>}
              {main && chat.filesOn && !text.trim() && !file && <button type="button" className="cc-cam" disabled={sending} aria-label={_t("Камера")} onClick={() => pickKind(true, true)}><CamIcon /></button>}
              </div>
              {offer && outLangs.length > 0 && !file && (
                <button type="button" className={`tr-out-btn${outTo ? ' on' : ''}`} aria-expanded={outOpen || outNow} aria-label={outTo ? _tj("Уйдёт {0}. Сменить язык", inLabel(outTo)) : _t("Ответить на их языке")} onClick={() => setOutOpen((o) => !o)}>
                  <Globe />{outTo && <b>{outTo.toUpperCase()}</b>}
                </button>
              )}
              {file || text.trim() || !recorder.supported || !chat.voiceOn ? (
                <button type="button" className="cc-send" disabled={(!text.trim() && !file) || sending} aria-label={_t("Отправить")} onClick={() => { if (file) sendFile(); else send(); if (ta.current) ta.current.style.height = 'auto'; }}><Ic e="send" /></button>
              ) : (
                <button type="button" className="cc-mic" disabled={sending} aria-label={_t("Удерживай, чтобы записать голосовое")}
                  onPointerDown={(e) => { e.preventDefault(); recorder.start(e.clientX); }}
                  onContextMenu={(e) => e.preventDefault()}>{sending ? '…' : <Ic e="mic" />}</button>
              )}
            </div>
          </>
        )}
      </div>

      {plus && actions && (
        <>
          <div className="dim" onClick={() => setPlus(false)} />
          <div className="sheet cc-acts" role="dialog" aria-label={_t("Действия круга")}>
            <div className="cc-acts-g">
              {sheet.map((a) => <button key={a.label} type="button" onClick={() => { setPlus(false); a.run(); }}><span><Ic e={a.ic} /></span>{a.label}</button>)}
            </div>
            <button type="button" className="link-btn" onClick={() => setPlus(false)}>{_t("Закрыть")}</button>
          </div>
        </>
      )}
      {locSheet && chat.code && <LocSheet code={chat.code} send={(b, r) => chat.send(b, r)} onClose={() => setLocSheet(false)} flash={flash} />}
      {liveMap && chat.code && <LiveMap code={chat.code} me={me} names={names} live={loc.data?.live ?? []} onClose={() => setLiveMap(false)} flash={flash} />}
      {view && (
        <div className="cc-view" onClick={() => setView('')}>
          <img src={view} alt="" />
          <div className="cc-view-bar" onClick={(e) => e.stopPropagation()}>
            <a href={view} download="photo.jpg">{_t("Скачать")}</a>
            <button type="button" onClick={() => setView('')}>{_t("Закрыть")}</button>
          </div>
        </div>
      )}
      {menu && (
        <>
          <div className="dim" onClick={() => setMenu(null)} />
          <div className="cc-menu" role="dialog" aria-label={_t("Сообщение")}>
            {!menu.deleted && menu.kind !== 'event' && <div className="cc-emo">{EMOJI.map((e) => <button key={e} type="button" data-e={e} aria-label={RX_NAME[e] ?? e} className={menu.reacts?.[me] === e ? 'on' : ''} onClick={() => { chat.react(menu.id, e); setMenu(null); }}><Rx e={e} /></button>)}</div>}
            {menu.uid === me && !menu.deleted && (() => { const r = chat.readOf(menu); if (!r || !r.tot) return null; return <p className="cc-read">{r.by.length ? <><Ticks s={r.state} /> {_t("Прочитали:")} {r.by.map(nm).join(', ')}</> : <><Ticks s="sent" /> {_t("Ещё никто не прочитал")}</>}{r.by.length && r.by.length < r.tot ? <small>{_tj("Ещё не прочитали: {0}", r.tot - r.by.length)}</small> : null}</p>; })()}
            {biz && !menu.deleted && menu.kind !== 'event' && menu.body.trim() && menu.body !== '…' && <>
              <button type="button" className="cc-bzm" onClick={() => { biz.make('task', menu); setMenu(null); }}><IcT t={_t("📋 Сделать делом")} /></button>
              <button type="button" className="cc-bzm" onClick={() => { biz.make('event', menu); setMenu(null); }}><IcT t={_t("📅 Поставить в календарь")} /></button>
              <button type="button" className="cc-bzm" onClick={() => { biz.make('dec', menu); setMenu(null); }}><IcT t={_t("✅ Записать как решение")} /></button>
            </>}
            {!menu.deleted && <button type="button" onClick={() => replyTo(menu)}><IcT t={_t("↩️ Ответить")} /></button>}
            {!menu.deleted && (menu.kind !== 'voice' || (menu.body && menu.body !== '…')) && <button type="button" onClick={() => { navigator.clipboard?.writeText(menu.body).catch(() => {}); setMenu(null); flash(_t("Скопировано")); }}><IcT t={_t("📋 Скопировать")} /></button>}
            {menu.uid !== me && !menu.deleted && <button type="button" onClick={async () => { const ok = await chat.report(menu.id, 'chat'); setMenu(null); flash(ok ? _t("Жалоба отправлена. Спасибо, разберёмся") : _t("Не получилось отправить жалобу")); }}><IcT t={_t("🚩 Пожаловаться")} /></button>}
            {menu.uid !== me && <button type="button" onClick={async () => { if (!confirm(_t("Скрыть все сообщения {0} и запретить ему приглашать тебя?", nm(menu.uid)))) return; const ok = await blockUser(menu.uid); setMenu(null); flash(ok ? _t("Его сообщения скрыты") : _t("Не получилось")); }}><IcT t={_t("🙈 Скрыть сообщения человека")} /></button>}
            {(menu.uid === me || isOwner) && !menu.deleted && <button type="button" className="danger-t" onClick={async () => { if (!confirm(_t("Удалить сообщение для всех?"))) return; const ok = await chat.remove(menu.id); setMenu(null); flash(ok ? _t("Удалено") : _t("Не получилось удалить")); }}><IcT t={_tj("🗑 Удалить{0}", menu.uid !== me ? _t(" (ты владелец круга)") : '')} /></button>}
            <button type="button" className="link-btn" onClick={() => setMenu(null)}>{_t("Закрыть")}</button>
          </div>
        </>
      )}
    </div>
  );
}

/** WhatsApp-like ticks on my message: one = sent, nobody has read it yet; two grey = some have read it; two brass with a little star = everyone has (our own look, not blue). */
export function Ticks({ s }: { s: ReadState }) {
  const label = s === 'sent' ? _t("Отправлено, ещё не прочитано") : s === 'all' ? _t("Прочитали все") : _t("Прочитано");
  return (
    <svg className={`cc-tick t-${s}`} viewBox="0 0 19 11" width="19" height="11" role="img" aria-label={label}>
      <title>{label}</title>
      {s === 'sent' ? <path d="M3 5.6 6.2 8.8 13 2" /> : <><path d="M1 5.6 4.2 8.8 11 2" /><path d="M6.4 7.6 7.6 8.8 14.4 2" /></>}
      {s === 'all' && <path className="st" d="M16.4 6.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" />}
    </svg>
  );
}

/** Under a dua request on the circle screen: the last answers from the chat and a way to answer. */
export function DuaReplies({ list, names, me, onReply }: { list: Msg[]; names: Names; me: string; onReply: () => void }) {
  const nm = (id: string) => (id === me ? _t("Ты") : names[id]?.name || _t("Участник"));
  return (
    <div className="cc-dr">
      {list.slice(-2).map((m) => (
        <div key={m.id} className="cc-dr-m"><Ava id={m.uid} names={names} /><span><b>{nm(m.uid)}</b> {shortOf(m)}</span></div>
      ))}
      {list.length > 2 && <small className="tiny">{_tj("И ещё {0} в чате", list.length - 2)}</small>}
      <button type="button" className="link-btn cc-dr-btn" onClick={onReply}>💬 {list.length ? _t("Открыть в чате") : _t("Ответить в чате")}</button>
    </div>
  );
}

/** The circle chat seen through one branch: its messages only, and sends tagged with it. Without a topic, the branches are hidden. */
function useTopic(chat: ChatApi, topic?: string): ChatApi {
  return useMemo(() => {
    const tag = (r?: MsgRef | null): MsgRef | null => (topic ? { ...(r ?? {}), tr: topic } : r ?? null);
    const msgs = chat.msgs.filter((m) => (topic ? m.ref?.tr === topic : !m.ref?.tr));
    const out: ChatApi = {
      ...chat, msgs,
      send: (b, r, k) => chat.send(b, tag(r), k),
      sendVoice: (bl, sec, bars, r) => chat.sendVoice(bl, sec, bars, tag(r)),
      sendFile: (f, c, r) => chat.sendFile(f, c, tag(r)),
    };
    return out;
  }, [chat, topic]);
}

/* Thin line icons in the composer, like WhatsApp: a slanted paper clip and an outline camera */
function ClipIcon() {
  return <svg className="cc-ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>;
}
function CamIcon() {
  return <svg className="cc-ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3.5" /></svg>;
}
