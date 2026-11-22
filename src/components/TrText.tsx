// The text of a chat message with «Перевести» under it when it is in another language (see src/translate.ts).
import { useEffect, useState } from 'react';
import { _t, _tj, LANG } from '../i18n';
import { KNOWN_LANGS, autoOn, cached, fromLabel, inLabel, needsTr, offerOn, sentOriginal, setAuto, setKnown, setOffer, setVoiceAuto, translate, useTrSettings, voiceAuto, type TrResult } from '../translate';

const ERR: Record<string, () => string> = {
  nokey: () => _t("Перевод ещё не подключён"),
  nosql: () => _t("Перевод ещё не подключён"),
  auth: () => _t("Нет доступа к этому чату"),
  net: () => _t("Нет связи, нажми ещё раз"),
  busy: () => _t("Не получилось, нажми ещё раз"),
};

export const Globe = () => (
  <svg className="tr-globe" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" /></svg>
);

/** tl/tt: the message went out through «ответ на их языке», written in tl and translated into tt by its sender.
 *  go: translate without a tap (a voice message just transcribed, or «Голосовые в текст»). */
export function TrText({ id, text, code, mine, cls = 'cc-t', tl, tt, go }: { id: number; text: string; code: string | undefined; mine?: boolean; cls?: string; tl?: string; tt?: string; go?: boolean }) {
  const { known } = useTrSettings();
  const sentTr = Boolean(tl && tt);
  // already in my language thanks to its sender: no «Перевести», only the mark
  const forMe = sentTr && !mine && (tt === LANG || known.includes(tt as string));
  const guess = mine || !code || forMe ? '' : needsTr(text, known);
  const [res, setRes] = useState<TrResult | null>(() => (guess ? cached(id) : null));
  const [show, setShow] = useState(Boolean(res));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [orig, setOrig] = useState(false);
  const auto = Boolean(guess) && (autoOn(code) || Boolean(go));

  const run = async () => {
    if (!code) return;
    setBusy(true); setErr('');
    const r = await translate(id, text, code);
    setBusy(false);
    if (r.err) { setErr((ERR[r.err] ?? ERR.busy)()); return; }
    setRes(r); setShow(true);
  };
  useEffect(() => { if (auto && !res && !busy && !err) void run(); }, [auto, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mine && sentTr) {
    const mineOrig = sentOriginal(text);
    return (
      <>
        <span className={cls} dir="auto">{orig && mineOrig ? mineOrig : text}</span>
        <small className="tr-note"><Globe />{_tj("Ушло {0}", inLabel(tt as string))}{mineOrig && <> · <button type="button" className="tr-link" onClick={(e) => { e.stopPropagation(); setOrig((o) => !o); }}>{orig ? _t("Как ушло") : _t("Мой текст")}</button></>}</small>
      </>
    );
  }
  if (forMe) {
    const f = fromLabel(tl as string);
    return (
      <>
        <span className={cls} dir="auto">{text}</span>
        <small className="tr-note"><Globe />{f ? _tj("Переведено {0}", f) : _t("Переведено")}</small>
      </>
    );
  }
  if (!guess || (res && known.includes(res.lang))) return <span className={cls} dir="auto">{text}</span>;
  const from = fromLabel(res?.lang || guess);

  if (res && show && res.kind === 'text' && res.text) {
    return (
      <>
        <span className={cls} dir="auto">{res.text}</span>
        <small className="tr-note"><Globe />{from ? _tj("Автоперевод {0}", from) : _t("Автоперевод")} · <button type="button" className="tr-link" onClick={(e) => { e.stopPropagation(); setShow(false); }}>{_t("Оригинал")}</button></small>
      </>
    );
  }
  if (res && show && res.kind === 'quran' && res.text) {
    return (
      <>
        <span className={`${cls} tr-ar`} dir="rtl">{text}</span>
        <span className="tr-ayah">«{res.text}»</span>
        <small className="tr-note"><Globe />{LANG === 'en' ? _tj("Коран {0}:{1} · Saheeh International, не машинный перевод", res.s ?? 0, res.a ?? 0) : _tj("Коран {0}:{1} · перевод смыслов Кулиева, не машинный", res.s ?? 0, res.a ?? 0)}</small>
      </>
    );
  }
  if (res && show && res.kind === 'sacred') {
    return (
      <>
        <span className={`${cls} tr-ar`} dir="auto">{text}</span>
        <small className="tr-note"><Globe />{_t("Хадис или дуа на арабском: машинный перевод не показываем")}</small>
      </>
    );
  }
  if (res && res.kind === 'same') return <span className={cls} dir="auto">{text}</span>;

  return (
    <>
      <span className={cls} dir="auto">{text}</span>
      {busy ? <small className="tr-btn wait"><Globe />{_t("Перевожу…")}</small>
        : <button type="button" className="tr-btn" onClick={(e) => { e.stopPropagation(); if (res) setShow(true); else void run(); }}>
          <Globe />{err || (from ? _tj("Перевести {0}", from) : _t("Перевести"))}
        </button>}
    </>
  );
}

/** «Перевод» on the «Данные круга» page: auto-translation for this chat, my language, languages I read anyway. */
export function TrSettings({ code }: { code: string }) {
  const { known, autoOn: on } = useTrSettings();
  const auto = on(code);
  const voice = voiceAuto(code), offer = offerOn(code);
  const others = KNOWN_LANGS.filter((x) => x.k !== LANG);
  return (
    <div className="wa-isec tr-set">
      <h4><Globe />{_t("Перевод")}</h4>
      <label className="tr-row">
        <span><b>{_t("Переводить автоматически")}</b><small>{_t("Сообщения на других языках сразу на твоём. Только для тебя.")}</small></span>
        <input type="checkbox" className="tr-sw tr-sw-auto" checked={auto} onChange={(e) => setAuto(code, e.target.checked)} />
      </label>
      <div className="tr-row">
        <span><b>{_t("Мой язык")}</b><small>{_t("Меняется в Профиль → Язык")}</small></span>
        <em>{LANG === 'en' ? 'English' : 'Русский'}</em>
      </div>
      <div className="tr-know">
        <b>{_t("Я понимаю ещё")}</b>
        <small>{_t("Эти языки не переводим")}</small>
        <div className="tr-chips">
          {others.map((x) => {
            const sel = known.includes(x.k);
            return <button key={x.k} type="button" className={sel ? 'on' : ''} aria-pressed={sel} onClick={() => setKnown(sel ? known.filter((k) => k !== x.k) : [...known, x.k])}>{x.n}</button>;
          })}
        </div>
      </div>
      <label className="tr-row">
        <span><b>{_t("Голосовые в текст")}</b><small>{_t("Голосовые других сразу текстом и на твоём языке")}</small></span>
        <input type="checkbox" className="tr-sw tr-sw-voice" checked={voice} onChange={(e) => setVoiceAuto(code, e.target.checked)} />
      </label>
      <label className="tr-row">
        <span><b>{_t("Предлагать ответ на их языке")}</b><small>{_t("Кнопка рядом с «Отправить», если в чате пишут на другом языке")}</small></span>
        <input type="checkbox" className="tr-sw tr-sw-offer" checked={offer} onChange={(e) => setOffer(code, e.target.checked)} />
      </label>
      <p className="tr-foot">{_t("Аяты, хадисы и дуа машиной не переводим. Амин, МашаАллах, ИншаАллах остаются как есть. Перевод делает ИИ и может ошибиться: оригинал всегда рядом.")}</p>
    </div>
  );
}
