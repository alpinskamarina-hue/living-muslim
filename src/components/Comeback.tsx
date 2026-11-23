import { useState } from 'react';
import type { AppState, Habit } from '../types';
import { ANCHOR_LABEL } from '../types';
import { plural } from '../dates';
import { _t, _tj } from '../i18n';
import { FORGIVE_DAYS, carryOn, laterBack, restoreHabit, startWithOne, steadiest, type BackInfo, type BackWhy } from '../comeback';

type Update = (fn: (s: AppState) => AppState) => void;

const WHY: [BackWhy, string][] = [
  ['sick', _t("Болел")], ['road', _t("Дорога")], ['work', _t("Много работы")], ['slip', _t("Просто выпал")], ['none', _t("Не хочу говорить")],
];

/** «Рады тебе снова»: once, after 3+ missed days. Not a card on «Сегодня». */
export function ComebackSheet({ state, update, today, info, onClose }: { state: AppState; update: Update; today: string; info: BackInfo; onClose: () => void }) {
  const [why, setWhy] = useState<BackWhy | undefined>();
  const keep = steadiest(state, info.last);
  const many = info.habits > 1;
  const close = (fn: (s: AppState) => AppState) => { update(fn); onClose(); };
  const forgiven = (why === 'sick' || why === 'road') && info.gap <= FORGIVE_DAYS;
  return (
    <>
      <div className="dim" onClick={() => close((s) => carryOn(s, info, why, today))} />
      <div className="sheet cb-sheet" role="dialog" aria-label={_t("С возвращением")}>
        <div className="grab" />
        <h3 className="cb-h">{_t("Рады тебе снова")}</h3>
        <p className="cb-ar" lang="ar" dir="rtl">لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ</p>
        <p className="cb-q">{_t("«Не отчаивайтесь в милости Аллаха»")} <small>{_t("(Коран 39:53)")}</small></p>
        {info.leaves > 0 && (
          <div className="cb-garden">
            <span className="cb-tree" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V11M12 11C12 7 9 5 5 5c0 4 3 6 7 6zM12 14c0-3.5 2.5-5.5 7-5.5 0 3.5-2.5 5.5-7 5.5z" /></svg>
            </span>
            <div>
              <b>{_t("Твой сад сохранён")}</b>
              <small>
                {info.leaves} {plural(info.leaves, _t("лист"), _t("листа"), _t("листьев"))}
                {info.fruits > 0 ? ` · ${info.fruits} ${plural(info.fruits, _t("плод"), _t("плода"), _t("плодов"))}` : ''}
                {_t(". Он никогда не уменьшается.")}
              </small>
            </div>
          </div>
        )}
        <p className="cb-ask"><b>{_t("Что помешало?")}</b> <small>{_t("видно только тебе")}</small></p>
        <div className="cb-chips" role="radiogroup" aria-label={_t("Что помешало?")}>
          {WHY.map(([k, t]) => (
            <button key={k} type="button" role="radio" aria-checked={why === k} className={why === k ? 'on' : ''} onClick={() => setWhy(why === k ? undefined : k)}>{t}</button>
          ))}
        </div>
        <p className="tiny cb-note">
          {forgiven ? _t("Эти дни станут «тяжёлыми днями», и серия сохранится.")
            : why === 'sick' || why === 'road' ? _t("Перерыв дольше {0} дней: серия начнётся заново, а сад остался.", FORGIVE_DAYS)
              : info.best > 1 ? _t("Лучшая серия была {0} {1}. Ты это уже умеешь.", info.best, plural(info.best, _t("день"), _t("дня"), _t("дней")))
                : _t("Хватит одного малого дела, чтобы снова начать.")}
        </p>
        {many && keep ? (
          <>
            <button type="button" className="pri-btn cb-go" onClick={() => close((s) => startWithOne(s, info, why, today))}>{_t("Начать с одного")}</button>
            <p className="tiny cb-one">{_tj("Оставим «{0}» ({1}), остальные привычки отдохнут и вернутся по одной.", keep.action, keep.min ? _t("минимум: {0}", keep.min) : ANCHOR_LABEL[keep.anchor].after.toLowerCase())}</p>
            <button type="button" className="link-btn cb-same" onClick={() => close((s) => carryOn(s, info, why, today))}>{_t("Продолжить как было")}</button>
          </>
        ) : (
          <button type="button" className="pri-btn cb-go" onClick={() => close((s) => carryOn(s, info, why, today))}>{_t("Продолжить")}</button>
        )}
      </div>
    </>
  );
}

/** After 3 lit days: «Вернуть ещё одну привычку?» */
export function ComebackMore({ state, update, today, habit, onClose }: { state: AppState; update: Update; today: string; habit: Habit; onClose: () => void }) {
  const left = (state.back?.ids.length ?? 1) - 1;
  const close = (fn: (s: AppState) => AppState) => { update(fn); onClose(); };
  return (
    <>
      <div className="dim" onClick={() => close((s) => laterBack(s, today))} />
      <div className="sheet cb-sheet" role="dialog" aria-label={_t("Вернуть привычку")}>
        <div className="grab" />
        <h3 className="cb-h">{_t("Три дня подряд, машаАллах")}</h3>
        <p className="cb-q">{_t("«Самые любимые дела у Аллаха — самые постоянные, даже если их мало»")} <small>{_t("(Бухари, Муслим)")}</small></p>
        <p className="cb-ask"><b>{_t("Вернуть ещё одну привычку?")}</b></p>
        <div className="cb-habit" data-sphere={habit.sphere}>
          <i />
          <div><b>{habit.action}</b><small>{ANCHOR_LABEL[habit.anchor].after}{habit.min ? _t(" · минимум: {0}", habit.min) : ''}</small></div>
        </div>
        <button type="button" className="pri-btn cb-go" onClick={() => close((s) => restoreHabit(s, habit.id, today))}>{_tj("Вернуть «{0}»", habit.action)}</button>
        <button type="button" className="link-btn cb-same" onClick={() => close((s) => laterBack(s, today))}>{_t("Позже")}</button>
        {left > 0 && <p className="tiny cb-one">{_t("На паузе ещё {0}. Их можно вернуть и сразу: Профиль → Привычки.", left)}</p>}
      </div>
    </>
  );
}
