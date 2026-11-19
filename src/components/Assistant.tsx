import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import { type AiConfig, type AiMsg, aiName, ask, getAiConfig, loadChat, saveChat, setAiConfig } from '../assistant';
import { authMe } from '../auth';
import { _t } from '../i18n';
import { AI_COLORS, AI_STYLES, AiFace, badgeUrl, photoToUrl, setAiPhoto, useAiPhoto } from '../aiLook';

interface Props {
  state: AppState;
  onClose: () => void;
  /** Profile → Аккаунт, to sign in by email. */
  onSignIn: () => void;
  /** A fresh summary of the person's data for the assistant, built at the moment of the question. */
  context?: () => string;
}

const ERR: Record<string, () => string> = {
  limit: () => _t("На сегодня вопросы закончились. Завтра можно продолжить."),
  nokey: () => _t("Помощник ещё не подключён на сервере."),
  refused: () => _t("На это я не могу ответить. Попробуй спросить по-другому."),
  net: () => _t("Нет связи. Проверь интернет и попробуй ещё раз."),
  busy: () => _t("Не получилось ответить. Попробуй через минуту."),
};

/** Full-screen chat with the assistant. The conversation stays on this device. */
export function Assistant({ state, onClose, onSignIn, context }: Props) {
  const s = state.settings;
  const name = aiName(s);
  const [msgs, setMsgs] = useState<AiMsg[]>(loadChat);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const signed = Boolean(authMe());

  useEffect(() => { saveChat(msgs); end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);

  const send = async (q = text) => {
    const v = q.trim();
    if (!v || busy) return;
    const next: AiMsg[] = [...msgs, { role: 'user', content: v, at: Date.now() }];
    setMsgs(next); setText(''); setErr(''); setBusy(true);
    let ctx = '';
    try { ctx = context?.() ?? ''; } catch { /* answer without it */ }
    const r = await ask(next.slice(-30), s, ctx);
    setBusy(false);
    if ('error' in r) {
      if (r.error === 'signin') { setErr(_t("Чтобы говорить с помощником, войди по почте.")); return; }
      setErr(ERR[r.error]?.() ?? ERR.busy());
      return;
    }
    setMsgs((m) => [...m, { role: 'assistant', content: r.text, at: Date.now() }]);
    setLeft(r.left ?? null);
  };

  const clear = () => { setMsgs([]); setErr(''); };
  const starters = [_t("Что у меня сегодня?"), _t("Как идут мои цели?"), _t("Что ты умеешь?"), _t("Как не пропускать Фаджр?")];

  return (
    <div className="sess light-sess ai-sess">
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
        {msgs.map((m, i) => m.role === 'user'
          ? <div key={i} className="ai-msg me">{m.content}</div>
          : <div key={i} className="ai-row"><AiFace s={s} size={26} /><div className="ai-msg it">{m.content}</div></div>)}
        {busy && <div className="ai-row"><AiFace s={s} size={26} /><div className="ai-msg it ai-typing" aria-label={_t("Пишет…")}><i /><i /><i /></div></div>}
        {err && <div className="ai-err">{err}{!signed && <button type="button" className="ghost-btn" onClick={onSignIn}>{_t("Войти по почте")}</button>}</div>}
        <div ref={end} />
      </div>

      {signed ? (
        <form className="ai-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} placeholder={_t("Напиши вопрос…")}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button type="submit" disabled={busy || !text.trim()} aria-label={_t("Отправить")}>➤</button>
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
        <AiFace s={s} size={96} />
        <b>{aiName(s)}</b>
        <small>{_t("Так он выглядит на кнопке и в чате")}</small>
      </div>

      <h4 className="ai-h">{_t("Аватар")}</h4>
      <div className="ai-avs">
        {AI_STYLES.map((k) => (
          <button key={k} type="button" aria-pressed={style === k} className={style === k ? 'on' : ''} onClick={() => set({ aiStyle: k })}>
            <img src={badgeUrl(k, color)} alt="" width={56} height={56} /><small>{STYLE_NAMES[k]()}</small>
          </button>
        ))}
        <button type="button" aria-pressed={style === 'photo'} className={style === 'photo' ? 'on' : ''} onClick={() => (photo ? set({ aiStyle: 'photo' }) : file.current?.click())}>
          {photo ? <img src={photo} alt="" width={56} height={56} /> : <span className="ai-ph">＋</span>}<small>{_t("Своё фото")}</small>
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
  if (s.aiFab === false) return null;
  const name = aiName(s);
  return (
    <>
      {hint && (
        <button type="button" className="ai-tip" onClick={() => { seen(); onOpen(); }}>
          <b>{name}</b>{_t("Ас-саляму алейкум! Спроси меня о чём угодно.")}
        </button>
      )}
      <button type="button" className="ai-fab" onClick={() => { seen(); onOpen(); }} aria-label={_t("Открыть помощника: {0}", name)}>
        <AiFace s={s} size={60} />
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
