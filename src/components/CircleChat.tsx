import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatApi, Msg, MsgRef } from '../chat';
import type { Member, Reacts } from '../circle';
import { askAnswers } from '../cweek';
import { blockUser } from '../cloud';
import { prayerTimes } from '../prayer';
import { enablePush, currentSubscription, DEFAULT_PREFS } from '../push';
import type { AppState } from '../types';
import { plural } from '../dates';

type Names = Record<string, { name: string; avatarUrl: string; color: string } | undefined>;
export interface Draft { text: string; ref: MsgRef | null; label?: string }

const QUICK = ['🤲 Амин', '✨ МашаАллах', '💪 Я с тобой'];
const EMOJI = ['🤲', '❤️', '✨', '💪', '👍'];
const PRAYER: Record<string, string> = { fajr: 'Фаджр', dhuhr: 'Зухр', asr: 'Аср', maghrib: 'Магриб', isha: 'Иша' };
const MAX_SEC = 60;

const hm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(iso) === dayKey(now.toISOString())) return 'Сегодня';
  if (dayKey(iso) === dayKey(y.toISOString())) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
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

function Ava({ id, names }: { id: string; names: Names }) {
  const p = names[id];
  return p?.avatarUrl ? <img className="cc-ava" src={p.avatarUrl} alt="" /> : <span className="cc-ava" style={{ background: p?.color || '#1f7a4d' }}>{(p?.name || '?').slice(0, 1).toUpperCase()}</span>;
}

function Voice({ m, chat, mine }: { m: Msg; chat: ChatApi; mine: boolean }) {
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
  if (!m.voice) return <span className="cc-gone">🎙 Голосовое больше не доступно</span>;
  const bars = m.bars?.length ? m.bars : Array.from({ length: 24 }, (_, i) => 3 + ((m.id * 7 + i * 13) % 6));
  return (
    <span className={`cc-voice${mine ? ' mine' : ''}`}>
      <button type="button" className="cc-play" onClick={toggle} aria-label={state === 'play' ? 'Пауза' : 'Слушать'}>{state === 'play' ? '❚❚' : state === 'load' ? '…' : '▶'}</button>
      <span className="cc-wave" aria-hidden="true">{bars.map((b, i) => <i key={i} className={i / bars.length < pos ? 'on' : ''} style={{ height: `${4 + b * 2.2}px` }} />)}</span>
      <small>0:{String(m.sec || 0).padStart(2, '0')}</small>
    </span>
  );
}

/** Hold the mic to record, release to send, slide left to cancel. A short tap records hands-free with buttons. */
function useRecorder(onDone: (blob: Blob, sec: number, bars: number[]) => void) {
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
    catch { setMsg('Нет доступа к микрофону. Разреши его в настройках браузера'); return; }
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
      else if (!cancel) setMsg('Слишком коротко. Удерживай кнопку и говори');
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

export function CircleChat({ chat, me, names, members, reacts, today, isOwner, state, update, draft, onDraftUsed, onAmin, title }: {
  chat: ChatApi; me: string; names: Names; members: Member[]; reacts: Reacts; today: string; isOwner: boolean;
  state: AppState; update: (fn: (s: AppState) => AppState) => void;
  draft: Draft | null; onDraftUsed: () => void; onAmin: (asker: string) => void; title: string;
}) {
  const [text, setText] = useState('');
  const [ref, setRef] = useState<MsgRef | null>(null);
  const [menu, setMenu] = useState<Msg | null>(null);
  const [opts, setOpts] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const nm = (id: string) => (id === me ? 'Ты' : names[id]?.name || 'Участник');
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

  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(''), 2600); };

  const send = async (body = text, kind: 'text' | 'event' = 'text') => {
    if (!body.trim()) return;
    const r = ref;
    if (body === text) setText('');
    setRef(null);
    await chat.send(body, r, kind);
  };

  const recorder = useRecorder(async (blob, sec, bars) => {
    setSending(true);
    const e = await chat.sendVoice(blob, sec, bars, ref);
    setSending(false);
    if (!e) setRef(null);
    else flash(e === 'voice_off' ? 'Владелец круга выключил голосовые' : e === 'big' ? 'Слишком длинное голосовое' : 'Голосовое не отправилось. Попробуй ещё раз');
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
    if (chatPushOn) { update((s) => ({ ...s, settings: { ...s.settings, reminders: { ...(s.settings.reminders ?? DEFAULT_PREFS), chat: false } } })); flash('Уведомления о сообщениях выключены'); return; }
    const next = { ...(r ?? { ...DEFAULT_PREFS, prayers: [] }), on: true, chat: true };
    if (!r?.on || !(await currentSubscription())) {
      const err = await enablePush(state.settings, next);
      if (err) { flash(err === 'ios-install' ? 'На iPhone сначала добавь приложение на экран «Домой»' : err === 'denied' ? 'Уведомления запрещены в настройках браузера' : 'Этот браузер не умеет уведомления'); return; }
    }
    update((s) => ({ ...s, settings: { ...s.settings, reminders: next } }));
    flash('Уведомления о сообщениях включены. Во время намаза они ждут');
  };

  const reply = ref?.r ? byId.get(ref.r) : null;
  let lastDay = '';
  let newLine = false;

  return (
    <div className="cc">
      <div className="cc-bar">
        <span>{members.length} {plural(members.length, 'участник', 'участника', 'участников')} · видят только люди круга</span>
        <button type="button" className="cc-dots" aria-label="Настройки чата" onClick={() => setOpts((v) => !v)}>⋯</button>
      </div>
      {opts && (
        <div className="cc-opts">
          <button type="button" onClick={toggleChatPush}>{chatPushOn ? '🔔 Уведомления о сообщениях: вкл' : '🔕 Уведомления о сообщениях: выкл'}</button>
          {isOwner && <button type="button" onClick={async () => { const on = !chat.voiceOn; if (await chat.setVoice(on)) flash(on ? 'Голосовые включены' : 'Теперь в круге только текст'); }}>{chat.voiceOn ? '🎙 Голосовые в круге: вкл' : '🎙 Голосовые в круге: выкл (только текст)'}</button>}
          <small>Долгое нажатие на сообщение: ответить, реакция, пожаловаться{isOwner ? ', удалить любое (ты владелец круга)' : ', удалить своё'}.</small>
        </div>
      )}
      {quiet && <div className="cc-quiet">🕌 Сейчас {quiet}. Уведомления придут после намаза</div>}

      <div className="cc-list">
        {chat.more && <button type="button" className="link-btn cc-older" onClick={() => chat.older()}>Показать раньше</button>}
        {!chat.msgs.length && (
          <div className="cc-empty">
            <i>💬</i>
            <b>Здесь пока тихо</b>
            <p>Напиши братьям «Ассаляму алейкум» или ответь на просьбу о дуа. Сообщения видят только люди «{title}».</p>
          </div>
        )}
        {chat.msgs.map((m) => {
          const out: React.ReactNode[] = [];
          const dk = dayKey(m.at);
          if (dk !== lastDay) {
            lastDay = dk;
            const fri = new Date(m.at).getDay() === 5;
            out.push(<div key={`d${m.id}`} className="cc-day"><span>{dayLabel(m.at)}{fri ? ' · Джума мубарак 🕌' : ''}</span></div>);
          }
          if (!newLine && chat.seenAtOpen && m.id > chat.seenAtOpen && m.uid !== me && !m.pending) {
            newLine = true;
            out.push(<div key={`n${m.id}`} className="cc-new"><span>Новые сообщения</span></div>);
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
                <p>🤲 <b>{mine ? 'Ты просишь дуа' : `${nm(m.uid)} просит дуа`}</b></p>
                <q>{m.deleted ? 'Просьба снята' : m.body}</q>
                {!m.deleted && (
                  <div className="cc-ev-row">
                    {mine ? <small>{got.length ? `🤲 Дуа сделали: ${got.map(nm).join(', ')}` : 'Пока никто не ответил'}</small> : (
                      <button type="button" className={done ? 'on' : ''} onClick={() => { if (!done) { onAmin(m.uid); chat.send('🤲 Амин', { r: m.id }); } }}>{done ? '✓ Ты сделал дуа' : '🤲 Амин'}{got.length ? ` · ${got.length}` : ''}</button>
                    )}
                    <button type="button" onClick={() => replyTo(m)}>Ответить</button>
                  </div>
                )}
              </div>,
            );
            return out;
          }
          if (m.kind === 'event') {
            out.push(<div key={m.id} className="cc-sys">⚔️ {mine ? 'Ты' : nm(m.uid)} {m.body}</div>);
            return out;
          }

          const q = m.ref?.r ? byId.get(m.ref.r) : null;
          out.push(
            <div key={m.id} className={`cc-row${mine ? ' mine' : ''}`}>
              {!mine && <Ava id={m.uid} names={names} />}
              <div className={`cc-m${mine ? ' mine' : ''}${m.failed ? ' failed' : ''}`} {...holdProps(m)} onClick={m.failed ? () => chat.retry(m) : undefined}>
                {!mine && <b className="cc-who">{nm(m.uid)}</b>}
                {q && <span className="cc-q"><b>{nm(q.uid)}</b>{q.deleted ? 'Сообщение удалено' : q.kind === 'voice' ? '🎙 Голосовое' : q.body.slice(0, 90)}</span>}
                {m.deleted ? <span className="cc-gone">Сообщение удалено</span> : m.kind === 'voice' ? <Voice m={m} chat={chat} mine={mine} /> : <span className="cc-t">{m.body}</span>}
                <small className="cc-time">{m.failed ? '⚠ Не отправлено · нажми, чтобы повторить' : <>{hm(m.at)}{mine ? (m.pending ? ' ⏳' : ' ✓') : ''}</>}</small>
              </div>
              {rs.length > 0 && (
                <div className="cc-rs">
                  {Object.entries(groups).map(([e, us]) => <button key={e} type="button" className={us.includes(me) ? 'on' : ''} title={us.map(nm).join(', ')} onClick={() => chat.react(m.id, e)}>{e} {us.length}</button>)}
                </div>
              )}
            </div>,
          );
          return out;
        })}
        <div ref={end} />
      </div>

      {(note || chat.error || recorder.msg) && <div className="cc-note" onClick={() => recorder.setMsg('')}>{note || recorder.msg || chat.error}</div>}

      <div className="cc-compose">
        {reply && (
          <div className="cc-reply">
            <span><b>Ответ {reply.uid === me ? 'себе' : nm(reply.uid)}</b>{reply.kind === 'voice' ? '🎙 Голосовое' : reply.body.slice(0, 80)}</span>
            <button type="button" aria-label="Отменить ответ" onClick={() => setRef(null)}>✕</button>
          </div>
        )}
        {!reply && ref?.t === 'dua' && ref.to && (
          <div className="cc-reply">
            <span><b>Ответ на просьбу о дуа</b>{nm(ref.to)}</span>
            <button type="button" aria-label="Отменить ответ" onClick={() => setRef(null)}>✕</button>
          </div>
        )}
        {recorder.rec ? (
          <div className="cc-rec">
            <span className="cc-rec-t"><i className="cc-dot" /> <b>0:{String(recorder.sec).padStart(2, '0')}</b> <small>до {MAX_SEC} сек</small></span>
            {recorder.rec.locked ? (
              <>
                <button type="button" className="link-btn" onClick={() => recorder.stop(true)}>Отменить</button>
                <button type="button" className="cc-send" aria-label="Отправить голосовое" onClick={() => recorder.stop(false)}>➤</button>
              </>
            ) : (
              <>
                <small className="cc-swipe">‹ влево, чтобы отменить</small>
                <span className="cc-mic big" aria-hidden="true">🎙</span>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="cc-quick">{QUICK.map((t) => <button key={t} type="button" onClick={() => send(t)}>{t}</button>)}</div>
            <div className="cc-in">
              <textarea ref={ta} rows={1} value={text} maxLength={2000} placeholder={ref ? 'Ответ…' : 'Написать в круг…'}
                onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(110, e.target.scrollHeight)}px`; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); send(); } }} />
              {text.trim() || !recorder.supported || !chat.voiceOn ? (
                <button type="button" className="cc-send" disabled={!text.trim()} aria-label="Отправить" onClick={() => { send(); if (ta.current) ta.current.style.height = 'auto'; }}>➤</button>
              ) : (
                <button type="button" className="cc-mic" disabled={sending} aria-label="Удерживай, чтобы записать голосовое"
                  onPointerDown={(e) => { e.preventDefault(); recorder.start(e.clientX); }}
                  onContextMenu={(e) => e.preventDefault()}>{sending ? '…' : '🎙'}</button>
              )}
            </div>
          </>
        )}
      </div>

      {menu && (
        <>
          <div className="dim" onClick={() => setMenu(null)} />
          <div className="cc-menu" role="dialog" aria-label="Сообщение">
            {!menu.deleted && menu.kind !== 'event' && <div className="cc-emo">{EMOJI.map((e) => <button key={e} type="button" className={menu.reacts?.[me] === e ? 'on' : ''} onClick={() => { chat.react(menu.id, e); setMenu(null); }}>{e}</button>)}</div>}
            {!menu.deleted && <button type="button" onClick={() => replyTo(menu)}>↩️ Ответить</button>}
            {!menu.deleted && menu.kind !== 'voice' && <button type="button" onClick={() => { navigator.clipboard?.writeText(menu.body).catch(() => {}); setMenu(null); flash('Скопировано'); }}>📋 Скопировать</button>}
            {menu.uid !== me && !menu.deleted && <button type="button" onClick={async () => { const ok = await chat.report(menu.id, 'chat'); setMenu(null); flash(ok ? 'Жалоба отправлена. Спасибо, разберёмся' : 'Не получилось отправить жалобу'); }}>🚩 Пожаловаться</button>}
            {menu.uid !== me && <button type="button" onClick={async () => { if (!confirm(`Скрыть все сообщения ${nm(menu.uid)} и запретить ему приглашать тебя?`)) return; const ok = await blockUser(menu.uid); setMenu(null); flash(ok ? 'Его сообщения скрыты' : 'Не получилось'); }}>🙈 Скрыть сообщения человека</button>}
            {(menu.uid === me || isOwner) && !menu.deleted && <button type="button" className="danger-t" onClick={async () => { if (!confirm('Удалить сообщение для всех?')) return; const ok = await chat.remove(menu.id); setMenu(null); flash(ok ? 'Удалено' : 'Не получилось удалить'); }}>🗑 Удалить{menu.uid !== me ? ' (ты владелец круга)' : ''}</button>}
            <button type="button" className="link-btn" onClick={() => setMenu(null)}>Закрыть</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Under a dua request on the circle screen: the last answers from the chat and a way to answer. */
export function DuaReplies({ list, names, me, onReply }: { list: Msg[]; names: Names; me: string; onReply: () => void }) {
  const nm = (id: string) => (id === me ? 'Ты' : names[id]?.name || 'Участник');
  return (
    <div className="cc-dr">
      {list.slice(-2).map((m) => (
        <div key={m.id} className="cc-dr-m"><Ava id={m.uid} names={names} /><span><b>{nm(m.uid)}</b> {m.kind === 'voice' ? '🎙 голосовое' : m.body}</span></div>
      ))}
      {list.length > 2 && <small className="tiny">И ещё {list.length - 2} в чате</small>}
      <button type="button" className="link-btn cc-dr-btn" onClick={onReply}>💬 {list.length ? 'Открыть в чате' : 'Ответить в чате'}</button>
    </div>
  );
}
