import type { Anchor, AppState } from '../types';
import { ANCHOR_LABEL } from '../types';
import { _t, _tj } from '../i18n';
import { giveGift } from '../plan';
import { gx, LESSONS, npOf, pathNow, reviewDue, skills, SURAS, turnOn } from '../newpath';

// «Новый путь» on Today: the choice for new people, and the path card once it is on.
// The screens themselves (lessons, prayer teacher, sura trainer) load on first open: NewPathScreens.tsx.

type Update = (fn: (s: AppState) => AppState) => void;

export type PathView = { v: 'list' } | { v: 'lesson'; n: number } | { v: 'sura'; n: number; review?: boolean } | { v: 'prayer'; a?: Anchor } | { v: 'poses' };
export const PATH_EVENT = 'lm:path';
export function openPath(v: PathView) { try { window.dispatchEvent(new CustomEvent(PATH_EVENT, { detail: v })); } catch { /* */ } }

/** Turn the path on (and the gift year of Pro). */
export const startPath = (update: Update, today: string) => {
  giveGift();
  update((s) => ({ ...turnOn(s, today), settings: { ...s.settings, path: 'new' } }));
};

const I = {
  heart: <path d="M12 21c-4-3-7-6.5-7-10.5A4.5 4.5 0 0112 7a4.5 4.5 0 017 3.5C19 14.5 16 18 12 21z" />,
  home: <><path d="M4 20V10l8-6 8 6v10" /><path d="M9 20v-6h6v6" /></>,
  back: <><path d="M3 12a9 9 0 103-6.7" /><path d="M3 4v4h4" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  book: <path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5zM13 4h5.5A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5H13z" />,
};
const Ic = ({ d }: { d: JSX.Element }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

/** «Где ты сейчас на своём пути?»: shown to someone new, before the first habit. */
export function PathChoice({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const f = state.settings.me === 'f';
  const quiet = Boolean(state.settings.quiet);
  const pick = (p: 'steady' | 'back') => update((s) => ({ ...s, settings: { ...s.settings, path: p } }));
  return (
    <div className="np-choice">
      <h3>{_t("Где ты сейчас на своём пути?")}</h3>
      <p>{_t("От ответа зависит, с чего начнём. Поменять можно в любой момент в Профиле.")}</p>
      <button type="button" className="np-opt main" onClick={() => startPath(update, today)}>
        <span className="np-ic"><Ic d={I.heart} /></span>
        <span><b>{f ? _t("Я недавно приняла ислам") : _t("Я недавно принял ислам")}</b><small>{_t("Поведём шаг за шагом: омовение, первый намаз, первые суры. По одному шагу в день, без спешки и без вины.")}</small><em>{_t("Pro на первый год в подарок")}</em></span>
      </button>
      <button type="button" className="np-opt" onClick={() => pick('steady')}>
        <span className="np-ic"><Ic d={I.home} /></span>
        <span><b>{_t("Молюсь, хочу постоянства")}</b><small>{_t("Привычки вокруг пяти намазов, круг, цели.")}</small></span>
      </button>
      <button type="button" className="np-opt" onClick={() => pick('back')}>
        <span className="np-ic"><Ic d={I.back} /></span>
        <span><b>{_t("Возвращаюсь к намазу")}</b><small>{_t("Был перерыв. Начнём мягко, с одного намаза.")}</small></span>
      </button>
      <QuietToggle on={quiet} onChange={(v) => update((s) => ({ ...s, settings: { ...s.settings, quiet: v } }))} />
    </div>
  );
}

export function QuietToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="np-quiet">
      <span className="np-ic sm"><Ic d={I.lock} /></span>
      <span><b>{_t("Тихий режим")}</b><small>{_t("Если близкие пока не знают: уведомления придут без религиозных слов, просто «Время для себя».")}</small></span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** The path on Today: day N of 40, the step of the day, the prayer teacher, what the person already knows. */
export function PathToday({ state, update, today, prayer }: { state: AppState; update: Update; today: string; prayer: Anchor }) {
  const p = pathNow(state, today);
  const f = state.settings.me === 'f';
  if (p.np.closed) return null;
  const rev = reviewDue(state, today);
  const sk = skills(state);
  const day = p.day;
  if (p.finished && p.todayDone === false && !rev) {
    return (
      <div className="np-card">
        <div className="np-top"><em>{_t("Новый путь")}</em><b>{_t("40 шагов пройдены, машаАллах")}</b></div>
        <div className="np-body">
          <p className="np-p">{_t("Дальше главное постоянство: намазы и одна маленькая привычка после намаза.")}</p>
          <div className="np-row">
            <button type="button" className="ghost-btn" onClick={() => openPath({ v: 'list' })}>{_t("Все шаги")}</button>
            <button type="button" className="ghost-btn" onClick={() => update((s) => ({ ...s, newpath: { ...npOf(s), closed: true } }))}>{_t("Скрыть карточку")}</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="np-card">
      <button type="button" className="np-top" onClick={() => openPath({ v: 'list' })}>
        <em>{_tj("Новый путь · день {0} из 40", day)}<i aria-hidden="true">›</i></em>
        <span className="np-bar" role="img" aria-label={_t("Пройдено {0} шагов из 40", p.doneN)}>
          {LESSONS.map((l) => <i key={l.n} className={p.np.done[l.n] ? 'on' : l.n === p.next?.n && !p.todayDone ? 'now' : ''} />)}
        </span>
      </button>
      <div className="np-body">
        {!p.todayDone && p.next && (
          <div className="np-lesson">
            <small>{_t("Шаг дня · 5 минут")}</small>
            <b>{gx(p.next.t, f)}</b>
            <span>{gx(p.next.p[0], f)}</span>
            <button type="button" className="pri-btn" onClick={() => openPath({ v: 'lesson', n: p.next!.n })}>{_t("Начать урок")}</button>
          </div>
        )}
        {p.todayDone && (
          <div className="np-lesson done">
            <small>{_t("✓ Шаг дня пройден")}</small>
            <b>{p.last ? gx(p.last.t, f) : ''}</b>
            {p.next && <span>{_tj("Завтра: {0}. Можно и не ждать, но спешить некуда.", gx(p.next.t, f))}</span>}
            {p.next && <button type="button" className="link-btn" onClick={() => openPath({ v: 'lesson', n: p.next!.n })}>{_t("Открыть следующий шаг")}</button>}
          </div>
        )}
        {rev && (
          <button type="button" className="np-line" onClick={() => openPath({ v: 'sura', n: rev, review: true })}>
            <Ic d={I.book} /><span><b>{_tj("Повтори «{0}»", SURAS[rev].name)}</b><small>{_t("1 минута, чтобы сура не забылась")}</small></span><i aria-hidden="true">›</i>
          </button>
        )}
        <button type="button" className="np-teach" onClick={() => openPath({ v: 'prayer', a: prayer })}>
          <Ic d={I.clock} />{_tj("Совершить {0} с подсказками", ANCHOR_LABEL[prayer].ru)}
        </button>
        {sk.length > 0 && (
          <div className="np-skills">
            <small>{_t("Что ты уже умеешь")}</small>
            <div>{sk.map((x) => <span key={x}>{x}</span>)}{p.next && !p.todayDone && p.next.skill && <span className="soon">{_tj("{0} · сегодня", p.next.skill)}</span>}</div>
          </div>
        )}
      </div>
    </div>
  );
}
