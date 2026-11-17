import { useState } from 'react';
import type { AppState, UmrahState } from '../types';
import { STEPS } from '../umrah/guide';
import { umrahOf } from './Umrah';

// Two preparations that need practice, not a tick: legs for the walking, and the talbiya by heart.

const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const WEEKS = [
  { steps: 6000, tip: 'Каждый день по 6 000 шагов. Начни носить обувь, в которой поедешь.' },
  { steps: 9000, tip: '9 000 шагов. Один раз пройди 3 км без остановки, как таваф и саи вместе.' },
  { steps: 12000, tip: '12 000 шагов. Попробуй ходить в сандалиях, которые возьмёшь для ихрама.' },
  { steps: 15000, tip: '15 000 шагов. Столько бывает за день в Мекке. Береги ноги, следи за мозолями.' },
];

type Props = { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string; left: number | null; compact?: boolean };

export function WalkPlan({ state, update, today, left, compact }: Props) {
  const u = umrahOf(state);
  const days = u.walk ?? [];
  // Four weeks before the flight; without dates, from the first walk.
  const start = left !== null && left <= 28 ? 28 - left : days.length ? Math.round((Date.parse(today) - Date.parse(days[0])) / 86400000) : 0;
  const wk = Math.min(3, Math.max(0, Math.floor(start / 7)));
  const done = days.includes(today);
  const week = days.filter((d) => { const k = Math.round((Date.parse(today) - Date.parse(d)) / 86400000); return k >= 0 && k < 7; }).length;
  const mark = () => update((s) => { const w = umrahOf(s).walk ?? []; return patch(s, { walk: w.includes(today) ? w.filter((x) => x !== today) : [...w, today] }); });
  return (
    <div className="pp-card">
      <div className="pp-top"><b>Тренировка ходьбы · неделя {wk + 1} из 4</b><small>{week} из 7 дней</small></div>
      <div className="pp-dots">{Array.from({ length: 7 }, (_, i) => <i key={i} data-on={i < week} />)}</div>
      {!compact && <small className="pp-tip">{WEEKS[wk].tip}</small>}
      <button type="button" className={`pp-btn${done ? ' on' : ''}`} onClick={mark}>{done ? `✓ Сегодня ${WEEKS[wk].steps.toLocaleString('ru-RU')} шагов пройдено` : `Прошёл сегодня ${WEEKS[wk].steps.toLocaleString('ru-RU')} шагов`}</button>
    </div>
  );
}

// The talbiya split into its four phrases, learned one by one with a self-check.
const LINES = (() => {
  const d = STEPS.find((s) => s.id === 'talbiya')?.dua?.[0];
  if (!d) return [];
  const ar = d.ar.split('، ');
  const tr = d.tr.replace(/\.$/, '').split(', ');
  return ar.map((a, i) => ({ ar: a, tr: tr[i] ?? '' }));
})();

export function TalbiyaLearn({ state, update }: Omit<Props, 'today' | 'left'>) {
  const u = umrahOf(state);
  const known = u.talbiyaKnown ?? [];
  const [test, setTest] = useState(false);
  const [shown, setShown] = useState<number[]>([]);
  const toggle = (i: number) => update((s) => { const k = umrahOf(s).talbiyaKnown ?? []; return patch(s, { talbiyaKnown: k.includes(i) ? k.filter((x) => x !== i) : [...k, i] }); });
  return (
    <div className="pp-card">
      <div className="pp-top"><b>Тальбия наизусть</b><small>{known.length} из {LINES.length} строк</small></div>
      <div className="pp-dots">{LINES.map((_, i) => <i key={i} data-on={known.includes(i)} />)}</div>
      {LINES.map((l, i) => {
        const hide = test && !shown.includes(i);
        return (
          <div key={i} className={`pp-line${known.includes(i) ? ' known' : ''}`}>
            <p className="ar-dua" lang="ar" dir="rtl">{l.ar}</p>
            <button type="button" className="pp-tr" onClick={() => hide && setShown([...shown, i])}>{hide ? 'Скажи вслух, потом нажми, чтобы проверить' : l.tr}</button>
            <label className="pp-know"><input type="checkbox" checked={known.includes(i)} onChange={() => toggle(i)} /> знаю</label>
          </div>
        );
      })}
      <button type="button" className="pp-btn" onClick={() => { setTest(!test); setShown([]); }}>{test ? 'Показать всё' : 'Проверить себя: спрятать транскрипцию'}</button>
    </div>
  );
}
