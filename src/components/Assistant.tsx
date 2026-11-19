import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import { type AiConfig, type AiMsg, aiName, ask, getAiConfig, loadChat, saveChat, setAiConfig } from '../assistant';
import { authMe } from '../auth';
import { _t } from '../i18n';

interface Props {
  state: AppState;
  onClose: () => void;
  /** Profile → Аккаунт, to sign in by email. */
  onSignIn: () => void;
}

const ERR: Record<string, () => string> = {
  limit: () => _t("На сегодня вопросы закончились. Завтра можно продолжить."),
  nokey: () => _t("Помощник ещё не подключён на сервере."),
  refused: () => _t("На это я не могу ответить. Попробуй спросить по-другому."),
  net: () => _t("Нет связи. Проверь интернет и попробуй ещё раз."),
  busy: () => _t("Не получилось ответить. Попробуй через минуту."),
};

/** Full-screen chat with the assistant. The conversation stays on this device. */
export function Assistant({ state, onClose, onSignIn }: Props) {
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
    const r = await ask(next.slice(-30), s);
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
  const starters = [_t("Что ты умеешь?"), _t("Как не пропускать Фаджр?"), _t("С чего начать читать Коран?")];

  return (
    <div className="sess light-sess ai-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        <div className="ai-head"><b>✨ {name}</b><small>{_t("Ответы ИИ, не фетва. Важное уточняй у имама")}</small></div>
        {msgs.length > 0 && <button type="button" className="ai-clear" onClick={clear}>{_t("Очистить")}</button>}
      </div>

      <div className="ai-list" aria-live="polite">
        {msgs.length === 0 && (
          <div className="ai-hello">
            <p>{_t("Ас-саляму алейкум! Я {0}, помощник Living Muslim. Задай вопрос о намазе, привычках, Коране или о приложении.", name)}</p>
            {signed && <div className="ai-chips">{starters.map((q) => <button key={q} type="button" onClick={() => send(q)}>{q}</button>)}</div>}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role === 'user' ? 'me' : 'it'}`}>{m.content}</div>
        ))}
        {busy && <div className="ai-msg it ai-typing" aria-label={_t("Пишет…")}><i /><i /><i /></div>}
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

/** Profile → Помощник: the name, and for the owner the place to teach it. */
export function AssistantSettings({ s, set, admin, onOpen }: { s: AppState['settings']; set: (p: Partial<AppState['settings']>) => void; admin: boolean; onOpen: () => void }) {
  return (
    <>
      <label className="field">
        <span>{_t("Как назвать помощника")}</span>
        <input value={s.aiName ?? ''} onChange={(e) => set({ aiName: e.target.value })} placeholder={_t("Помощник")} maxLength={30} />
      </label>
      <p className="tiny">{_t("Пусто — будет просто «Помощник». Имя видно только тебе.")}</p>
      <button type="button" className="ghost-btn" onClick={onOpen}>{_t("✨ Открыть чат")}</button>
      <p className="tiny">{_t("Переписка хранится только на этом телефоне. Вопрос уходит на сервер, чтобы получить ответ, и там не сохраняется. Ответы готовит ИИ (Claude, Anthropic): это не фетва, важное уточняй у имама.")}</p>
      {admin && <AssistantTrain />}
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
