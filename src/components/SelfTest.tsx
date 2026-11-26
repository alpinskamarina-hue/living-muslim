import { useState } from 'react';
import type { AppState, Sphere } from '../types';
import { _t, _tj, LOC } from '../i18n';
import { addDays } from '../dates';
import {
  BARRIERS, PARTS, QUESTIONS, SCALE, STRONG_TEXT, applyPlan, goalIdea, lastRun, partLow, partName, planReport,
  proposals, repeatIn, REPEAT_DAYS, result, runsOf, saveRun, zoneText, type Barrier, type Proposal, type TestRun,
} from '../selftest';
import { track } from '../usage';

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string; onExit: () => void }

type View = { v: 'intro' } | { v: 'q'; i: number } | { v: 'result'; run: TestRun; prev?: TestRun } | { v: 'plan'; run: TestRun; prev?: TestRun } | { v: 'done'; n: number; goal: boolean };

const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(LOC, { day: 'numeric', month: 'long' });

export function SelfTest({ state, update, today, onExit }: Props) {
  const last = lastRun(state);
  const runs = runsOf(state);
  const [view, setView] = useState<View>(() => (last ? { v: 'result', run: last, prev: runs[runs.length - 2] } : { v: 'intro' }));
  const [a, setA] = useState<number[]>([]);
  const go = (v: View) => { setView(v); window.scrollTo(0, 0); };

  const back = <button type="button" className="link-btn pro-back" onClick={onExit}>{_t("← Практика")}</button>;

  if (view.v === 'intro') return (
    <div className="page sx">
      {back}
      <h1 className="page-h">{_t("Что мне даётся труднее")}</h1>
      <p className="page-sub">{_t("13 коротких вопросов о шести частях жизни: вера, тело, питание, ум, семья, дело. Около 3 минут.")}</p>
      <div className="sx-box">
        <p>{_t("В конце ты увидишь свою сильную сторону и две части, где сейчас труднее всего. Под них сразу будет план на месяц: 2–3 маленькие привычки и одна цель.")}</p>
        <p>{_t("Здесь нет правильных ответов и нет «типов». Отвечай, как есть сейчас, а не как хотелось бы.")}</p>
        <p className="sx-muted">{_t("🔒 Ответы видишь только ты, они хранятся на твоём телефоне.")}</p>
      </div>
      <button type="button" className="pri-btn sx-wide" onClick={() => { setA([]); go({ v: 'q', i: 0 }); }}>{_t("Начать")}</button>
    </div>
  );

  if (view.v === 'q') {
    const i = view.i;
    const n = QUESTIONS.length + 1;
    const isLast = i === QUESTIONS.length;
    const q = QUESTIONS[i];
    const pick = (val: number) => {
      const next = [...a]; next[i] = val; setA(next);
      if (i + 1 < QUESTIONS.length + 1) setTimeout(() => go({ v: 'q', i: i + 1 }), 180);
    };
    const finish = (b: Barrier) => {
      const run: TestRun = { day: today, a: a.slice(0, QUESTIONS.length), b };
      const before = runs.filter((r) => r.day !== today);
      const prev = before[before.length - 1];
      update((s) => saveRun(s, run));
      track('tests', 'test_done');
      go({ v: 'result', run, prev });
    };
    return (
      <div className="page sx">
        <div className="sx-top">
          <button type="button" className="sx-x" aria-label={_t("Назад")} onClick={() => (i === 0 ? (last ? go({ v: 'result', run: last, prev: runs[runs.length - 2] }) : go({ v: 'intro' })) : go({ v: 'q', i: i - 1 }))}>←</button>
          <span>{_tj("Вопрос {0} из {1}", i + 1, n)}</span>
        </div>
        <div className="sx-prog"><i style={{ width: `${((i + 1) / n) * 100}%` }} /></div>
        {!isLast ? (
          <>
            <span className="sx-part" data-sphere={q.part}>{partName(q.part)}</span>
            <p className="sx-q">{q.q}</p>
            <div className="sx-opts">
              {SCALE.map((t, v) => (
                <button key={v} type="button" className="sx-opt" aria-pressed={a[i] === v} onClick={() => pick(v)}>{t}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="sx-part">{_t("Последний вопрос")}</span>
            <p className="sx-q">{_t("Когда привычка срывается, чаще всего потому что…")}</p>
            <div className="sx-opts">
              {BARRIERS.map((b) => <button key={b.id} type="button" className="sx-opt" onClick={() => finish(b.id)}>{b.label}</button>)}
            </div>
          </>
        )}
      </div>
    );
  }

  if (view.v === 'done') return (
    <div className="page sx">
      {back}
      <div className="sx-box sx-done">
        <b>{_t("План добавлен, бисмиллях")}</b>
        <p>{view.n ? _tj("Привычки ({0}) уже на «Сегодня».", view.n) : ''} {view.goal ? _t("Цель на месяц ждёт во вкладке «Цели».") : ''}</p>
        <p className="sx-muted">{_tj("Через 30 дней, {0}, напомним пройти тест снова. Тогда увидишь, что изменилось.", fmt(addDays(today, REPEAT_DAYS)))}</p>
      </div>
      <button type="button" className="pri-btn sx-wide" onClick={onExit}>{_t("Вернуться в Практику")}</button>
    </div>
  );

  // ---- result / plan ----
  const { run, prev } = view;
  const res = result(run.a);
  const pres = prev ? result(prev.a) : undefined;
  const isOld = run.day !== today;
  const left = repeatIn(run, today);

  if (view.v === 'plan') return <Plan state={state} update={update} today={today} run={run} onBack={() => go({ v: 'result', run, prev })} onDone={(n, goal) => go({ v: 'done', n, goal })} />;

  const deltas = pres ? PARTS.map((p) => ({ p, d: res.sc[p] - pres.sc[p] })) : [];
  const grew = deltas.filter((x) => x.d > 0).sort((x, y) => y.d - x.d)[0];
  const report = prev ? planReport(state, prev, run.day) : [];
  const head = pres
    ? (grew ? _tj("Сильнее всего выросло: {0}, +{1}", partLow(grew.p), grew.d) : _t("Пока без больших перемен. Это нормально: привычки растут медленно."))
    : _tj("Твоя опора: {0}. Начнём с: {1} и {2}", partLow(res.strong), partLow(res.zones[0]), partLow(res.zones[1]));

  return (
    <div className="page sx">
      {back}
      <small className="sx-muted">{_t("Что мне даётся труднее")} · {fmt(run.day)}</small>
      <h1 className="page-h sx-h">{head}</h1>
      {pres && <p className="sx-muted">{_tj("Серая черта показывает прошлый раз, {0}.", fmt(prev!.day))}</p>}

      <div className="sx-bars">
        {res.ranked.map((p) => {
          const d = pres ? res.sc[p] - pres.sc[p] : 0;
          return (
            <div key={p} className="sx-bar" data-sphere={p}>
              <span>{partName(p)}</span>
              <span className="sx-t"><i style={{ width: `${Math.max(3, (res.sc[p] / 6) * 100)}%` }} />{pres && <s style={{ left: `${(pres.sc[p] / 6) * 100}%` }} />}</span>
              <span className={`sx-n${d > 0 ? ' sx-up' : d < 0 ? ' sx-down' : ''}`}>{pres ? (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0') : `${res.sc[p]}/6`}</span>
            </div>
          );
        })}
      </div>

      {report.length > 0 && (
        <div className="sx-box">
          <b>{_t("Как держались привычки из прошлого плана")}</b>
          {report.map((r) => <p key={r.action} className="sx-line">{_tj("{0}: {1} дн. из {2}", r.action, r.done, r.days)}</p>)}
        </div>
      )}

      <div className="sx-box">
        <span className="sx-lbl strong">{_t("Сильная сторона")} · {partName(res.strong)}</span>
        <p>{STRONG_TEXT[res.strong]}</p>
      </div>
      <div className="sx-box">
        <span className="sx-lbl weak">{_tj("Зоны роста: {0}, {1}", partLow(res.zones[0]), partLow(res.zones[1]))}</span>
        <p>{zoneText(res.sc[res.zones[0]])}</p>
        <p className="sx-muted">{partName(res.zones[0])} {res.sc[res.zones[0]]}/6 · {partLow(res.zones[1])} {res.sc[res.zones[1]]}/6</p>
      </div>

      <button type="button" className="pri-btn sx-wide" onClick={() => go({ v: 'plan', run, prev })}>{run.habits ? _t("Посмотреть план ещё раз") : _t("Мой план на месяц")}</button>
      {isOld && (
        <button type="button" className="ghost-btn" onClick={() => { setA([]); go({ v: 'q', i: 0 }); }}>
          {left <= 0 ? _t("Пора пройти снова") : _tj("Пройти снова (рекомендуем через {0} дн.)", left)}
        </button>
      )}
    </div>
  );
}

function Plan({ state, update, today, run, onBack, onDone }: { state: AppState; update: Props['update']; today: string; run: TestRun; onBack: () => void; onDone: (n: number, goal: boolean) => void }) {
  const [list, setList] = useState<Proposal[]>(() => proposals(run.a, run.b ?? 'forget'));
  const idea = goalIdea(run.a);
  const [goalOn, setGoalOn] = useState(true);
  const barrier = BARRIERS.find((b) => b.id === run.b) ?? BARRIERS[0];
  const picks = list.filter((p) => p.on);
  const toggle = (k: number) => setList(list.map((p, j) => (j === k ? { ...p, on: !p.on } : p)));
  const has = (p: Proposal) => state.habits.some((h) => h.action === p.action && h.status !== 'archived');
  const goalSub = idea.source === 'prayers' ? _t("Доля намазов вовремя, срок 30 дней")
    : idea.source === 'bookch' ? _t("Отмечаешь прочитанные главы, срок 30 дней")
    : _t("Держать выбранные привычки 80% дней, срок 30 дней");

  const add = () => {
    update((s) => {
      const r = applyPlan(s, picks, goalOn ? idea : null, today);
      return saveRun(r.s, { ...run, habits: r.habitIds, goal: r.goalId });
    });
    onDone(picks.length, goalOn);
  };

  return (
    <div className="page sx">
      <button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← Результат")}</button>
      <h1 className="page-h sx-h">{_tj("{0} шага, которые тебе по силам", list.length)}</h1>
      <div className="sx-quote">{_tj("Твой ответ: «{0}». ", barrier.label.toLowerCase())}{barrier.tip}</div>

      <div className="pgl">{_t("Привычки")}</div>
      <div className="sx-list">
        {list.map((p, k) => (
          <label key={p.qi} className="sx-hab">
            <input type="checkbox" checked={p.on} onChange={() => toggle(k)} />
            <span>
              <b>{p.action}</b>
              <small>{partName(p.part as Sphere)} · {_tj("минимум: {0}", p.min)}{has(p) ? _t(" · уже есть") : ''}</small>
              {(run.b === 'why' || k === 0) && <small className="sx-why">{p.why}</small>}
            </span>
          </label>
        ))}
      </div>

      <div className="pgl">{_t("Цель на месяц")}</div>
      <div className="sx-list">
        <label className="sx-hab">
          <input type="checkbox" checked={goalOn} onChange={() => setGoalOn(!goalOn)} />
          <span><b>{idea.title}</b><small>{goalSub}</small></span>
        </label>
      </div>

      <button type="button" className="pri-btn sx-wide" disabled={!picks.length && !goalOn} onClick={add}>{_t("Добавить в мой план")}</button>
      {run.b === 'alone' && <p className="tiny">{_t("Совет: открой Круг и предложи друзьям вызов на 7 дней с одной из этих привычек.")}</p>}
      <p className="tiny">{_t("Привычки появятся на «Сегодня» с напоминанием после намаза. Всё можно поменять или убрать потом.")}</p>
    </div>
  );
}
