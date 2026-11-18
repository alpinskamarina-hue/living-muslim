import { useEffect, useState } from 'react';
import type { AppState } from '../types';
import { isCounted, setMark } from '../store';
import { plural } from '../dates';
import { azkarHabits, azkarNow, azkarOf, isDone, markDone, pick, setFor, streak, textOf, type Part } from '../azkar';
import { _t } from '../i18n';

// Morning and evening adhkar: one dhikr per screen, a counter for the ones said 3, 7, 10 or 100 times.
// Finishing the set marks the day (and an «азкары» habit, if the person has one).

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  onExit: () => void;
}

export function Azkar({ state, update, today, onExit }: Props) {
  const nowInfo = azkarNow(state, today);
  const [part, setPart] = useState<Part>(nowInfo.part);
  const a = azkarOf(state);
  const short = Boolean(a.short);
  const showTr = a.tr !== false;
  const list = setFor(part, short);
  const day = part === nowInfo.part ? nowInfo.day : today;
  const [i, setI] = useState(0);
  const [count, setCount] = useState(0);
  const [end, setEnd] = useState(false);

  useEffect(() => { setI(0); setCount(0); setEnd(false); }, [part, short]);

  const d = list[Math.min(i, list.length - 1)];
  const tx = textOf(d, part);
  const finish = () => {
    update((s) => {
      let x = markDone(s, day, part);
      for (const h of azkarHabits(x, part)) if (!isCounted(x.log[day]?.[h.id])) x = setMark(x, day, h.id, 'done');
      return x;
    });
    setEnd(true);
  };
  const next = () => {
    setCount(0);
    if (i + 1 >= list.length) finish(); else setI(i + 1);
    window.scrollTo?.(0, 0);
    document.querySelector('.az-sess')?.scrollTo?.(0, 0);
  };
  const tap = () => {
    if (count >= d.n) return; // already moving on to the next one
    const c = count + 1;
    try { navigator.vibrate?.(c >= d.n ? 120 : 12); } catch { /* ignore */ }
    if (c >= d.n) { setCount(d.n); setTimeout(next, 350); } else setCount(c);
  };
  const set = (patch: Partial<typeof a>) => update((s) => ({ ...s, azkar: { ...azkarOf(s), ...patch } }));

  const title = part === 'm' ? _t("Утренние азкары") : _t("Вечерние азкары");
  const n = streak(state, today, part);

  return (
    <div className="sess az-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn light" onClick={onExit} aria-label={_t("Выйти")}>✕</button>
        <div><b>{title}</b><small>{part === nowInfo.part ? nowInfo.line : part === 'm' ? _t("Лучшее время: от Фаджра до восхода") : _t("Лучшее время: от Асра до Магриба")}</small></div>
      </div>

      <div className="az-seg" role="tablist">
        {(['m', 'e'] as Part[]).map((p) => (
          <button key={p} type="button" role="tab" aria-selected={part === p} onClick={() => setPart(p)}>
            {p === 'm' ? _t("☀️ Утро") : _t("🌙 Вечер")}{isDone(state, p === nowInfo.part ? nowInfo.day : today, p) ? ' ✓' : ''}
          </button>
        ))}
      </div>

      {end ? (
        <div className="az-end">
          <span className="az-big">✓</span>
          <h2>{part === 'm' ? _t("Утренние азкары прочитаны") : _t("Вечерние азкары прочитаны")}</h2>
          <p>{_t("Да примет Аллах.")}{n > 1 ? ' ' + _t("Серия: {0} {1} подряд.", n, plural(n, _t("день"), _t("дня"), _t("дней"))) : ''}</p>
          {azkarHabits(state, part).length > 0 && <p className="az-note">{_t("Привычка отмечена.")}</p>}
          <button type="button" className="gold-btn" onClick={onExit}>{_t("Готово")}</button>
          <button type="button" className="link-btn light" onClick={() => { setI(0); setCount(0); setEnd(false); }}>{_t("Прочитать ещё раз")}</button>
        </div>
      ) : (
        <>
          <div className="az-prog" aria-label={_t("{0} из {1}", i + 1, list.length)}>
            <span style={{ width: `${(i / list.length) * 100}%` }} />
            <small>{_t("{0} из {1}", i + 1, list.length)}</small>
          </div>

          <div className="az-card">
            <small className="az-title">{pick(d.title)}{d.n > 1 ? ` · ${d.n}×` : ''}</small>
            <p className={`az-ar${tx.ar.length > 260 ? ' long' : ''}`} dir="rtl" lang="ar">{tx.ar}</p>
            {showTr && <p className="az-tr">{tx.tr}</p>}
            <p className="az-mean">{tx.mean}</p>
            {d.virtue && <p className="az-virtue">{pick(d.virtue)}</p>}
            <small className="az-src">{pick(d.src)}</small>
          </div>

          {d.n > 1 ? (
            <button type="button" className="az-count" onClick={tap} aria-label={_t("Плюс один")}>
              <b>{count}</b><small>{_t("из {0}", d.n)}</small>
            </button>
          ) : (
            <button type="button" className="gold-btn az-next" onClick={next}>{i + 1 >= list.length ? _t("Завершить") : _t("Дальше")}</button>
          )}

          <div className="az-nav">
            <button type="button" className="link-btn light" disabled={i === 0} onClick={() => { setI(Math.max(0, i - 1)); setCount(0); }}>{_t("‹ Назад")}</button>
            {d.n > 1 && <button type="button" className="link-btn light" onClick={next}>{_t("Пропустить ›")}</button>}
          </div>

          <div className="az-opts">
            <button type="button" aria-pressed={short} onClick={() => set({ short: !short })}>{short ? _t("Коротко: {0}", setFor(part, true).length) : _t("Полностью: {0}", setFor(part, false).length)}</button>
            <button type="button" aria-pressed={showTr} onClick={() => set({ tr: !showTr })}>{showTr ? _t("Транскрипция: вкл") : _t("Транскрипция: выкл")}</button>
          </div>
        </>
      )}
    </div>
  );
}
