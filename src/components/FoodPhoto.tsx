// «Фото еды» (step 2 of the food concept, mockup approved 20.11): the camera button next to «Что съел?»,
// the camera / gallery sheet, «Смотрю на тарелку…», the dishes found with portions to adjust, and the states
// for «not food», «limit reached» and network errors. The photo stays on the phone except for the one request.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FoodItem, Meal } from '../types';
import { PHOTO_LIMIT, photosLeft, recognise, shrink, signedIn, type PhotoItem } from '../foodphoto';
import { search, itemFrom } from '../foodcalc';
import { _t, _tj } from '../i18n';

const CamIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
);
const GalIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="9" cy="9" r="2" fill="currentColor" /><path d="m21 15-5-5L5 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
);
const COLORS = ['#e3b35a', '#5fae4e', '#d9a35b', '#d9532f', '#8fb7d9', '#b88ad9', '#e07b2e', '#7fb495'];

interface Row extends PhotoItem { q: number; edit?: boolean }
type Stage = { s: 'scan' } | { s: 'done'; rows: Row[]; check: string } | { s: 'notfood'; reason: string } | { s: 'limit' } | { s: 'signin' } | { s: 'error' };

const fmtPieces = (n: number) => (Math.abs(n - 0.5) < 0.01 ? '½' : Math.abs(n % 1 - 0.5) < 0.01 ? `${Math.floor(n)}½` : String(Math.round(n * 10) / 10).replace('.', ','));

/** The camera button and everything it opens. */
export function PhotoEntry({ today, meal, mealLabel, onAdd, onChange }: { today: string; meal: Meal; mealLabel: string; onAdd: (items: FoodItem[]) => void; onChange?: () => void }) {
  const [sheet, setSheet] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [url, setUrl] = useState('');
  const [extra, setExtra] = useState('');
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const left = photosLeft(today);
  const out = left === 0;

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const close = () => { abort.current?.abort(); setStage(null); setExtra(''); };
  const pick = (which: 'cam' | 'gal') => { setSheet(false); (which === 'cam' ? cam : gal).current?.click(); };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try { localStorage.setItem('lm.foodPhotoHint', '1'); } catch { /* */ }
    onChange?.();
    setStage({ s: 'scan' });
    let shr: { data: string; url: string };
    try { shr = await shrink(f); } catch { setStage({ s: 'notfood', reason: '' }); return; }
    setUrl(shr.url);
    const ac = new AbortController(); abort.current = ac;
    const timer = window.setTimeout(() => ac.abort(), 25000);
    const r = await recognise(shr.data, today, ac.signal);
    window.clearTimeout(timer);
    onChange?.();
    if (ac.signal.aborted && !r.ok && r.why === 'net') { setStage((st) => (st ? { s: 'error' } : st)); return; }
    if (r.ok) setStage({ s: 'done', rows: r.items.map((i) => ({ ...i, q: 1 })), check: r.check });
    else if (r.why === 'notfood') setStage({ s: 'notfood', reason: r.reason });
    else if (r.why === 'limit') setStage({ s: 'limit' });
    else if (r.why === 'signin') setStage({ s: 'signin' });
    else setStage({ s: 'error' });
  };

  const setRow = (i: number, p: Partial<Row>) => setStage((st) => (st?.s === 'done' ? { ...st, rows: st.rows.map((r, k) => (k === i ? { ...r, ...p } : r)) } : st));
  const step = (i: number, dir: 1 | -1) => setStage((st) => {
    if (st?.s !== 'done') return st;
    const r = st.rows[i];
    const unit = r.pieces > 0 ? (r.pieces <= 1 ? 0.5 / r.pieces : 1 / r.pieces) : 0.2;
    const q = Math.max(unit, Math.round((r.q + dir * unit) * 100) / 100);
    return { ...st, rows: st.rows.map((x, k) => (k === i ? { ...x, q } : x)) };
  });
  const drop = (i: number) => setStage((st) => (st?.s === 'done' ? { ...st, rows: st.rows.filter((_, k) => k !== i) } : st));
  const addExtra = (name: string) => {
    const hit = search(name)[0];
    const it = hit ? itemFrom(hit, hit.g, meal) : null;
    if (!it) return;
    setStage((st) => (st?.s === 'done' ? { ...st, rows: [...st.rows, { name: it.n, grams: it.g, pieces: 0, unit: '', lo: it.k, hi: it.k, p: it.p, f: it.f, c: it.c, x: -1, y: -1, q: 1 }] } : st));
    setExtra('');
  };
  const save = () => {
    if (stage?.s !== 'done') return;
    const now = Date.now().toString(36);
    onAdd(stage.rows.map((r, k) => ({
      id: `fp-${now}${k}`, n: r.name.trim() || _t("Блюдо"), g: Math.round(r.grams * r.q), k: Math.round(((r.lo + r.hi) / 2) * r.q),
      p: Math.round(r.p * r.q * 10) / 10, f: Math.round(r.f * r.q * 10) / 10, c: Math.round(r.c * r.q * 10) / 10, m: meal,
    })));
    close();
  };
  const tot = stage?.s === 'done' ? stage.rows.reduce((a, r) => ({ lo: a.lo + r.lo * r.q, hi: a.hi + r.hi * r.q, p: a.p + r.p * r.q, f: a.f + r.f * r.q, c: a.c + r.c * r.q }), { lo: 0, hi: 0, p: 0, f: 0, c: 0 }) : null;
  const round10 = (n: number) => Math.round(n / 10) * 10;
  const hits = extra.trim().length > 1 ? search(extra).slice(0, 3) : [];

  const screen = stage && (
    <div className="sess light-sess fp-screen" role="dialog" aria-modal="true" aria-label={_t("Фото еды")}>
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={close} aria-label={_t("Закрыть")}>✕</button>
        <div><b>{_t("Фото еды")}</b><small>{_tj("в «{0}»", mealLabel)}</small></div>
      </div>
      <div className="fp-body">
        {url && (stage.s === 'scan' || stage.s === 'done') && (
          <div className={`fp-photo${stage.s === 'done' ? ' sm' : ''}`}>
            <img src={url} alt="" />
            {stage.s === 'scan' && <i className="fp-scan" />}
            {stage.s === 'done' && stage.rows.filter((r) => r.x >= 0).map((r, k) => <span key={k} className="fp-tag" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }}>{r.name.length <= 14 ? r.name : r.name.split(/\s+/)[0]}</span>)}
          </div>
        )}
        {stage.s === 'scan' && (
          <>
            <p className="fp-status"><b>{_t("Смотрю, что на тарелке…")}</b><small>{_t("обычно 3–5 секунд")}</small></p>
            <div className="fp-dots"><i /><i /><i /></div>
            <p className="fp-note">{_t("Пока ждёшь: «Бисмиллях» перед едой и «Альхамдулиллях» после.")}</p>
            <button type="button" className="link-btn fp-center" onClick={close}>{_t("Отмена")}</button>
          </>
        )}
        {stage.s === 'done' && tot && (
          <>
            {stage.rows.map((r, i) => (
              <div key={i} className="fp-row">
                <i className="fp-sw" style={{ background: COLORS[i % COLORS.length] }} />
                <span>
                  {r.edit
                    ? <input autoFocus value={r.name} maxLength={60} onChange={(e) => setRow(i, { name: e.target.value })} onBlur={() => setRow(i, { edit: false })} onKeyDown={(e) => { if (e.key === 'Enter') setRow(i, { edit: false }); }} aria-label={_t("Название")} />
                    : <button type="button" className="fp-name" onClick={() => setRow(i, { edit: true })}>{r.name}</button>}
                  <small>{r.pieces > 0 ? _tj("{0} {1}", fmtPieces(r.pieces * r.q), r.unit || _t("шт")) : _tj("~{0} г", round10(r.grams * r.q) || Math.round(r.grams * r.q))} · {r.lo === r.hi ? _tj("{0} ккал", Math.round(r.lo * r.q)) : _tj("{0}–{1} ккал", round10(r.lo * r.q), round10(r.hi * r.q))}{r.p * r.q >= 3 ? _tj(" · белок {0} г", Math.round(r.p * r.q)) : ''}</small>
                </span>
                <div className="fp-stp">
                  <button type="button" aria-label={_tj("Меньше: {0}", r.name)} onClick={() => (r.q <= (r.pieces > 0 ? (r.pieces <= 1 ? 0.5 / r.pieces : 1 / r.pieces) : 0.2) + 0.001 ? drop(i) : step(i, -1))}>−</button>
                  <em>{r.pieces > 0 ? fmtPieces(r.pieces * r.q) : _tj("{0} г", round10(r.grams * r.q) || Math.round(r.grams * r.q))}</em>
                  <button type="button" aria-label={_tj("Больше: {0}", r.name)} onClick={() => step(i, 1)}>+</button>
                </div>
              </div>
            ))}
            <div className="fp-extra">
              <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={_t("＋ Добавить, чего нет на фото (чай, соус)")} aria-label={_t("Добавить, чего нет на фото")} />
              {hits.length > 0 && <div className="fp-hits">{hits.map((h) => <button key={h.id} type="button" onClick={() => addExtra(h.n)}>{h.n}</button>)}</div>}
            </div>
            {stage.check && <div className="fp-warn"><b>{_t("Проверь состав")}</b>{stage.check} {_t("Это подсказка, а не фетва.")}</div>}
            <div className="fp-total">
              <span><small>{_t("Итого примерно")}</small><b>{_tj("{0}–{1} ккал", round10(tot.lo), round10(tot.hi))}</b></span>
              <span><small>{_tj("белок ~{0} г", Math.round(tot.p))}</small><small>{_tj("жиры ~{0} г · углеводы ~{1} г", Math.round(tot.f), Math.round(tot.c))}</small></span>
            </div>
            <button type="button" className="pri-btn fp-save" disabled={!stage.rows.length} onClick={save}>{_tj("Записать в «{0}»", mealLabel)}</button>
            <p className="fp-note">{_t("Нажми на название, чтобы поправить. Точность ±20–30%.")}</p>
          </>
        )}
        {(stage.s === 'notfood' || stage.s === 'error' || stage.s === 'limit' || stage.s === 'signin') && (
          <div className="fp-err">
            <div className="fp-big">{stage.s === 'notfood' ? '🤔' : stage.s === 'limit' ? '⏳' : stage.s === 'signin' ? '🔑' : '📶'}</div>
            <b>{stage.s === 'notfood' ? _t("Не понял, что на фото") : stage.s === 'limit' ? _tj("{0} фото на сегодня уже использованы", PHOTO_LIMIT) : stage.s === 'signin' ? _t("Нужно войти по почте") : _t("Не получилось связаться")}</b>
            <p>{stage.s === 'notfood' ? (stage.reason || _t("Так бывает с тёмными фото или когда еда закрыта упаковкой.")) : stage.s === 'limit' ? _tj("Завтра снова {0}. Пока можно написать текстом, это без ограничений.", PHOTO_LIMIT) : stage.s === 'signin' ? _t("Распознавание фото работает после входа, как и Помощник. Войти можно в Профиле.") : _t("Проверь интернет и попробуй ещё раз. Фото не потратилось.")}</p>
            {stage.s === 'notfood' && <ul className="fp-tips"><li>{_t("сними сверху, при дневном свете")}</li><li>{_t("вся тарелка в кадре")}</li><li>{_t("для упаковки лучше калории с этикетки")}</li></ul>}
            {(stage.s === 'notfood' || stage.s === 'error') && <button type="button" className="pri-btn" onClick={() => { setStage(null); pick('cam'); }}>{_t("Сфотографировать ещё раз")}</button>}
            <button type="button" className="link-btn fp-center" onClick={close}>{_t("Написать текстом")}</button>
            {stage.s === 'notfood' && <p className="fp-note">{_tj("Неудачная попытка не тратит фото из дневных {0}.", PHOTO_LIMIT)}</p>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button type="button" className={`fd-cam${out ? ' off' : ''}`} aria-label={_t("Фото еды")} onClick={() => (out ? setStage({ s: 'limit' }) : setSheet(true))}><CamIcon /></button>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={gal} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {sheet && createPortal(
        <div className="fp-dim" onClick={() => setSheet(false)}>
          <div className="fp-sheet" role="dialog" aria-label={_t("Фото еды")} onClick={(e) => e.stopPropagation()}>
            <i className="fp-grab" />
            <b>{_t("Фото еды")}</b>
            {signedIn() ? (
              <>
                <button type="button" className="fp-opt" onClick={() => pick('cam')}><i><CamIcon /></i><span><b>{_t("Сфотографировать")}</b><small>{_t("сверху, при свете, вся тарелка в кадре")}</small></span></button>
                <button type="button" className="fp-opt" onClick={() => pick('gal')}><i><GalIcon /></i><span><b>{_t("Выбрать из галереи")}</b><small>{_t("если уже сфотографировал")}</small></span></button>
                <p className="fp-note">{_t("Фото уходит только на распознавание и сразу удаляется. В приложении и на сервере его не храним.")}{left !== null ? ' ' + _tj("Сегодня осталось {0} из {1}.", left, PHOTO_LIMIT) : ''}</p>
              </>
            ) : (
              <p className="fp-note">{_t("Распознавание фото работает после входа по почте, как и Помощник. Войти можно в Профиле. Без входа еду можно записывать текстом.")}</p>
            )}
          </div>
        </div>, document.body)}
      {screen && createPortal(screen, document.body)}
    </>
  );
}

/** One line under the input: the «new» hint, photos left, or the limit. */
export function PhotoLine({ today }: { today: string }) {
  const left = photosLeft(today);
  let hint = false;
  try { hint = !localStorage.getItem('lm.foodPhotoHint'); } catch { /* */ }
  if (left === 0) return <div className="fd-phint off">{_tj("{0} фото на сегодня уже использованы. Завтра снова {0}. Пока можно написать текстом, это без ограничений.", PHOTO_LIMIT)}</div>;
  if (hint) return <div className="fd-phint"><b>{_t("Новое:")}</b> {_t("сфотографируй тарелку, посчитаю примерно")}</div>;
  return null;
}
