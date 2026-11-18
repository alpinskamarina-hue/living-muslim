import { useState } from 'react';
import type { AppState, UmrahState } from '../types';
import { uid } from '../store';
import { umrahOf } from './Umrah';
import type { UmrahApi, UShared } from '../umrahCircle';
import { _t, _tj, LOC } from '../i18n';

// Saving up for umrah: for myself, and for a parent. The money stays in the person's own bank;
// the app only keeps the sums, shows the way and how much a week it takes to arrive on time.

type Fund = NonNullable<UmrahState['funds']>[number];
const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const sum = (f: Fund) => f.entries.reduce((a, e) => a + e.amt, 0);
const money = (n: number, cur: string) => `${cur}${Math.round(n).toLocaleString(LOC)}`;
const weeksTo = (date: string | undefined, today: string) => (date ? Math.max(1, Math.ceil((Date.parse(date) - Date.parse(today)) / (7 * 86400000))) : null);

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string; compact?: boolean; onOpen?: () => void; api?: UmrahApi; nameOf?: (id: string) => string }

export function UmrahSavings({ state, update, today, compact, onOpen, api, nameOf }: Props) {
  const u = umrahOf(state);
  const funds = u.funds ?? [];
  const mine = funds.find((f) => !f.for);
  const gifts = funds.filter((f) => f.for);
  const setFunds = (fn: (l: Fund[]) => Fund[]) => update((s) => patch(s, { funds: fn(umrahOf(s).funds ?? []) }));
  const add = (id: string, amt: number, who?: string) => setFunds((l) => l.map((f) => (f.id === id ? { ...f, entries: [...f.entries, { d: today, amt, who }] } : f)));
  const undo = (id: string) => setFunds((l) => l.map((f) => (f.id === id ? { ...f, entries: f.entries.slice(0, -1) } : f)));

  if (compact) {
    if (!mine) return (
      <button type="button" className="sv-start" onClick={onOpen}>
        <b>{_t("Начни копилку на умру")}</b><small>{_t("Поставь сумму, и приложение покажет, сколько откладывать в неделю")}</small>
      </button>
    );
    return <FundCard f={mine} today={today} date={mine.by ?? u.from} onAdd={(a) => add(mine.id, a)} onUndo={() => undo(mine.id)} compact />;
  }

  return (
    <div className="sv">
      <h3>{_t("Копилка на умру")}</h3>
      {mine ? (
        <FundCard f={mine} today={today} date={mine.by ?? u.from} onAdd={(a) => add(mine.id, a)} onUndo={() => undo(mine.id)}
          onEdit={(p) => setFunds((l) => l.map((x) => (x.id === mine.id ? { ...x, ...p } : x)))} onDelete={() => setFunds((l) => l.filter((x) => x.id !== mine.id))} />
      ) : (
        <NewFund onCreate={(goal, cur, by) => setFunds((l) => [...l, { id: uid(), goal, cur, by, entries: [] }])} />
      )}

      <h3>{_t("Отправить родителей на умру")}</h3>
      <p className="tiny">{_tj("Самый большой подарок маме или отцу. {0}", api?.me ? _t("Общую копилку видят все в твоём Круге: братья и сёстры вносят сами со своих телефонов.") : _t("Можно копить вместе с братьями и сёстрами: отмечай, кто сколько внёс."))}</p>
      {api?.me && <SharedFunds api={api} today={today} nameOf={nameOf ?? ((x) => x)} />}
      {gifts.map((g) => (
        <FundCard key={g.id} f={g} today={today} date={g.by} onAdd={(a, who) => add(g.id, a, who)} onUndo={() => undo(g.id)} withWho
          onEdit={(p) => setFunds((l) => l.map((x) => (x.id === g.id ? { ...x, ...p } : x)))} onDelete={() => setFunds((l) => l.filter((x) => x.id !== g.id))} />
      ))}
      <NewFund gift shared={!!api?.me} onCreate={(goal, cur, by, forWho) => {
        if (api?.me) { const d = api.funds[api.me] ?? {}; api.saveFund({ ...d, own: [...(d.own ?? []), { id: uid(), goal, cur, by, for: forWho! }] }); }
        else setFunds((l) => [...l, { id: uid(), goal, cur, by, for: forWho, entries: [] }]);
      }} />
      <p className="tiny">{_t("Деньги лежат у тебя, приложение только считает. Подсказка по цене: из Европы и России умра на 10–14 дней обычно стоит €1000–1800, в Рамадан заметно дороже.")}</p>
    </div>
  );
}

function FundCard({ f, today, date, onAdd, onUndo, onEdit, onDelete, compact, withWho, noWhoInput }: {
  f: Fund; today: string; date?: string; onAdd: (amt: number, who?: string) => void; onUndo?: () => void;
  onEdit?: (p: Partial<Fund>) => void; onDelete?: () => void; compact?: boolean; withWho?: boolean; noWhoInput?: boolean;
}) {
  const [amt, setAmt] = useState('');
  const [who, setWho] = useState('');
  const [edit, setEdit] = useState(false);
  const have = sum(f);
  const pct = Math.min(100, Math.round((have / f.goal) * 100));
  const left = Math.max(0, f.goal - have);
  const w = weeksTo(date, today);
  const perWeek = w ? left / w : null;
  const people = withWho ? [...new Set(f.entries.map((e) => e.who).filter(Boolean))] : [];
  const quick = [10, 25, 50, 100];
  const put = (n: number) => { if (n > 0) { onAdd(n, who.trim() || undefined); setAmt(''); } };

  return (
    <div className={`sv-card${compact ? ' compact' : ''}${pct >= 100 ? ' full' : ''}`}>
      <div className="sv-top">
        <b>{f.for ? _t("Умра для: {0}", f.for) : _t("Моя умра")}</b>
        <span>{money(have, f.cur)} <small>{_tj("из {0}", money(f.goal, f.cur))}</small></span>
      </div>
      <div className="sv-bar"><i style={{ width: `${pct}%` }} /></div>
      <small className="sv-sub">
        {pct >= 100 ? _t("Собрано, альхамдулиллях. Пора выбирать даты.")
          : perWeek ? _t("{0}% пути · по {1} в неделю, и к {2} хватит", pct, money(perWeek, f.cur), new Date(date!).toLocaleDateString(LOC, { day: 'numeric', month: 'long' }))
          : _t("{0}% пути · осталось {1}", pct, money(left, f.cur))}
        {people.length > 0 && _t(" · вносят: {0}", people.join(', '))}
      </small>
      {pct < 100 && (
        <>
          <div className="sv-quick">
            {quick.map((q) => <button key={q} type="button" onClick={() => put(q)}>+{f.cur}{q}</button>)}
          </div>
          {!compact && (
            <div className="up-add">
              <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={_t("Сумма")} aria-label={_t("Сумма")} />
              {withWho && !noWhoInput && <input value={who} onChange={(e) => setWho(e.target.value)} placeholder={_t("Кто внёс")} aria-label={_t("Кто внёс")} />}
              <button type="button" className="pri-btn" onClick={() => put(Number(amt.replace(',', '.')))} disabled={!(Number(amt.replace(',', '.')) > 0)}>{_t("Отложить")}</button>
            </div>
          )}
        </>
      )}
      {!compact && (
        <div className="sv-acts">
          {f.entries.length > 0 && onUndo && <button type="button" className="link-btn" onClick={onUndo}>{noWhoInput ? _t("Отменить мой последний взнос") : _t("Отменить последнее")}</button>}
          {onEdit && <button type="button" className="link-btn" onClick={() => setEdit(!edit)}>{_t("Изменить")}</button>}
        </div>
      )}
      {edit && onEdit && (
        <div className="up-add">
          <input inputMode="decimal" defaultValue={f.goal} onChange={(e) => { const n = Number(e.target.value); if (n > 0) onEdit({ goal: n }); }} aria-label={_t("Цель")} />
          <input type="date" defaultValue={f.by} onChange={(e) => onEdit({ by: e.target.value || undefined })} aria-label={_t("К какой дате")} />
          {onDelete && <button type="button" className="link-btn" onClick={onDelete}>{_t("Удалить")}</button>}
        </div>
      )}
    </div>
  );
}

function NewFund({ onCreate, gift, shared }: { onCreate: (goal: number, cur: string, by?: string, forWho?: string) => void; gift?: boolean; shared?: boolean }) {
  const [open, setOpen] = useState(!gift);
  const [goal, setGoal] = useState(gift ? '1500' : '1200');
  const [cur, setCur] = useState('€');
  const [by, setBy] = useState('');
  const [forWho, setFor] = useState(_t("Мама"));
  if (!open) return <button type="button" className="sv-start" onClick={() => setOpen(true)}><b>+ {shared ? _t("Общая копилка на умру маме или отцу") : _t("Копить на умру маме или отцу")}</b></button>;
  const n = Number(goal.replace(',', '.'));
  return (
    <div className="sv-card">
      {gift && (
        <div className="sv-quick">{[_t("Мама"), _t("Папа"), _t("Родители")].map((x) => <button key={x} type="button" aria-pressed={forWho === x} onClick={() => setFor(x)}>{x}</button>)}</div>
      )}
      <div className="up-add">
        <select value={cur} onChange={(e) => setCur(e.target.value)} aria-label={_t("Валюта")}>{['€', '$', '₽', '₸', '£'].map((c) => <option key={c}>{c}</option>)}</select>
        <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label={_t("Сколько нужно")} />
        <input type="date" value={by} onChange={(e) => setBy(e.target.value)} aria-label={_t("К какой дате")} />
      </div>
      <small className="sv-sub">{_t("Сумма и к какой дате (необязательно). Если даты поездки уже указаны, возьмём их.")}</small>
      <button type="button" className="pri-btn" disabled={!(n > 0)} onClick={() => { onCreate(n, cur, by || undefined, gift ? forWho : undefined); if (gift) setOpen(false); }}>{gift ? _t("Начать копить: {0}", forWho) : _t("Начать копилку")}</button>
    </div>
  );
}

/** Boxes anyone in the Circle started for a parent. Each person writes only their own doc,
 *  so a gift is stored with the giver and the box total is the sum over everyone. */
function SharedFunds({ api, today, nameOf }: { api: UmrahApi; today: string; nameOf: (id: string) => string }) {
  const me = api.me!;
  const boxes: { owner: string; f: UShared }[] = Object.entries(api.funds).flatMap(([owner, d]) => (d.own ?? []).map((f) => ({ owner, f })));
  if (!boxes.length) return null;
  const mine = api.funds[me] ?? {};
  const give = (key: string, fn: (l: { d: string; amt: number }[]) => { d: string; amt: number }[]) => {
    const gave = { ...(mine.gave ?? {}) };
    const next = fn(gave[key] ?? []);
    if (next.length) gave[key] = next; else delete gave[key];
    return api.saveFund({ ...mine, gave });
  };
  return (
    <>
      {boxes.map(({ owner, f }) => {
        const key = `${owner}:${f.id}`;
        const entries = Object.entries(api.funds).flatMap(([who, d]) => (d.gave?.[key] ?? []).map((e) => ({ ...e, who: who === me ? _t("я") : nameOf(who) || _t("участник") })));
        const fund = { id: f.id, goal: f.goal, cur: f.cur, by: f.by, for: f.for, entries };
        const own = owner === me;
        const editOwn = (p: Partial<UShared>) => api.saveFund({ ...mine, own: (mine.own ?? []).map((x) => (x.id === f.id ? { ...x, ...p } : x)) });
        return (
          <div key={key} className="sv-shared">
            <FundCard f={fund} today={today} date={f.by} withWho onAdd={(a) => give(key, (l) => [...l, { d: today, amt: a }])}
              onUndo={(mine.gave?.[key] ?? []).length ? () => give(key, (l) => l.slice(0, -1)) : undefined}
              onEdit={own ? (p) => editOwn({ goal: p.goal ?? f.goal, by: 'by' in p ? p.by : f.by }) : undefined}
              onDelete={own ? () => api.saveFund({ ...mine, own: (mine.own ?? []).filter((x) => x.id !== f.id) }) : undefined} noWhoInput />
            <small className="sv-owner">{_tj("{0} · общая в Круге", own ? _t("Ты собираешь") : _t("Собирает {0}", nameOf(owner) || _t("участник Круга")))}</small>
          </div>
        );
      })}
    </>
  );
}
