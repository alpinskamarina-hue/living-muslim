import { useState } from 'react';
import type { AppState } from '../types';
import { _t, _tj, LOC } from '../i18n';
import { daysBetween } from '../dates';
import { saveRun, type TestRun } from '../selftest';
import { npOf } from '../newpath';
import {
  MINUTES, RUNGS, SALAH_REPEAT, SALAH_TEST, SQUESTIONS, applySalahPlan, gaps, minutesOf, planOf, rungDone, rungOf, rungText, sRuns, type SHabit,
} from '../salahTest';

type Go = 'quran' | 'course-ar' | 'home';
interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string; onExit: () => void; onOpen: (m: Go) => void }

type View = { v: 'intro' } | { v: 'q'; i: number } | { v: 'result'; run: TestRun; prev?: TestRun } | { v: 'plan'; run: TestRun; prev?: TestRun } | { v: 'done'; run: TestRun; n: number; goal: boolean; path: boolean };

const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(LOC, { day: 'numeric', month: 'long' });

export function SalahTest({ state, update, today, onExit, onOpen }: Props) {
  const me = state.settings.me;
  const runs = sRuns(state);
  const last = runs[runs.length - 1];
  const [view, setView] = useState<View>(() => (last ? { v: 'result', run: last, prev: runs[runs.length - 2] } : { v: 'intro' }));
  const [a, setA] = useState<number[]>([]);
  const go = (v: View) => { setView(v); window.scrollTo(0, 0); };
  const back = <button type="button" className="link-btn pro-back" onClick={onExit}>{_t("← Практика")}</button>;
  const N = SQUESTIONS.length + 1;

  if (view.v === 'intro') return (
    <div className="page sx">
      {back}
      <h1 className="page-h">{_t("Намаз и Коран: с чего начать")}</h1>
      <p className="page-sub">{_t("10 вопросов «да или нет» и один про время. Около 2 минут.")}</p>
      <div className="sx-box">
        <p>{_t("Это не экзамен. Мы ничего не проверяем: ответы даёшь ты, о себе. В конце увидишь лесенку из четырёх ступеней, свою ступеньку и следующий шаг.")}</p>
        <p>{_t("Неважно, молишься ты много лет или только начинаешь. Начинать с того места, где ты сейчас, не стыдно.")}</p>
        <p className="sx-muted">{_t("🔒 Ответы видишь только ты, они хранятся на твоём телефоне.")}</p>
      </div>
      <button type="button" className="pri-btn sx-wide" onClick={() => { setA([]); go({ v: 'q', i: 0 }); }}>{_t("Начать")}</button>
    </div>
  );

  if (view.v === 'q') {
    const i = view.i;
    const isTime = i === SQUESTIONS.length;
    const pick = (val: number) => {
      const next = [...a]; next[i] = val; setA(next);
      if (!isTime) { setTimeout(() => go({ v: 'q', i: i + 1 }), 180); return; }
      const run: TestRun = { day: today, a: next };
      const before = runs.filter((r) => r.day !== today);
      update((s) => saveRun(s, run, SALAH_TEST));
      setTimeout(() => go({ v: 'result', run, prev: before[before.length - 1] }), 180);
    };
    return (
      <div className="page sx">
        <div className="sx-top">
          <button type="button" className="sx-x" aria-label={_t("Назад")} onClick={() => (i === 0 ? (last ? go({ v: 'result', run: last, prev: runs[runs.length - 2] }) : go({ v: 'intro' })) : go({ v: 'q', i: i - 1 }))}>←</button>
          <span>{_tj("Вопрос {0} из {1}", i + 1, N)}</span>
        </div>
        <div className="sx-prog"><i style={{ width: `${((i + 1) / N) * 100}%` }} /></div>
        {!isTime ? (
          <>
            <span className="sx-part" data-sphere="faith">{_tj("Ступень {0} · {1}", SQUESTIONS[i].r, RUNGS[SQUESTIONS[i].r - 1].title)}</span>
            <p className="sx-q">{SQUESTIONS[i].q}</p>
            <div className="sx-opts">
              {(SQUESTIONS[i].opts ?? [{ t: _t("Да"), v: 1 }, { t: _t("Пока нет"), v: 0 }]).map((o) => (
                <button key={o.v} type="button" className="sx-opt" aria-pressed={a[i] === o.v} onClick={() => pick(o.v)}>{o.t}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="sx-part">{_t("Последний вопрос")}</span>
            <p className="sx-q">{_t("Сколько минут в день есть на это?")}</p>
            <div className="sx-opts">
              {MINUTES.map((m, k) => <button key={m} type="button" className="sx-opt" aria-pressed={a[i] === k} onClick={() => pick(k)}>{_tj("{0} минут", m)}</button>)}
            </div>
          </>
        )}
      </div>
    );
  }

  if (view.v === 'done') {
    const plan = planOf(view.run.a);
    return (
      <div className="page sx">
        {back}
        <div className="sx-box sx-done">
          <b>{_t("План добавлен, бисмиллях")}</b>
          {view.n > 0 && <p>{_tj("Привычки ({0}) уже на «Сегодня».", view.n)}</p>}
          {view.goal && <p>{_t("Цель ждёт во вкладке «Цели».")}</p>}
          {view.path && <p>{_t("«Новый путь» включён: урок дня будет на «Сегодня».")}</p>}
          <p className="sx-muted">{_t("Пройди тест снова через 2 месяца и посмотри, на какой ступеньке будешь тогда.")}</p>
        </div>
        {plan.course === 'ar' && <button type="button" className="pri-btn sx-wide" onClick={() => onOpen('course-ar')}>{_t("Открыть «Арабский по дням»")}</button>}
        {plan.course === 'quran' && <button type="button" className="pri-btn sx-wide" onClick={() => onOpen('quran')}>{_t("Открыть Коран")}</button>}
        <button type="button" className={plan.course === 'newpath' ? 'pri-btn sx-wide' : 'ghost-btn'} onClick={() => onOpen('home')}>{_t("Вернуться в Практику")}</button>
      </div>
    );
  }

  const { run, prev } = view;
  if (view.v === 'plan') return <SPlanView state={state} update={update} today={today} run={run} onBack={() => go({ v: 'result', run, prev })} onDone={(n, goal, path) => go({ v: 'done', run, n, goal, path })} />;

  const r = rungOf(run.a);
  const pr = prev ? rungOf(prev.a) : undefined;
  const txt = rungText(r, me);
  const miss = gaps(run.a, r);
  const since = daysBetween(run.day, today);

  return (
    <div className="page sx">
      {back}
      <small className="sx-muted">{_t("Намаз и Коран")} · {fmt(run.day)}</small>
      <h1 className="page-h sx-h">{txt.head}</h1>
      <p>{txt.text}</p>
      {pr !== undefined && <p className="sx-muted">{r > pr ? _tj("Ступенька выше, чем в прошлый раз ({0}). Машаллах!", fmt(prev!.day)) : _tj("Прошлый раз ({0}) была та же ступень.", fmt(prev!.day))}</p>}

      <div className="sl-ladder">
        {[...RUNGS].reverse().map((x) => {
          const here = x.n === r;
          const done = x.n < r || (x.n === 4 && r === 4 && rungDone(run.a, 4));
          return (
            <div key={x.n} className={`sl-rung${here ? ' here' : ''}${done && !here ? ' done' : ''}`}>
              <span className="sl-k">{done && !here ? '✓' : x.n}</span>
              <span className="sl-t"><b>{x.title}</b><small>{x.sub}</small></span>
              {here && <span className="sx-lbl weak">{_t("Ты здесь")}</span>}
            </div>
          );
        })}
      </div>

      {miss.length > 0 && (
        <div className="sx-box">
          <b>{_t("На этой ступени пока нет:")}</b>
          {miss.map((q) => <p key={q} className="um-left"><i />{q}</p>)}
        </div>
      )}

      <button type="button" className="pri-btn sx-wide" onClick={() => go({ v: 'plan', run, prev })}>{run.habits ? _t("Посмотреть план ещё раз") : _tj("Мой план · {0} минут в день", minutesOf(run.a))}</button>
      {run.day !== today && (
        <button type="button" className="ghost-btn" onClick={() => { setA([]); go({ v: 'q', i: 0 }); }}>
          {since >= SALAH_REPEAT ? _t("Пора пройти снова") : _tj("Пройти снова (рекомендуем через {0} дн.)", SALAH_REPEAT - since)}
        </button>
      )}
    </div>
  );
}

function SPlanView({ state, update, today, run, onBack, onDone }: { state: AppState; update: Props['update']; today: string; run: TestRun; onBack: () => void; onDone: (n: number, goal: boolean, path: boolean) => void }) {
  const plan = planOf(run.a);
  const [list, setList] = useState<SHabit[]>(plan.habits);
  const [goalOn, setGoalOn] = useState(true);
  const pathAlready = npOf(state).on;
  const [pathOn, setPathOn] = useState(!pathAlready);
  const picks = list.filter((h) => h.on);

  const add = () => {
    update((s) => {
      const r = applySalahPlan(s, plan, picks, goalOn, pathOn && !pathAlready, today);
      return saveRun(r.s, { ...run, habits: r.habitIds, goal: r.goalId }, SALAH_TEST);
    });
    onDone(picks.length, goalOn, !!plan.newpath && pathOn && !pathAlready);
  };

  return (
    <div className="page sx">
      <button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← Результат")}</button>
      <h1 className="page-h sx-h">{_t("Твой следующий шаг")}</h1>

      {plan.newpath && (
        <div className="sx-list">
          {pathAlready ? (
            <div className="sx-hab"><span><b>{_t("«Новый путь» уже включён")}</b><small>{_t("Урок дня на «Сегодня»: омовение, первый намаз, первые суры.")}</small></span></div>
          ) : (
            <label className="sx-hab">
              <input type="checkbox" checked={pathOn} onChange={() => setPathOn(!pathOn)} />
              <span><b>{_t("Включить «Новый путь»")}</b><small>{_t("Урок дня на «Сегодня»: омовение, первый намаз, первые суры. По одному шагу, без спешки.")}</small></span>
            </label>
          )}
        </div>
      )}
      {plan.course === 'ar' && <p className="sx-quote">{_t("Курс «Арабский по дням» уже есть в Практике → Языки. Привычка ниже будет открывать его.")}</p>}

      <div className="pgl">{_t("Привычки")}</div>
      <div className="sx-list">
        {list.map((h, k) => (
          <label key={h.key} className="sx-hab">
            <input type="checkbox" checked={h.on} onChange={() => setList(list.map((x, j) => (j === k ? { ...x, on: !x.on } : x)))} />
            <span><b>{h.action}</b><small>{_tj("минимум: {0}", h.min)}</small></span>
          </label>
        ))}
      </div>

      <div className="pgl">{_t("Цель")}</div>
      <div className="sx-list">
        <label className="sx-hab">
          <input type="checkbox" checked={goalOn} onChange={() => setGoalOn(!goalOn)} />
          <span><b>{plan.goal.title}</b><small>{plan.goal.sub}</small></span>
        </label>
      </div>

      <button type="button" className="pri-btn sx-wide" disabled={!picks.length && !goalOn && !(pathOn && plan.newpath && !pathAlready)} onClick={add}>{_t("Добавить в мой план")}</button>
      <p className="tiny">{_t("Привычки появятся на «Сегодня» с напоминанием после намаза. Всё можно поменять или убрать потом.")}</p>
    </div>
  );
}
