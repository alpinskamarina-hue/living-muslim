// Nutrition modes, daily targets and typing in what you ate (step 1 of the food concept, 20.11).
import { useState } from 'react';
import { PIcon } from './PIcon';
import type { AppState, FoodBody, FoodItem, FoodState, Meal } from '../types';
import { ACT, FOODS, MODES, itemFrom, lastWeight, parseQuery, search, sum, target, type FoodRow } from '../foodcalc';
import { _t, _tj } from '../i18n';

type Update = (fn: (s: AppState) => AppState) => void;
const foodOf = (s: AppState): FoodState => ({ meals: {}, rules: ['sweet'], clean: {}, sunna: {}, weight: {}, ...(s.food ?? {}) });
const patch = (s: AppState, fn: (f: FoodState) => Partial<FoodState>): AppState => { const f = foodOf(s); return { ...s, food: { ...f, ...fn(f) } }; };
const num = (x: string) => Number(x.replace(',', '.'));

/** The line under the tabs: which mode is on, and the way to change it. */
export function ModeLine({ state, today, onOpen }: { state: AppState; today: string; onOpen: () => void }) {
  const f = foodOf(state);
  const m = MODES.find((x) => x.id === (f.mode ?? 'mera'))!;
  const t = target(state, f, today);
  return (
    <button type="button" className="fd-mode" onClick={onOpen}>
      <PIcon k={m.ic} cls="sm" />
      <span><b>{_tj("Режим: {0}", m.l)}</b><small>{t ? _tj("{0} ккал · белок {1} г", t.k, t.p) : f.mode && f.mode !== 'mera' ? _t("Заполни рост и вес, чтобы посчитать норму") : _t("Без калорий. Можно выбрать похудение или спорт")}</small></span>
      <em>{_t("Сменить ›")}</em>
    </button>
  );
}

/** Choose a mode and enter height, age, sex, activity and weight; shows the target it gives. */
export function ModeSetup({ state, update, today, onDone }: { state: AppState; update: Update; today: string; onDone: () => void }) {
  const f = foodOf(state);
  const [mode, setMode] = useState(f.mode ?? 'mera');
  const [h, setH] = useState(f.body?.h ? String(f.body.h) : '');
  const [age, setAge] = useState(f.body?.age ? String(f.body.age) : '');
  const [sex, setSex] = useState<FoodBody['sex'] | undefined>(f.body?.sex ?? state.settings.me);
  const [act, setAct] = useState<FoodBody['act']>(f.body?.act ?? 2);
  const lw = lastWeight(f);
  const [w, setW] = useState(lw ? String(lw).replace('.', ',') : '');
  const [kcal, setKcal] = useState(f.kcal ? String(f.kcal) : '');
  const ok = mode === 'mera' || (num(h) >= 120 && num(h) <= 230 && num(age) >= 10 && num(age) <= 100 && sex && num(w) > 25 && num(w) < 300);
  const young = num(age) > 0 && num(age) < 18;
  const draft = (): FoodState => ({
    ...f, mode,
    body: mode === 'mera' && !ok ? f.body : { h: Math.round(num(h)), age: Math.round(num(age)), sex: sex ?? 'm', act },
    weight: num(w) > 25 && num(w) < 300 && num(w) !== lw ? { ...f.weight, [today]: Math.round(num(w) * 10) / 10 } : f.weight,
    kcal: num(kcal) >= 1000 && num(kcal) <= 6000 ? Math.round(num(kcal)) : undefined,
  });
  const preview = ok && mode !== 'mera' ? target({ ...state, food: draft() }, draft(), today) : null;
  const save = () => { if (!ok) return; update((s) => ({ ...s, food: draft() })); onDone(); };
  return (
    <div className="fd-setup">
      <p className="q-msg left">{_t("Выбери, как питаешься сейчас. Режим можно сменить в любой день, записи сохранятся.")}</p>
      <div className="fd-modes">
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={mode === m.id} disabled={m.id === 'lose' && young} onClick={() => setMode(m.id)}>
            <PIcon k={m.ic} ball cls={mode === m.id ? 'has' : 'off'} />
            <b>{m.l}</b><small>{m.d}</small>
          </button>
        ))}
      </div>
      {young && <p className="q-msg left tiny-note">{_t("До 18 лет режим похудения не предлагаем: организм растёт. Лучше режим «Мера» и разговор с врачом.")}</p>}
      {mode !== 'mera' && (
        <div className="h-card fd-card fd-body">
          <b>{_t("О тебе")}</b>
          <small className="fd-muted">{_t("Нужно, чтобы посчитать норму. Видно только тебе.")}</small>
          <div className="fd-sex">
            <button type="button" aria-pressed={sex === 'm'} onClick={() => setSex('m')}>{_t("Брат")}</button>
            <button type="button" aria-pressed={sex === 'f'} onClick={() => setSex('f')}>{_t("Сестра")}</button>
          </div>
          <div className="fd-nums">
            <label><small>{_t("Рост, см")}</small><input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} placeholder="175" /></label>
            <label><small>{_t("Возраст")}</small><input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="30" /></label>
            <label><small>{_t("Вес, кг")}</small><input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} placeholder="75" /></label>
          </div>
          <small className="fd-lbl">{_t("Движение")}</small>
          <div className="fd-act">
            {ACT.map((a) => <button key={a.v} type="button" aria-pressed={act === a.v} onClick={() => setAct(a.v)}><b>{a.l}</b><small>{a.d}</small></button>)}
          </div>
          {preview && (
            <div className="fd-preview">
              <b>{_tj("{0} ккал в день", preview.k)}</b>
              <small>{_tj("белок {0} г · жиры {1} г · углеводы {2} г", preview.p, preview.f, preview.c)}</small>
              {preview.floor && <small>{_t("Не ниже безопасного минимума, поэтому дефицит меньше.")}</small>}
              {mode === 'sport' && <small>{_t("В дни, когда в Здоровье отмечена тренировка, норма на 250 ккал больше.")}</small>}
            </div>
          )}
          <label className="fd-own"><small>{_t("Своя норма, ккал (если назначил тренер или врач)")}</small><input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder={_t("по расчёту")} /></label>
        </div>
      )}
      <p className="q-msg left tiny-note">{_t("Это ориентир, а не медицинский совет. При болезнях, беременности, кормлении грудью или диабете посоветуйся с врачом.")}</p>
      <div className="fd-actions">
        <button type="button" className="link-btn" onClick={onDone}>{_t("Отмена")}</button>
        <button type="button" className="pri-btn" disabled={!ok} onClick={save}>{_t("Сохранить")}</button>
      </div>
    </div>
  );
}

function Ring({ v, of, label, unit }: { v: number; of: number; label: string; unit: string }) {
  const pct = Math.min(1, of ? v / of : 0), R = 34, C = 2 * Math.PI * R;
  const over = v > of * 1.05;
  return (
    <div className={`fd-ring${over ? ' over' : ''}`}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r={R} className="bg" />
        {pct > 0 && <circle cx="40" cy="40" r={R} className="fg" strokeDasharray={`${pct * C} ${C}`} transform="rotate(-90 40 40)" />}
      </svg>
      <span><b>{Math.round(v)}</b><small>{_tj("из {0} {1}", of, unit)}</small></span>
      <em>{label}</em>
    </div>
  );
}

/** The «Еда сегодня» card: rings for kcal and protein, fat and carbs bars, typed entries by meal. */
export function Tracker({ state, update, today, slots, cur }: { state: AppState; update: Update; today: string; slots: { id: Meal; l: string }[]; cur: Meal }) {
  const f = foodOf(state);
  const t = target(state, f, today);
  const items = f.log?.[today] ?? [];
  const tot = sum(items);
  const [q, setQ] = useState('');
  const [meal, setMeal] = useState<Meal>(cur);
  const [chosen, setChosen] = useState<{ row: FoodRow; g: string } | null>(null);
  const [own, setOwn] = useState<{ n: string; k: string; p: string } | null>(null);
  const parsed = parseQuery(q);
  const hits = q.trim().length > 1 ? search(parsed.text) : [];
  const gramsFor = (row: FoodRow) => parsed.grams ?? (parsed.count ? parsed.count * row.g : row.g);
  const add = (it: FoodItem) => { update((s) => patch(s, (x) => ({ log: { ...(x.log ?? {}), [today]: [...(x.log?.[today] ?? []), it] } }))); setQ(''); setChosen(null); setOwn(null); };
  const del = (id: string) => update((s) => patch(s, (x) => ({ log: { ...(x.log ?? {}), [today]: (x.log?.[today] ?? []).filter((i) => i.id !== id) } })));
  const label = (m: Meal) => slots.find((x) => x.id === m)?.l ?? m;
  const bar = (v: number, of: number, l: string) => (
    <div className="fd-bar"><small>{l}</small><i><u style={{ width: `${Math.min(100, of ? (v / of) * 100 : 0)}%` }} /></i><small>{_tj("{0} / {1} г", Math.round(v), of)}</small></div>
  );
  if (!t) return null;
  const left = t.k - tot.k;
  return (
    <div className="h-card fd-card fd-track">
      <div className="meal-h"><b>{_t("Еда сегодня")}</b><small>{left >= 0 ? _tj("осталось {0} ккал", left) : _tj("больше нормы на {0} ккал", -left)}</small></div>
      <div className="fd-rings">
        <Ring v={tot.k} of={t.k} label={_t("ккал")} unit="" />
        <Ring v={tot.p} of={t.p} label={_t("белок")} unit={_t("г")} />
        <div className="fd-bars">{bar(tot.f, t.f, _t("жиры"))}{bar(tot.c, t.c, _t("углеводы"))}{t.train && <small className="fd-train">{_t("Сегодня тренировка: +250 ккал")}</small>}</div>
      </div>

      <div className="fd-slots" role="group" aria-label={_t("Куда записать")}>
        {slots.map((m) => <button key={m.id} type="button" aria-pressed={meal === m.id} onClick={() => setMeal(m.id)}>{m.l}</button>)}
      </div>
      {!chosen && !own && (
        <div className="fd-find">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={_t("Что съел? Например: плов 300 или 2 яйца")} aria-label={_t("Что съел")} />
          {hits.length > 0 && (
            <ul className="fd-hits">
              {hits.map((row) => { const g = gramsFor(row); return (
                <li key={row.id}><button type="button" onClick={() => setChosen({ row, g: String(g) })}>
                  <b>{row.n}</b><small>{_tj("{0} г · {1} ккал", g, Math.round((row.k * g) / 100))}</small>
                </button></li>
              ); })}
            </ul>
          )}
          {q.trim().length > 1 && (
            <button type="button" className="link-btn fd-ownbtn" onClick={() => setOwn({ n: parsed.text || q.trim(), k: '', p: '' })}>{hits.length ? _t("Нет в списке? Записать своё блюдо") : _t("Не нашёл. Записать своё блюдо с калориями")}</button>
          )}
        </div>
      )}
      {chosen && (
        <div className="fd-chosen">
          <b>{chosen.row.n}</b>
          <div className="fd-grams">
            {chosen.row.u && [1, 2, 3].map((n) => <button key={n} type="button" aria-pressed={num(chosen.g) === n * chosen.row.g} onClick={() => setChosen({ ...chosen, g: String(n * chosen.row.g) })}>{n} {chosen.row.u}</button>)}
            {!chosen.row.u && [0.5, 1, 1.5].map((n) => { const g = Math.round(n * chosen.row.g); return <button key={n} type="button" aria-pressed={num(chosen.g) === g} onClick={() => setChosen({ ...chosen, g: String(g) })}>{_tj("{0} г", g)}</button>; })}
            <label><input inputMode="numeric" value={chosen.g} onChange={(e) => setChosen({ ...chosen, g: e.target.value })} aria-label={_t("Граммы")} /><small>{_t("г")}</small></label>
          </div>
          {num(chosen.g) > 0 && <small>{_tj("{0} ккал · белок {1} г · жиры {2} г · углеводы {3} г", Math.round((chosen.row.k * num(chosen.g)) / 100), Math.round((chosen.row.p * num(chosen.g)) / 100), Math.round((chosen.row.f * num(chosen.g)) / 100), Math.round((chosen.row.c * num(chosen.g)) / 100))}</small>}
          <div className="fd-actions">
            <button type="button" className="link-btn" onClick={() => setChosen(null)}>{_t("Назад")}</button>
            <button type="button" className="pri-btn" disabled={!(num(chosen.g) > 0 && num(chosen.g) < 3000)} onClick={() => add(itemFrom(chosen.row, num(chosen.g), meal))}>{_tj("Записать в «{0}»", label(meal))}</button>
          </div>
        </div>
      )}
      {own && (
        <div className="fd-chosen">
          <div className="fd-nums">
            <label className="wide"><small>{_t("Блюдо")}</small><input value={own.n} maxLength={40} onChange={(e) => setOwn({ ...own, n: e.target.value })} /></label>
            <label><small>{_t("ккал")}</small><input inputMode="numeric" value={own.k} onChange={(e) => setOwn({ ...own, k: e.target.value })} placeholder="400" /></label>
            <label><small>{_t("белок, г")}</small><input inputMode="numeric" value={own.p} onChange={(e) => setOwn({ ...own, p: e.target.value })} placeholder={_t("не знаю")} /></label>
          </div>
          <small className="fd-muted">{_t("Калории обычно есть на упаковке или в меню.")}</small>
          <div className="fd-actions">
            <button type="button" className="link-btn" onClick={() => setOwn(null)}>{_t("Назад")}</button>
            <button type="button" className="pri-btn" disabled={!(own.n.trim() && num(own.k) > 0 && num(own.k) < 5000)} onClick={() => add({ id: `fi-${Date.now().toString(36)}`, n: own.n.trim(), g: 0, k: Math.round(num(own.k)), p: num(own.p) > 0 ? Math.round(num(own.p)) : 0, f: 0, c: 0, m: meal })}>{_tj("Записать в «{0}»", label(meal))}</button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="fd-log">
          {(['b', 'l', 'd'] as Meal[]).filter((m) => items.some((i) => i.m === m)).map((m) => {
            const l = items.filter((i) => i.m === m);
            return (
              <div key={m}>
                <small className="fd-lbl">{_tj("{0} · {1} ккал", label(m), sum(l).k)}</small>
                {l.map((i) => (
                  <div key={i.id} className="fd-li">
                    <span><b>{i.n}</b><small>{i.g ? _tj("{0} г · {1} ккал · белок {2} г", i.g, i.k, Math.round(i.p)) : _tj("{0} ккал", i.k)}</small></span>
                    <button type="button" className="icon-btn" aria-label={_tj("Убрать {0}", i.n)} onClick={() => del(i.id)}>✕</button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <small className="fd-muted">{_tj("Цифры примерные, ±20%. В списке {0} блюд, своё можно записать с калориями с упаковки.", FOODS.length)}</small>
    </div>
  );
}
