import { useState } from 'react';
import type { AppState } from '../types';
import { _t, _tj, LOC } from '../i18n';
import { daysBetween } from '../dates';
import { saveRun, REPEAT_DAYS, type TestRun } from '../selftest';
import { PREP } from '../umrah/guide';
import { umrahOf } from './Umrah';
import {
  UANSWERS, UMRAH_TEST, UPARTS, applyUmrahPlan, hasUmrahGoal, uDonePrep, uHabits, uLeft, uLevel, uLevelText, uLevelTitle,
  uPartName, uQuestions, uRuns, uScores, uTotal, U_LEVEL, type UHabit,
} from '../umrahTest';
import { track } from '../usage';

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string; onExit: () => void; onUmrah: () => void }

type View = { v: 'intro' } | { v: 'q'; i: number } | { v: 'result'; run: TestRun; prev?: TestRun } | { v: 'plan'; run: TestRun; prev?: TestRun } | { v: 'done'; n: number; ticked: number; goal: boolean };

const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(LOC, { day: 'numeric', month: 'long' });

export function UmrahTest({ state, update, today, onExit, onUmrah }: Props) {
  const me = state.settings.me;
  const QS = uQuestions(me);
  const runs = uRuns(state);
  const last = runs[runs.length - 1];
  const [view, setView] = useState<View>(() => (last ? { v: 'result', run: last, prev: runs[runs.length - 2] } : { v: 'intro' }));
  const [a, setA] = useState<number[]>([]);
  const go = (v: View) => { setView(v); window.scrollTo(0, 0); };
  const back = <button type="button" className="link-btn pro-back" onClick={onExit}>{_t("← Практика")}</button>;

  if (view.v === 'intro') return (
    <div className="page sx">
      {back}
      <h1 className="page-h">{_t("Готовность к умре")}</h1>
      <p className="page-sub">{_t("12 вопросов в четырёх частях: знания, тело, документы и деньги, сердце. Около 3 минут.")}</p>
      <div className="sx-box">
        <p>{_t("В конце увидишь, сколько у тебя из 24 и что осталось сделать до поездки. Из этого сразу получится план: привычки и цель «Подготовка к умре».")}</p>
        <p>{_t("Отвечай честно: «Частично» тоже хороший ответ. Тест можно проходить каждый месяц до поездки и смотреть, как растёт готовность.")}</p>
        <p className="sx-muted">{_t("🔒 Ответы видишь только ты, они хранятся на твоём телефоне.")}</p>
      </div>
      <button type="button" className="pri-btn sx-wide" onClick={() => { setA([]); go({ v: 'q', i: 0 }); }}>{_t("Начать")}</button>
    </div>
  );

  if (view.v === 'q') {
    const i = view.i;
    const q = QS[i];
    const pick = (val: number) => {
      const next = [...a]; next[i] = val; setA(next);
      if (i + 1 < QS.length) { setTimeout(() => go({ v: 'q', i: i + 1 }), 180); return; }
      const run: TestRun = { day: today, a: next };
      const before = runs.filter((r) => r.day !== today);
      update((s) => saveRun(s, run, UMRAH_TEST));
      track('test-umrah', 'test_done');
      setTimeout(() => go({ v: 'result', run, prev: before[before.length - 1] }), 180);
    };
    return (
      <div className="page sx">
        <div className="sx-top">
          <button type="button" className="sx-x" aria-label={_t("Назад")} onClick={() => (i === 0 ? (last ? go({ v: 'result', run: last, prev: runs[runs.length - 2] }) : go({ v: 'intro' })) : go({ v: 'q', i: i - 1 }))}>←</button>
          <span>{_tj("Вопрос {0} из {1}", i + 1, QS.length)}</span>
        </div>
        <div className="sx-prog"><i style={{ width: `${((i + 1) / QS.length) * 100}%` }} /></div>
        <span className={`sx-part um-${q.part}`}>{uPartName(q.part)}</span>
        <p className="sx-q">{q.q}</p>
        <div className="sx-opts">
          {[2, 1, 0].map((v) => <button key={v} type="button" className="sx-opt" aria-pressed={a[i] === v} onClick={() => pick(v)}>{UANSWERS[v]}</button>)}
        </div>
      </div>
    );
  }

  if (view.v === 'done') return (
    <div className="page sx">
      {back}
      <div className="sx-box sx-done">
        <b>{_t("План добавлен, бисмиллях")}</b>
        {view.n > 0 && <p>{_tj("Привычки ({0}) уже на «Сегодня».", view.n)}</p>}
        {view.goal && <p>{_t("Цель «Подготовка к умре» ждёт во вкладке «Цели». Её процент растёт, когда ты отмечаешь шаги подготовки.")}</p>}
        {view.ticked > 0 && <p>{_tj("В подготовке к умре отмечено готовым: {0}.", view.ticked)}</p>}
        <p className="sx-muted">{_t("Пройди тест снова через месяц, чтобы увидеть, как выросла готовность.")}</p>
      </div>
      <button type="button" className="pri-btn sx-wide" onClick={onUmrah}>{_t("Открыть подготовку к умре")}</button>
      <button type="button" className="ghost-btn" onClick={onExit}>{_t("Вернуться в Практику")}</button>
    </div>
  );

  const { run, prev } = view;
  if (view.v === 'plan') return <UPlan state={state} update={update} today={today} run={run} onBack={() => go({ v: 'result', run, prev })} onDone={(n, ticked, goal) => go({ v: 'done', n, ticked, goal })} />;

  const total = uTotal(run.a);
  const lv = uLevel(total);
  const sc = uScores(run.a);
  const psc = prev ? uScores(prev.a) : undefined;
  const ptotal = prev ? uTotal(prev.a) : undefined;
  const left = uLeft(run.a, me);
  const since = daysBetween(run.day, today);

  return (
    <div className="page sx">
      {back}
      <small className="sx-muted">{_t("Готовность к умре")} · {fmt(run.day)}</small>
      <div className="um-ring" style={{ ['--p' as string]: `${(total / 24) * 100}%` }}>
        <div><b>{total}</b><small>{_t("из 24")}</small></div>
      </div>
      <h1 className="page-h sx-h um-c">{uLevelTitle(lv, me)}</h1>
      <p className="um-c">{uLevelText(lv, me)}</p>
      {ptotal !== undefined && (
        <p className="sx-muted um-c">{total > ptotal ? _tj("+{0} с прошлого раза ({1})", total - ptotal, fmt(prev!.day)) : total === ptotal ? _tj("Как и в прошлый раз ({0})", fmt(prev!.day)) : _tj("{0} с прошлого раза ({1})", total - ptotal, fmt(prev!.day))}</p>
      )}

      <div className="sx-bars">
        {UPARTS.map((p) => {
          const d = psc ? sc[p] - psc[p] : 0;
          return (
            <div key={p} className={`sx-bar um-${p}`}>
              <span>{uPartName(p)}</span>
              <span className="sx-t"><i style={{ width: `${Math.max(3, (sc[p] / 6) * 100)}%` }} />{psc && <s style={{ left: `${(psc[p] / 6) * 100}%` }} />}</span>
              <span className={`sx-n${d > 0 ? ' sx-up' : d < 0 ? ' sx-down' : ''}`}>{psc && d ? (d > 0 ? `+${d}` : `−${-d}`) : `${sc[p]}/6`}</span>
            </div>
          );
        })}
      </div>

      {left.length > 0 ? (
        <div className="sx-box">
          <b>{_tj("Что осталось: {0}", left.length)}</b>
          {left.map((x) => <p key={x.i} className="um-left"><i className={x.v ? 'half' : ''} />{x.step}</p>)}
        </div>
      ) : (
        <div className="sx-box"><b>{_t("По всем пунктам «Да». Машаллах!")}</b><p>{_t("Перед поездкой ещё раз пройди гид по обрядам и проверь документы.")}</p></div>
      )}

      <button type="button" className="pri-btn sx-wide" onClick={() => go({ v: 'plan', run, prev })}>{run.habits ? _t("Посмотреть план ещё раз") : _t("Мой план подготовки")}</button>
      {run.day !== today && (
        <button type="button" className="ghost-btn" onClick={() => { setA([]); go({ v: 'q', i: 0 }); }}>
          {since >= REPEAT_DAYS ? _t("Пора пройти снова") : _tj("Пройти снова (рекомендуем через {0} дн.)", REPEAT_DAYS - since)}
        </button>
      )}
      <p className="tiny">{_tj("Срок подготовки на этом уровне: примерно {0} мес.", U_LEVEL[lv].months)}</p>
    </div>
  );
}

function UPlan({ state, update, today, run, onBack, onDone }: { state: AppState; update: Props['update']; today: string; run: TestRun; onBack: () => void; onDone: (n: number, ticked: number, goal: boolean) => void }) {
  const [list, setList] = useState<UHabit[]>(() => uHabits(run.a));
  const already = umrahOf(state).prep;
  const toTick = uDonePrep(run.a).filter((id) => !already.includes(id));
  const [tick, setTick] = useState(true);
  const goalExists = hasUmrahGoal(state);
  const [goalOn, setGoalOn] = useState(!goalExists);
  const picks = list.filter((h) => h.on);
  const months = U_LEVEL[uLevel(uTotal(run.a))].months;

  const add = () => {
    update((s) => {
      const r = applyUmrahPlan(s, run.a, picks, tick, goalOn, today);
      return saveRun(r.s, { ...run, habits: r.habitIds, goal: r.goalId }, UMRAH_TEST);
    });
    onDone(picks.length, tick ? toTick.length : 0, goalOn && !goalExists);
  };

  return (
    <div className="page sx">
      <button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← Результат")}</button>
      <h1 className="page-h sx-h">{_t("План подготовки к умре")}</h1>

      {list.length > 0 && <>
        <div className="pgl">{_t("Привычки")}</div>
        <div className="sx-list">
          {list.map((h, k) => (
            <label key={h.key} className="sx-hab">
              <input type="checkbox" checked={h.on} onChange={() => setList(list.map((x, j) => (j === k ? { ...x, on: !x.on } : x)))} />
              <span><b>{h.action}</b><small>{_tj("минимум: {0}", h.min)}</small></span>
            </label>
          ))}
        </div>
      </>}

      <div className="pgl">{_t("Цель и подготовка")}</div>
      <div className="sx-list">
        {goalExists ? (
          <div className="sx-hab"><span><b>{_t("Подготовка к умре")}</b><small>{_t("Такая цель у тебя уже есть, новую не создаём.")}</small></span></div>
        ) : (
          <label className="sx-hab">
            <input type="checkbox" checked={goalOn} onChange={() => setGoalOn(!goalOn)} />
            <span><b>{_t("Подготовка к умре")}</b><small>{_tj("Процент по списку подготовки в разделе Умра · срок {0} мес.", months)}</small></span>
          </label>
        )}
        {toTick.length > 0 && (
          <label className="sx-hab">
            <input type="checkbox" checked={tick} onChange={() => setTick(!tick)} />
            <span><b>{_tj("Отметить готовое: {0}", toTick.length)}</b><small>{toTick.map((id) => PREP.find((p) => p.id === id)?.text).filter(Boolean).join(' · ')}</small></span>
          </label>
        )}
      </div>

      <button type="button" className="pri-btn sx-wide" disabled={!picks.length && !(goalOn && !goalExists) && !(tick && toTick.length)} onClick={add}>{_t("Добавить в мой план")}</button>
      <p className="tiny">{_t("Остальные шаги (виза, прививка, билеты, ихрам) уже есть в разделе Умра → Подготовка, с подсказками, когда что делать.")}</p>
    </div>
  );
}
