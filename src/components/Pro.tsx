import { useState } from 'react';
import { plural } from '../dates';
import { FREE, PRO as PRO_LIM, PRICES, type PlanId, usePlan, joinEarly, earlyPlan, leftLabel, inviteFriend } from '../plan';

// Pricing screen. 7 days of Pro open from the first day, then Free «по 3». No payments yet:
// «Оформить» puts the person on the list of first buyers and keeps Pro open until payment starts.

const FREE_LIST = [
  'Намазы, Коран с переводом, тасбих, фокус: навсегда',
  'Рамадан, садака, сафар, умра-гид: навсегда',
  `${FREE.habits} активные привычки вокруг намазов`,
  `${FREE.circles} круга, ${FREE.goals} активные цели`,
  `${FREE.books} книги и ${FREE.courses} видеокурса`,
];
const PRO_LIST = [
  `До ${PRO_LIM.habits} активных привычек и очередь «Скоро»`,
  `До ${PRO_LIM.circles} кругов и ${PRO_LIM.goals} активных целей`,
  'Книги и видеокурсы без ограничений',
  'Всё новое в Pro первым',
];
const NAME: Record<PlanId, string> = { year: 'Год', month: 'Месяц', family: 'Семья' };

export function ProPlans({ onBack }: { onBack: () => void }) {
  const p = usePlan();
  const [plan, setPlan] = useState<PlanId>(earlyPlan() ?? 'year');
  const [note, setNote] = useState('');
  const mine = earlyPlan();

  const buy = () => {
    joinEarly(plan);
    setNote('Ты в списке первых. Оплату ещё не подключили, поэтому Pro остаётся открытым, пока она не появится. Тогда приложение спросит тебя, само ничего не спишется.');
  };
  const soon = (what: string) => setNote(`${what} появится, когда подключим оплату.`);

  return (
    <div className="page pro">
      <button type="button" className="link-btn pro-back" onClick={onBack}>← Профиль</button>
      <div className="pro-hero">
        <span className="pro-badge">PRO</span>
        <h1>Living Muslim Pro</h1>
        <p>Всё, что касается поклонения, бесплатно навсегда. Pro для тех, кто растёт дальше: больше привычек, кругов и целей, книги и курсы без ограничений.</p>
      </div>

      {p.owner ? (
        <div className="pro-on">✓ Ты владелец приложения: всё открыто, тарифов для тебя нет</div>
      ) : p.early ? (
        <div className="pro-on">✓ Ты в списке первых ({NAME[mine ?? 'year']}). Pro открыт, пока не подключим оплату</div>
      ) : p.trial ? (
        <div className="pro-on">Pro открыт ещё {p.daysLeft} {plural(p.daysLeft, 'день', 'дня', 'дней')} · {leftLabel(p.msLeft)}<small>Потом бесплатный тариф: по {FREE.habits}</small></div>
      ) : (
        <div className="pro-on off">Сейчас бесплатный тариф: по {FREE.habits} привычки, круга, цели, книги и курса</div>
      )}

      <div className="pro-seg" role="tablist">
        {(['year', 'month', 'family'] as PlanId[]).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={plan === id} onClick={() => setPlan(id)}>
            {NAME[id]}
            {id === 'year' && <i>−37%</i>}
          </button>
        ))}
      </div>

      <div className="pro-price">
        <b>{PRICES[plan].price}</b> <span>{PRICES[plan].per}</span>
        {plan === 'year' && <s>€47.88</s>}
        <small>{PRICES[plan].note}</small>
      </div>

      {!p.early && !p.owner && <button type="button" className="pri-btn big-btn" onClick={buy}>{p.trial ? 'Оставить Pro' : 'Вернуть Pro'} за {PRICES[plan].price}</button>}
      {note && <p className="pro-note">{note}</p>}

      <div className="pro-cols">
        <div className="pro-col">
          <h3>Бесплатно</h3>
          <ul>{FREE_LIST.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div className="pro-col is-pro">
          <h3>Pro <small>всё из бесплатного, плюс</small></h3>
          <ul>{PRO_LIST.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>

      <div className="pro-card">
        <b>🤝 Позови друга</b>
        <p>Без бонусов и баллов: просто хорошее дело. Друг получит те же 7 дней Pro с первого дня.</p>
        <button type="button" className="ghost-btn" onClick={async () => { const r = await inviteFriend(); if (r === 'copied') setNote('Ссылка скопирована. Отправь её другу.'); }}>Отправить ссылку</button>
      </div>

      <div className="pro-card">
        <b>🎁 Подари Pro</b>
        <p>Год Pro брату или сестре как садака. Человек получит ссылку и откроет Pro без оплаты.</p>
        <button type="button" className="ghost-btn" onClick={() => soon('Подарок Pro')}>Подарить год за {PRICES.year.price}</button>
      </div>

      <div className="pro-card soft">
        <b>Не можешь оплатить?</b>
        <p>Студентам и тем, кому сейчас трудно, дадим Pro бесплатно. Без справок и объяснений.</p>
        <button type="button" className="link-btn" onClick={() => { joinEarly('year'); setNote('Принято. Pro открыт. Когда подключим оплату, такие просьбы будут одобряться сразу.'); }}>Попросить Pro бесплатно</button>
      </div>

      <ul className="pro-fair">
        <li>Без скрытых списаний: напомним за 3 дня до продления</li>
        <li>Возврат денег в течение 14 дней, без вопросов</li>
        <li>Твои данные не продаём и не показываем рекламу</li>
      </ul>
    </div>
  );
}
