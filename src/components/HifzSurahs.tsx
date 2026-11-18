// Surahs tied to a hifz goal: picking them when the goal is made, and the per-surah list in the goal.
import { useMemo, useState } from 'react';
import type { Goal } from '../types';
import { HIFZ, HIFZ_SETS, SURAH_NAMES, hifzAyahs, hifzMap, hifzRefs, surahName } from '../goals';
import { _t, _tj } from '../i18n';

/** Choose any surahs: ready-made sets, popular ones, or search all 114. */
export function SurahPicker({ value, onChange }: { value: number[]; onChange: (refs: number[]) => void }) {
  const [find, setFind] = useState('');
  const [all, setAll] = useState(false);
  const has = new Set(value);
  const toggle = (n: number) => onChange(has.has(n) ? value.filter((x) => x !== n) : [...value, n].sort((a, b) => a - b));
  const list = useMemo(() => {
    const f = find.trim().toLowerCase();
    const base = Array.from({ length: 114 }, (_, i) => i + 1);
    if (!f) return all ? base : HIFZ.map((h) => h.n);
    return base.filter((n) => String(n) === f || SURAH_NAMES[n - 1].toLowerCase().includes(f) || surahName(n).toLowerCase().includes(f));
  }, [find, all]);
  return (
    <div className="hz-pick">
      <div className="hz-sets">
        {HIFZ_SETS.map((s) => {
          const on = s.refs.every((n) => has.has(n));
          return <button key={s.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((n) => !s.refs.includes(n)) : [...new Set([...value, ...s.refs])].sort((a, b) => a - b))}>{s.ru}</button>;
        })}
      </div>
      <input className="q-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder={_t("Найти суру: номер или название")} />
      <div className="hz-list">
        {list.map((n) => (
          <label key={n} className={`hz-row${has.has(n) ? ' on' : ''}`}>
            <input type="checkbox" checked={has.has(n)} onChange={() => toggle(n)} />
            <span className="q-n">{n === 2 ? '2' : n}</span>
            <span><b>{surahName(n)}</b><small>{_tj("{0} аятов", hifzAyahs(n))}</small></span>
          </label>
        ))}
      </div>
      {!find && <button type="button" className="link-btn" onClick={() => setAll(!all)}>{all ? _t("Только популярные") : _t("Показать все 114 сур")}</button>}
      {value.length > 0 && <p className="tiny">{_tj("Выбрано: {0} · {1} аятов", value.map(surahName).join(', '), value.reduce((a, n) => a + hifzAyahs(n), 0))}</p>}
    </div>
  );
}

/** In the goal: each surah with its learned ayahs, ± buttons and a way to open it in the Quran. */
export function SurahProgress({ g, onStep, onOpen, onSet }: { g: Goal; onStep: (n: number, d: number) => void; onOpen: (n: number) => void; onSet: (refs: number[]) => void }) {
  const refs = hifzRefs(g.ref);
  const m = hifzMap(g);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(refs);
  return (
    <>
      <div className="g-sec">{_t("Суры цели")}</div>
      <div className="hz-goal">
        {refs.map((n) => {
          const have = m[n] ?? 0, all = hifzAyahs(n), done = have >= all;
          return (
            <div key={n} className={`hz-g${done ? ' done' : ''}`}>
              <button type="button" className="hz-open" onClick={() => onOpen(n)} aria-label={_t("Открыть суру {0} в Коране", surahName(n))}>
                <b>{done ? '✓ ' : ''}{surahName(n)}</b>
                <small>{_tj("{0} из {1} аятов · открыть ›", have, all)}</small>
                <i className="hz-bar"><i style={{ width: `${Math.round((have / all) * 100)}%` }} /></i>
              </button>
              <div className="hz-btns">
                <button type="button" disabled={!have} onClick={() => onStep(n, -1)} aria-label={_t("Минус аят")}>−</button>
                <button type="button" disabled={done} onClick={() => onStep(n, 1)} aria-label={_t("Плюс аят")}>+1</button>
                {!done && <button type="button" onClick={() => onStep(n, all - have)}>{_t("Вся")}</button>}
              </div>
            </div>
          );
        })}
      </div>
      {edit ? (
        <>
          <SurahPicker value={draft} onChange={setDraft} />
          <div className="row2">
            <button type="button" onClick={() => { setEdit(false); setDraft(refs); }}>{_t("Отмена")}</button>
            <button type="button" className="pri-btn" disabled={!draft.length} onClick={() => { onSet(draft); setEdit(false); }}>{_t("Сохранить")}</button>
          </div>
        </>
      ) : <button type="button" className="ghost-btn" onClick={() => { setDraft(refs); setEdit(true); }}>{_t("Изменить суры")}</button>}
    </>
  );
}
