import type { AppState } from '../types';
import { _t } from '../i18n';

/** «Кем ты станешь» (21.11): a small live strip at the top of «Цели».
 *  Days on the path count from the first day with any prayer or habit mark. */
const STAGES: [number, string][] = [
  [21, '«Я попробую»'],
  [90, '«Я тот, кто делает»'],
  [365, '«Меня не узнать»'],
  [Infinity, '«Я стал тем, кем хотел»'],
];

export function becomeStats(state: AppState, today: string) {
  const days = new Set<string>();
  let fajr = 0, ontime = 0, deeds = 0;
  for (const [d, m] of Object.entries(state.prayers ?? {})) {
    const vals = Object.entries(m ?? {});
    if (vals.length) days.add(d);
    for (const [a, v] of vals) { if (v === 'ontime') { ontime++; if (a === 'fajr') fajr++; } }
  }
  for (const [d, m] of Object.entries(state.log ?? {})) {
    const n = Object.values(m ?? {}).filter((v) => v === 'done' || v === 'min').length;
    if (n) { days.add(d); deeds += n; }
  }
  const first = [...days].filter((d) => d <= today).sort()[0];
  const path = first ? Math.max(1, Math.round((Date.parse(today) - Date.parse(first)) / 864e5) + 1) : 0;
  return { path, fajr, ontime, deeds };
}

export function BecomeStrip({ state, today }: { state: AppState; today: string }) {
  const { path, fajr, deeds } = becomeStats(state, today);
  if (!path) return null;
  const si = STAGES.findIndex(([n]) => path < n);
  const lo = si > 0 ? STAGES[si - 1][0] : 0, hi = STAGES[si][0];
  const pct = hi === Infinity ? 100 : Math.round(((path - lo) / (hi - lo)) * 100);
  const title = path < 7
    ? _t('{0}-й день пути. Каждый намаз — шаг к новому тебе', path)
    : _t('{0} дней в пути. Ты уже не тот, кем был', path);
  const next = hi === Infinity ? _t('Ты дошёл. Держи постоянство') : _t('Следующий шаг: {0} через {1} дн.', _t(STAGES[si + 1]?.[1] ?? STAGES[si][1]), hi - path);
  return (
    <div className="bc-strip" role="note">
      <span className="bc-ring" style={{ ['--p' as any]: pct + '%' }}><i>{path}</i></span>
      <span className="bc-txt">
        <b>{title}</b>
        <small>{_t('Сейчас: {0}', _t(STAGES[si][1]))} · {_t('Фаджр вовремя: {0}', fajr)} · {_t('дел сделано: {0}', deeds)}</small>
        <small className="bc-next">{next}</small>
      </span>
    </div>
  );
}
