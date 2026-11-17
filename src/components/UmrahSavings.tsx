import { useState } from 'react';
import type { AppState, UmrahState } from '../types';
import { uid } from '../store';
import { umrahOf } from './Umrah';

// Saving up for umrah: for myself, and for a parent. The money stays in the person's own bank;
// the app only keeps the sums, shows the way and how much a week it takes to arrive on time.

type Fund = NonNullable<UmrahState['funds']>[number];
const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const sum = (f: Fund) => f.entries.reduce((a, e) => a + e.amt, 0);
const money = (n: number, cur: string) => `${cur}${Math.round(n).toLocaleString('ru-RU')}`;
const weeksTo = (date: string | undefined, today: string) => (date ? Math.max(1, Math.ceil((Date.parse(date) - Date.parse(today)) / (7 * 86400000))) : null);

interface Props { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string; compact?: boolean; onOpen?: () => void }

export function UmrahSavings({ state, update, today, compact, onOpen }: Props) {
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
        <b>Начни копилку на умру</b><small>Поставь сумму, и приложение покажет, сколько откладывать в неделю</small>
      </button>
    );
    return <FundCard f={mine} today={today} date={mine.by ?? u.from} onAdd={(a) => add(mine.id, a)} onUndo={() => undo(mine.id)} compact />;
  }

  return (
    <div className="sv">
      <h3>Копилка на умру</h3>
      {mine ? (
        <FundCard f={mine} today={today} date={mine.by ?? u.from} onAdd={(a) => add(mine.id, a)} onUndo={() => undo(mine.id)}
          onEdit={(p) => setFunds((l) => l.map((x) => (x.id === mine.id ? { ...x, ...p } : x)))} onDelete={() => setFunds((l) => l.filter((x) => x.id !== mine.id))} />
      ) : (
        <NewFund onCreate={(goal, cur, by) => setFunds((l) => [...l, { id: uid(), goal, cur, by, entries: [] }])} />
      )}

      <h3>Отправить родителей на умру</h3>
      <p className="tiny">Самый большой подарок маме или отцу. Можно копить вместе с братьями и сёстрами: отмечай, кто сколько внёс.</p>
      {gifts.map((g) => (
        <FundCard key={g.id} f={g} today={today} date={g.by} onAdd={(a, who) => add(g.id, a, who)} onUndo={() => undo(g.id)} withWho
          onEdit={(p) => setFunds((l) => l.map((x) => (x.id === g.id ? { ...x, ...p } : x)))} onDelete={() => setFunds((l) => l.filter((x) => x.id !== g.id))} />
      ))}
      <NewFund gift onCreate={(goal, cur, by, forWho) => setFunds((l) => [...l, { id: uid(), goal, cur, by, for: forWho, entries: [] }])} />
      <p className="tiny">Деньги лежат у тебя, приложение только считает. Подсказка по цене: из Европы и России умра на 10–14 дней обычно стоит €1000–1800, в Рамадан заметно дороже.</p>
    </div>
  );
}

function FundCard({ f, today, date, onAdd, onUndo, onEdit, onDelete, compact, withWho }: {
  f: Fund; today: string; date?: string; onAdd: (amt: number, who?: string) => void; onUndo: () => void;
  onEdit?: (p: Partial<Fund>) => void; onDelete?: () => void; compact?: boolean; withWho?: boolean;
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
        <b>{f.for ? `Умра для: ${f.for}` : 'Моя умра'}</b>
        <span>{money(have, f.cur)} <small>из {money(f.goal, f.cur)}</small></span>
      </div>
      <div className="sv-bar"><i style={{ width: `${pct}%` }} /></div>
      <small className="sv-sub">
        {pct >= 100 ? 'Собрано, альхамдулиллях. Пора выбирать даты.'
          : perWeek ? `${pct}% пути · по ${money(perWeek, f.cur)} в неделю, и к ${new Date(date!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} хватит`
          : `${pct}% пути · осталось ${money(left, f.cur)}`}
        {people.length > 0 && ` · вносят: ${people.join(', ')}`}
      </small>
      {pct < 100 && (
        <>
          <div className="sv-quick">
            {quick.map((q) => <button key={q} type="button" onClick={() => put(q)}>+{f.cur}{q}</button>)}
          </div>
          {!compact && (
            <div className="up-add">
              <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Сумма" aria-label="Сумма" />
              {withWho && <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Кто внёс" aria-label="Кто внёс" />}
              <button type="button" className="pri-btn" onClick={() => put(Number(amt.replace(',', '.')))} disabled={!(Number(amt.replace(',', '.')) > 0)}>Отложить</button>
            </div>
          )}
        </>
      )}
      {!compact && (
        <div className="sv-acts">
          {f.entries.length > 0 && <button type="button" className="link-btn" onClick={onUndo}>Отменить последнее</button>}
          {onEdit && <button type="button" className="link-btn" onClick={() => setEdit(!edit)}>Изменить</button>}
        </div>
      )}
      {edit && onEdit && (
        <div className="up-add">
          <input inputMode="decimal" defaultValue={f.goal} onChange={(e) => { const n = Number(e.target.value); if (n > 0) onEdit({ goal: n }); }} aria-label="Цель" />
          <input type="date" defaultValue={f.by} onChange={(e) => onEdit({ by: e.target.value || undefined })} aria-label="К какой дате" />
          {onDelete && <button type="button" className="link-btn" onClick={onDelete}>Удалить</button>}
        </div>
      )}
    </div>
  );
}

function NewFund({ onCreate, gift }: { onCreate: (goal: number, cur: string, by?: string, forWho?: string) => void; gift?: boolean }) {
  const [open, setOpen] = useState(!gift);
  const [goal, setGoal] = useState(gift ? '1500' : '1200');
  const [cur, setCur] = useState('€');
  const [by, setBy] = useState('');
  const [forWho, setFor] = useState('Мама');
  if (!open) return <button type="button" className="sv-start" onClick={() => setOpen(true)}><b>+ Копить на умру маме или отцу</b></button>;
  const n = Number(goal.replace(',', '.'));
  return (
    <div className="sv-card">
      {gift && (
        <div className="sv-quick">{['Мама', 'Папа', 'Родители'].map((x) => <button key={x} type="button" aria-pressed={forWho === x} onClick={() => setFor(x)}>{x}</button>)}</div>
      )}
      <div className="up-add">
        <select value={cur} onChange={(e) => setCur(e.target.value)} aria-label="Валюта">{['€', '$', '₽', '₸', '£'].map((c) => <option key={c}>{c}</option>)}</select>
        <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="Сколько нужно" />
        <input type="date" value={by} onChange={(e) => setBy(e.target.value)} aria-label="К какой дате" />
      </div>
      <small className="sv-sub">Сумма и к какой дате (необязательно). Если даты поездки уже указаны, возьмём их.</small>
      <button type="button" className="pri-btn" disabled={!(n > 0)} onClick={() => { onCreate(n, cur, by || undefined, gift ? forWho : undefined); if (gift) setOpen(false); }}>{gift ? `Начать копить: ${forWho}` : 'Начать копилку'}</button>
    </div>
  );
}
