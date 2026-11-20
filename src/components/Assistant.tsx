import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import { bookGoal, runTool } from '../aiActions';
import { isBookFile, readBook } from '../bookFile';
import { limitOf } from '../plan';
import type { GoTo } from '../guide';
import { dayKey } from '../dates';
import { type AiConfig, type AiMsg, aiName, ask, fold, getAiConfig, getMemory, loadChat, onMemory, saveChat, setAiConfig, setMemory } from '../assistant';
import { authMe } from '../auth';
import { _t, LANG } from '../i18n';
import { hush, listen, speak, sttAvailable, ttsAvailable, type Listening } from '../speech';
import { AI_COLORS, AI_FINISHES, AI_PEOPLE, AI_STYLES, Ai3D, AiFace, badgeUrl, photoToUrl, setAiPhoto, useAiPhoto } from '../aiLook';

interface Props {
  state: AppState;
  onClose: () => void;
  /** Profile → Аккаунт, to sign in by email. */
  onSignIn: () => void;
  /** A fresh summary of the person's data for the assistant, built at the moment of the question. */
  context?: (s: AppState) => string;
  /** Saves the state after the assistant acted (or puts the old one back on «Отменить»). */
  apply?: (s: AppState) => void;
  /** Opens a screen of the app (the chat closes). */
  onGo?: (t: GoTo) => void;
}

const ERR: Record<string, () => string> = {
  limit: () => _t("На сегодня вопросы закончились. Завтра можно продолжить."),
  nokey: () => _t("Помощник ещё не подключён на сервере."),
  refused: () => _t("На это я не могу ответить. Попробуй спросить по-другому."),
  net: () => _t("Нет связи. Проверь интернет и попробуй ещё раз."),
  busy: () => _t("Не получилось ответить. Попробуй через минуту."),
};

/** Full-screen chat with the assistant. The conversation stays on this device. */
export function Assistant({ state, onClose, onSignIn, context, apply, onGo }: Props) {
  const s = state.settings;
  const name = aiName(s);
  const [msgs, setMsgs] = useState<AiMsg[]>(loadChat);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const signed = Boolean(authMe());
  const [rec, setRec] = useState(false);
  const [saying, setSaying] = useState<number | null>(null);
  const mic = useRef<Listening | null>(null);
  const voiceLang = LANG === 'en' ? 'en-US' : 'ru-RU';
  // «Отменить» for the latest batch of actions: the message index and the state from before it.
  const [undo, setUndo] = useState<{ i: number; prev: AppState } | null>(null);
  const live = useRef(state);
  live.current = state;

  useEffect(() => { saveChat(msgs); end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  useEffect(() => () => { mic.current?.abort(); hush(); }, []);

  const say = (i: number, t: string) => {
    if (saying === i) { hush(); setSaying(null); return; }
    setSaying(i);
    speak(t.replace(/[*#_`>]+/g, '').replace(/\n+/g, '. '), false, voiceLang).then(() => setSaying((x) => (x === i ? null : x)));
  };

  const startMic = () => {
    if (busy || rec) return;
    setErr(''); hush(); setSaying(null);
    if (!sttAvailable()) { setErr(_t("Здесь запись голоса не работает. Нажми микрофон на клавиатуре телефона и говори, текст появится в поле.")); return; }
    const before = text.trim();
    const l = listen(voiceLang, (t) => setText(before ? `${before} ${t}` : t), (t0, e) => {
      const t = before ? `${before} ${t0}`.trim() : t0;
      mic.current = null; setRec(false);
      if (e === 'not-allowed' || e === 'service-not-allowed') { setErr(_t("Нет доступа к микрофону. Разреши его в настройках браузера для этого сайта.")); return; }
      if (e && !t) { setErr(_t("Не получилось распознать. Попробуй ещё раз или напиши.")); return; }
      // The text stays in the field: the person reads it, can add more and sends with ➤.
      setText((x) => (t || x).trim());
      setVoiced(Boolean(t));
    });
    if (!l) { setErr(_t("Не получилось включить микрофон.")); return; }
    mic.current = l; setRec(true);
    try { navigator.vibrate?.(10); } catch { /* */ }
  };
  const stopMic = () => mic.current?.stop();
  const cancelMic = () => { mic.current?.abort(); mic.current = null; setRec(false); setText(''); setVoiced(false); };
  const [voiced, setVoiced] = useState(false);
  // The field grows with the text (up to about half the screen), then scrolls inside.
  const field = useRef<HTMLTextAreaElement>(null);
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  useEffect(() => {
    const el = field.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, Math.round(window.innerHeight * 0.42))}px`;
  }, [text]);

  const send = async (q = text, voice = false) => {
    const v = q.trim();
    if (!v || busy) return;
    let hist: AiMsg[] = [...msgs, { role: 'user', content: v, at: Date.now(), ...(voice ? { voice: true } : {}) }];
    setMsgs(hist); setText(''); setVoiced(false); setErr(''); setBusy(true); setUndo(null);
    let cur = live.current;
    let go: GoTo | undefined;
    // The data summary is built once per question: the tool rounds that follow must see the same system prompt,
    // or the model's earlier reasoning in this answer no longer matches it. Tool results tell it what changed.
    let ctx = '';
    try { ctx = context?.(cur) ?? ''; } catch { /* answer without it */ }
    for (let round = 0; round < 5; round++) {
      const r = await ask(hist.slice(-40), s, ctx);
      if ('error' in r) {
        setBusy(false);
        if (r.error === 'signin') { setErr(_t("Чтобы говорить с помощником, войди по почте.")); return; }
        setErr(ERR[r.error]?.() ?? ERR.busy());
        return;
      }
      if (r.left !== undefined && r.left !== null) setLeft(r.left);
      if (!r.calls?.length || !apply) {
        hist = [...hist, { role: 'assistant', content: r.text, at: Date.now() }];
        setMsgs(hist);
        break;
      }
      // The assistant acts: carry out every call on a copy of the state, then save once.
      const before = cur;
      const today = dayKey(new Date());
      const acts: string[] = [];
      const results = r.calls.map((c) => {
        const out = runTool(cur, c, today);
        cur = out.s;
        if (out.go) go = out.go;
        if (out.done.ok && out.done.line) acts.push(out.done.line);
        return { type: 'tool_result', tool_use_id: c.id, content: out.done.result, ...(out.done.ok ? {} : { is_error: true }) };
      });
      if (cur !== before) { apply(cur); setUndo({ i: hist.length, prev: before }); }
      hist = [...hist,
        { role: 'assistant', content: r.text, at: Date.now(), raw: r.content, ...(acts.length ? { acts } : {}) },
        { role: 'user', content: '', at: Date.now(), raw: results, hidden: true }];
      setMsgs(hist);
      if (go) break;
    }
    setBusy(false);
    // Messages that just left the window go into the assistant's memory (in the background).
    if (s.aiMemory !== false) void fold(hist);
    if (go && onGo) setTimeout(() => onGo(go!), acts0(hist) ? 900 : 0);
  };
  const acts0 = (h: AiMsg[]) => h.some((m) => m.acts?.length);
  const undoNow = () => {
    if (!undo || !apply) return;
    apply(undo.prev);
    setMsgs((m) => m.map((x, i) => (i === undo.i ? { ...x, acts: x.acts?.map((a) => `↩ ${a}`) } : x)));
    setUndo(null);
  };

  // 📎 A book file: it goes straight onto the shelf in Книги on this phone. No AI call, the file is not sent anywhere.
  const bookIn = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const attach = async (f?: File) => {
    if (!f || !apply) return;
    setErr('');
    if (!isBookFile(f)) { setErr(_t("Можно прикрепить книгу в PDF или TXT.")); return; }
    if ((live.current.books ?? []).length >= limitOf('books')) { setErr(_t("Полка в Книгах заполнена. Убери одну книгу или открой Pro.")); return; }
    setAdding(true);
    try {
      const b = await readBook(f);
      const cur = live.current;
      apply({ ...cur, books: [...(cur.books ?? []), b] });
      setUndo(null);
      setMsgs((m) => [...m,
        { role: 'user', content: `📎 ${f.name}`, at: Date.now() },
        { role: 'assistant', content: _t("Книга «{0}» на полке в разделе Книги, страниц: {1}. Файл хранится только на этом телефоне.", b.title, b.pages), at: Date.now(), book: b.id }]);
    } catch {
      setErr(_t("Не получилось открыть файл. Возможно, он защищён паролем или повреждён."));
    }
    setAdding(false);
  };
  const goalFor = (i: number, id: string) => {
    const cur = live.current;
    const b = (cur.books ?? []).find((x) => x.id === id);
    if (!b || !apply) return;
    const g = bookGoal(cur, b, dayKey(new Date()));
    apply({ ...cur, goals: [...(cur.goals ?? []), g] });
    setMsgs((m) => m.map((x, k) => (k === i ? { ...x, acts: [...(x.acts ?? []), _t("Новая цель: {0}", g.title)] } : x)));
    setUndo({ i, prev: cur });
  };

  const clear = () => { if (s.aiMemory !== false) void fold(msgs, true); setMsgs([]); setErr(''); };
  const starters = [_t("Что у меня сегодня?"), _t("Как идут мои цели?"), _t("Что ты умеешь?"), _t("Как не пропускать Фаджр?")];

  return (
    <div className={`sess light-sess ai-sess ai-glow-${s.aiGlow || 'ring'}`}>
      <i className="ai-light" aria-hidden="true" />
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        <AiFace s={s} size={40} className="ai-head-face" />
        <div className="ai-head"><b>{name}</b><small>{_t("Ответы ИИ, не фетва. Важное уточняй у имама")}</small></div>
        {msgs.length > 0 && <button type="button" className="ai-clear" onClick={clear}>{_t("Очистить")}</button>}
      </div>

      <div className="ai-list" aria-live="polite">
        {msgs.length === 0 && (
          <div className="ai-hello">
            <p>{_t("Ас-саляму алейкум! Я {0}, помощник Living Muslim. Задай вопрос о намазе, привычках, Коране или о приложении.", name)}</p>
            {signed && <div className="ai-chips">{starters.map((q) => <button key={q} type="button" onClick={() => send(q)}>{q}</button>)}</div>}
          </div>
        )}
        {msgs.map((m, i) => m.hidden ? null : m.role === 'user'
          ? <div key={i} className="ai-msg me">{m.voice && <span className="ai-vo" aria-label={_t("Голосом")}>🎙 </span>}{m.content}</div>
          : (!m.content && !m.acts?.length) ? null
          : <div key={i} className="ai-row"><AiFace s={s} size={26} /><div className={`ai-msg it${m.content ? '' : ' ai-bare'}`}>
              {m.content}
              {m.book && (live.current.books ?? []).some((b) => b.id === m.book) && (
                <div className="ai-book-acts">
                  <button type="button" onClick={() => onGo?.({ practice: 'books' })}>{_t("📖 Открыть в Книгах")}</button>
                  {!m.acts?.length && <button type="button" onClick={() => goalFor(i, m.book!)}>{_t("🎯 Сделать цель «Прочитать»")}</button>}
                </div>
              )}
              {m.acts?.length ? (
                <div className="ai-acts">
                  {m.acts.map((a, k) => <div key={k}>{a.startsWith('↩') ? a : `✓ ${a}`}</div>)}
                  {undo?.i === i && <button type="button" onClick={undoNow}>{_t("Отменить")}</button>}
                </div>
              ) : null}
            </div>
            {ttsAvailable() && m.content && <button type="button" className={`ai-say${saying === i ? ' on' : ''}`} onClick={() => say(i, m.content)} aria-label={saying === i ? _t("Остановить") : _t("Прослушать")}>{saying === i ? '■' : '🔊'}</button>}</div>)}
        {busy && <div className="ai-row"><AiFace s={s} size={26} /><div className="ai-msg it ai-typing" aria-label={_t("Пишет…")}><i /><i /><i /></div></div>}
        {err && <div className="ai-err">{err}{!signed && <button type="button" className="ghost-btn" onClick={onSignIn}>{_t("Войти по почте")}</button>}</div>}
        <div ref={end} />
      </div>

      {signed ? (
        <form className={`ai-input${rec ? ' ai-rec' : ''}`} onSubmit={(e) => { e.preventDefault(); if (rec) stopMic(); else send(text, voiced); }}>
          {rec && <button type="button" className="ai-mic-x" onClick={cancelMic} aria-label={_t("Отменить запись")}>✕</button>}
          {!rec && apply && <button type="button" className="ai-clip" disabled={busy || adding} onClick={() => bookIn.current?.click()} aria-label={_t("Прикрепить книгу (PDF или TXT)")} title={_t("Прикрепить книгу (PDF или TXT)")}>
            {adding ? <i className="ai-clip-spin" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6" /></svg>}
          </button>}
          <input ref={bookIn} type="file" accept=".pdf,.txt,application/pdf,text/plain" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ''; }} />
          <textarea ref={field} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} readOnly={rec}
            enterKeyHint={touch ? 'enter' : 'send'}
            placeholder={rec ? _t("Говори, я слушаю… Нажми ■, когда закончишь") : _t("Напиши или скажи вопрос…")}
            onKeyDown={(e) => {
              // On a phone Enter is a new line (long tasks are written in several lines); ➤ sends. On a computer Enter sends, Shift+Enter is a new line.
              if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) { e.preventDefault(); if (!rec) send(text, voiced); }
            }} />
          {rec
            ? <button key="stop" type="submit" className="ai-mic on" aria-label={_t("Остановить запись")}><i /></button>
            : text.trim()
              ? <>
                  {voiced && <button key="more" type="button" className="ai-mic ai-mic-more" disabled={busy} onClick={startMic} aria-label={_t("Договорить")}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                  </button>}
                  <button key="send" type="submit" disabled={busy} aria-label={_t("Отправить")}>➤</button>
                </>
              : <button key="mic" type="button" className="ai-mic" disabled={busy} onClick={startMic} aria-label={_t("Сказать голосом")}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                </button>}
        </form>
      ) : (
        <div className="ai-input ai-signin">
          <p>{_t("Помощник работает после входа по почте.")}</p>
          <button type="button" className="ghost-btn" onClick={onSignIn}>{_t("Войти по почте")}</button>
        </div>
      )}
      {left != null && left <= 5 && <p className="ai-left">{_t("Сегодня осталось вопросов: {0}", left)}</p>}
    </div>
  );
}

const STYLE_NAMES: Record<string, () => string> = {
  fes: () => _t("Звезда Феса"), zellige: () => _t("Зеллидж"), arch: () => _t("Арка"), rose: () => _t("Роза"),
  m1: () => _t("Брат"), m2: () => _t("Брат"), m3: () => _t("Брат"), m4: () => _t("Брат"),
  f1: () => _t("Сестра"), f2: () => _t("Сестра"), f3: () => _t("Сестра"), f4: () => _t("Сестра"),
};
const FINISH_NAMES: Record<string, () => string> = {
  medal: () => _t("Золотой медальон"), pearl: () => _t("Жемчужина"), halo: () => _t("Ореол"), glass: () => _t("Стекло"), night: () => _t("Ночная звезда"),
};
const COLOR_NAMES: Record<string, () => string> = {
  green: () => _t("Зелёный"), teal: () => _t("Бирюзовый"), blue: () => _t("Синий Шефшауэн"), terra: () => _t("Терракота"), purple: () => _t("Фиолетовый"), black: () => _t("Чёрный"),
};

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="ai-seg" role="radiogroup">
      {options.map(([v, label]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onPick(v)}>{label}</button>)}
    </div>
  );
}

/** Profile → Мой помощник: for everyone the look, name and manner; for the owner also the place to teach it. */
export function AssistantSettings({ s, set, admin, onOpen }: { s: AppState['settings']; set: (p: Partial<AppState['settings']>) => void; admin: boolean; onOpen: () => void }) {
  const photo = useAiPhoto();
  const file = useRef<HTMLInputElement>(null);
  const [photoErr, setPhotoErr] = useState('');
  const style = s.aiStyle || 'fes';
  const color = s.aiColor || 'green';
  const pick = async (f?: File) => {
    if (!f) return;
    setPhotoErr('');
    try { setAiPhoto(await photoToUrl(f)); set({ aiStyle: 'photo' }); }
    catch { setPhotoErr(_t("Не получилось открыть фото. Попробуй другое.")); }
  };
  return (
    <>
      <div className="ai-hero">
        <AiFace s={s} size={96} live />
        <b>{aiName(s)}</b>
        <small>{_t("Так он выглядит на кнопке и в чате")}</small>
      </div>

      <h4 className="ai-h">{_t("Аватар")}</h4>
      <div className="ai-avs">
        {[...AI_STYLES, ...AI_PEOPLE].map((k) => (
          <button key={k} type="button" aria-pressed={style === k} className={style === k ? 'on' : ''} onClick={() => set({ aiStyle: k })}>
            <Ai3D url={badgeUrl(k, color)} size={56} finish={s.aiFinish || 'medal'} /><small>{STYLE_NAMES[k]()}</small>
          </button>
        ))}
        <button type="button" aria-pressed={style === 'photo'} className={style === 'photo' ? 'on' : ''} onClick={() => (photo ? set({ aiStyle: 'photo' }) : file.current?.click())}>
          {photo ? <Ai3D url={photo} size={56} finish={s.aiFinish || 'medal'} /> : <span className="ai-ph">＋</span>}<small>{_t("Своё фото")}</small>
        </button>
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {style === 'photo' && photo && (
        <div className="ai-photo-acts">
          <button type="button" className="link-btn" onClick={() => file.current?.click()}>{_t("Сменить фото")}</button>
          <button type="button" className="link-btn" onClick={() => { setAiPhoto(''); set({ aiStyle: 'fes' }); }}>{_t("Убрать фото")}</button>
        </div>
      )}
      {photoErr && <p className="tiny ai-err-t">{photoErr}</p>}
      <p className="tiny">{_t("Своё фото хранится только на этом телефоне и никуда не отправляется.")}</p>

      {style !== 'photo' && (
        <>
          <h4 className="ai-h">{_t("Цвет")}</h4>
          <div className="ai-colors">
            {Object.entries(AI_COLORS).map(([k, c]) => (
              <button key={k} type="button" aria-pressed={color === k} aria-label={COLOR_NAMES[k]()} title={COLOR_NAMES[k]()} className={color === k ? 'on' : ''} style={{ background: c[1] }} onClick={() => set({ aiColor: k })} />
            ))}
          </div>
        </>
      )}

      <h4 className="ai-h">{_t("Имя")}</h4>
      <input className="ai-name" value={s.aiName ?? ''} onChange={(e) => set({ aiName: e.target.value })} placeholder={_t("Помощник")} maxLength={30} aria-label={_t("Как назвать помощника")} />
      <p className="tiny">{_t("Пусто — будет просто «Помощник». Имя видно только тебе.")}</p>

      <h4 className="ai-h">{_t("Как он говорит")}</h4>
      <Seg value={s.aiYou || 'ty'} options={[['ty', _t("На «ты»")], ['vy', _t("На «вы»")]]} onPick={(v) => set({ aiYou: v })} />
      <Seg value={s.aiLen || 'short'} options={[['short', _t("Коротко")], ['long', _t("Подробно")]]} onPick={(v) => set({ aiLen: v })} />
      <Seg value={s.aiTone || 'warm'} options={[['soft', _t("Мягко")], ['warm', _t("Тепло")], ['direct', _t("По делу")]]} onPick={(v) => set({ aiTone: v })} />

      <h4 className="ai-h">{_t("Объём и блеск")}</h4>
      <div className="ai-finishes">
        {AI_FINISHES.map((k) => (
          <button key={k} type="button" aria-pressed={(s.aiFinish || 'medal') === k} className={(s.aiFinish || 'medal') === k ? 'on' : ''} onClick={() => set({ aiFinish: k })}>
            <Ai3D url={style === 'photo' && photo ? photo : badgeUrl(style === 'photo' ? 'fes' : style, color)} size={46} finish={k} /><small>{FINISH_NAMES[k]()}</small>
          </button>
        ))}
      </div>

      <h4 className="ai-h">{_t("Подсветка чата")}</h4>
      <div className="ai-glows">
        {([['ring', _t("Золотое кольцо")], ['aurora', _t("Сияние")], ['night', _t("Ночь в медресе")]] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={(s.aiGlow || 'ring') === k} className={`ai-glow-pick g-${k}${(s.aiGlow || 'ring') === k ? ' on' : ''}`} onClick={() => set({ aiGlow: k })}>
            <i /><small>{label}</small>
          </button>
        ))}
      </div>

      <AiMemoryBox on={s.aiMemory !== false} set={(v) => set({ aiMemory: v })} />

      <h4 className="ai-h">{_t("Кнопка")}</h4>
      <label className="ai-switch">
        <span><b>{_t("Кружок справа внизу")}</b><small>{_t("На всех вкладках, кроме открытого чата круга")}</small></span>
        <input type="checkbox" checked={s.aiFab !== false} onChange={(e) => set({ aiFab: e.target.checked })} />
      </label>

      <button type="button" className="ghost-btn ai-open" onClick={onOpen}>{_t("Открыть чат")}</button>
      <p className="tiny">{_t("Переписка хранится только на этом телефоне. Чтобы ответить про твои цели, привычки и круги, вместе с вопросом на сервер уходит их краткая сводка; там ничего не сохраняется. Ответы готовит ИИ (Claude, Anthropic): это не фетва, важное уточняй у имама.")}</p>
      {admin && <AssistantTrain />}
    </>
  );
}

/** The round button at the bottom right, on every tab. First time it greets once. */
export function AssistantFab({ s, onOpen }: { s: AppState['settings']; onOpen: () => void }) {
  const [hint, setHint] = useState(() => { try { return !localStorage.getItem('lm.ai.hint'); } catch { return false; } });
  const seen = () => { setHint(false); try { localStorage.setItem('lm.ai.hint', '1'); } catch { /* */ } };
  useEffect(() => { if (!hint) return; const t = setTimeout(seen, 9000); return () => clearTimeout(t); }, [hint]);
  // Hide while scrolling down (reading), come back on the first scroll up or at the top.
  const [away, setAway] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const on = () => { const y = window.scrollY; if (y < 80 || y < last - 6) setAway(false); else if (y > last + 6) setAway(true); last = y; };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  if (s.aiFab === false) return null;
  const name = aiName(s);
  return (
    <>
      {hint && (
        <button type="button" className="ai-tip" onClick={() => { seen(); onOpen(); }}>
          <b>{name}</b>{_t("Ас-саляму алейкум! Спроси меня о чём угодно.")}
        </button>
      )}
      <button type="button" className={`ai-fab${away && !hint ? ' away' : ''}`} onClick={() => { seen(); onOpen(); }} aria-label={_t("Открыть помощника: {0}", name)}>
        <AiFace s={s} size={50} live />
        {hint && <i className="ai-dot" />}
      </button>
    </>
  );
}

/** Owner only: instructions (how to answer) and knowledge (what to know). Saved in Supabase, used from the next question. */
function AssistantTrain() {
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getAiConfig().then((c) => setCfg(c ?? { instructions: '', knowledge: '' }))
      .catch(() => { setCfg({ instructions: '', knowledge: '' }); setMsg(_t("Не получилось загрузить. Проверь, что assistant.sql запущен в Supabase.")); });
  }, []);
  if (!cfg) return <p className="tiny">{_t("Загружаю…")}</p>;
  const save = async () => {
    setBusy(true); setMsg('');
    try { const c = await setAiConfig(cfg); setCfg(c); setMsg(_t("Сохранено. Помощник учитывает это со следующего вопроса.")); }
    catch (e) { setMsg(_t("Не сохранилось: {0}", e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };
  return (
    <div className="ai-train">
      <h4>{_t("Обучение помощника")}</h4>
      <p className="tiny">{_t("Видно только тебе как владельцу. Пиши обычными словами. Основные правила (не фетва, не выдумывать хадисы, бережно с людьми) работают всегда.")}</p>
      <label className="field">
        <span>{_t("Инструкции: как отвечать")}</span>
        <textarea rows={8} value={cfg.instructions} onChange={(e) => setCfg({ ...cfg, instructions: e.target.value })}
          placeholder={_t("Например: отвечай коротко, 3–5 предложений. Всегда предлагай один маленький шаг. Говори на «ты».")} />
      </label>
      <label className="field">
        <span>{_t("Знания: что он должен знать")}</span>
        <textarea rows={10} value={cfg.knowledge} onChange={(e) => setCfg({ ...cfg, knowledge: e.target.value })}
          placeholder={_t("Например: тарифы приложения, ответы на частые вопросы, проверенные тексты имама.")} />
      </label>
      <button type="button" className="ghost-btn" disabled={busy} onClick={save}>{busy ? _t("Сохраняю…") : _t("Сохранить")}</button>
      {cfg.updated_at && <p className="tiny">{_t("Последнее изменение: {0}", new Date(cfg.updated_at).toLocaleString())}</p>}
      {msg && <p className="tiny ai-note">{msg}</p>}
    </div>
  );
}

/** Profile → Мои идеи: what the person or the assistant wrote down. */
export function IdeasPage({ state, update, onAsk }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; onAsk: () => void }) {
  const [t, setT] = useState('');
  const list = [...(state.ideas ?? [])].reverse();
  const add = () => { const v = t.trim(); if (!v) return; update((s) => ({ ...s, ideas: [...(s.ideas ?? []), { id: Math.random().toString(36).slice(2, 10), at: Date.now(), text: v.slice(0, 1000) }] })); setT(''); };
  return (
    <>
      <p className="tiny">{_t("Сюда попадает всё, что ты попросишь помощника записать. Можно добавить и самому.")}</p>
      <textarea className="ai-name ai-idea-in" rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder={_t("Идея, мысль, что не забыть…")} />
      <div className="ai-photo-acts">
        <button type="button" className="ghost-btn" disabled={!t.trim()} onClick={add}>{_t("Записать")}</button>
        <button type="button" className="link-btn" onClick={onAsk}>{_t("Сказать помощнику")}</button>
      </div>
      {list.length === 0 ? <p className="tiny">{_t("Пока пусто.")}</p> : (
        <div className="ai-ideas">
          {list.map((x) => (
            <div key={x.id} className="ai-idea">
              <small>{new Date(x.at).toLocaleString(LANG === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
              <p>{x.text}</p>
              <button type="button" className="link-btn" onClick={() => { if (confirm(_t("Удалить эту запись?"))) update((s) => ({ ...s, ideas: (s.ideas ?? []).filter((y) => y.id !== x.id) })); }}>{_t("Удалить")}</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Профиль → Помощник → «Память»: what the assistant remembers about the person; they can read, fix or erase it. */
function AiMemoryBox({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  const [mem, setMem] = useState(getMemory);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => onMemory(() => setMem(getMemory())), []);
  const lines = mem.text.split('\n').filter((l) => l.trim());
  return (
    <>
      <h4 className="ai-h">{_t("Память")}</h4>
      <label className="ai-switch">
        <span><b>{_t("Помнить меня между разговорами")}</b><small>{_t("Из старых сообщений помощник записывает главное: цели, трудности, что читаешь, как тебе удобнее")}</small></span>
        <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      </label>
      {draft !== null ? (
        <div className="ai-mem">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} maxLength={3000} aria-label={_t("Память помощника")} />
          <div className="ai-mem-acts">
            <button type="button" className="ghost-btn" onClick={() => { setMemory({ ...getMemory(), text: draft.trim() }); setDraft(null); }}>{_t("Сохранить")}</button>
            <button type="button" className="link-btn" onClick={() => setDraft(null)}>{_t("Отмена")}</button>
          </div>
        </div>
      ) : lines.length ? (
        <div className="ai-mem">
          <ul>{lines.map((l, i) => <li key={i}>{l.replace(/^[-•]\s*/, '')}</li>)}</ul>
          <div className="ai-mem-acts">
            <button type="button" className="link-btn" onClick={() => setDraft(mem.text)}>{_t("Исправить")}</button>
            <button type="button" className="link-btn" onClick={() => setMemory({ text: '', upto: getMemory().upto })}>{_t("Стереть память")}</button>
          </div>
        </div>
      ) : (
        <p className="tiny">{on ? _t("Пока пусто. Помощник начнёт записывать, когда разговор станет длинным или когда ты нажмёшь «Очистить» в чате.") : _t("Память выключена: помощник помнит только текущий разговор.")}</p>
      )}
      <p className="tiny">{_t("Память хранится только на этом телефоне и уходит к помощнику вместе с вопросом.")}</p>
    </>
  );
}
