import { useState } from 'react';
import { plural } from '../dates';
import { FREE, PRO as PRO_LIM, PRICES, type PlanId, usePlan, joinEarly, earlyPlan, leftLabel, inviteFriend } from '../plan';
import { _t, _tj, LOC } from '../i18n';

// Pricing screen. 7 days of Pro open from the first day, then Free «по 3». No payments yet:
// «Оформить» puts the person on the list of first buyers and keeps Pro open until payment starts.

const FREE_LIST = [
  _t("Намазы, Коран с переводом, тасбих, фокус: навсегда"),
  _t("Рамадан, садака, сафар, умра-гид: навсегда"),
  _t("{0} активные привычки вокруг намазов", FREE.habits),
  _t("{0} круга, {1} активные цели", FREE.circles, FREE.goals),
  _t("{0} книги и {1} видеокурса", FREE.books, FREE.courses),
];
const PRO_LIST = [
  _t("До {0} активных привычек и очередь «Скоро»", PRO_LIM.habits),
  _t("До {0} кругов и {1} активных целей", PRO_LIM.circles, PRO_LIM.goals),
  _t("Книги и видеокурсы без ограничений"),
  _t("Всё новое в Pro первым"),
];
const NAME: Record<PlanId, string> = { year: _t("Год"), month: _t("Месяц"), family: _t("Семья") };

export function ProPlans({ onBack }: { onBack: () => void }) {
  const p = usePlan();
  const [plan, setPlan] = useState<PlanId>(earlyPlan() ?? 'year');
  const [note, setNote] = useState('');
  const mine = earlyPlan();

  const buy = () => {
    joinEarly(plan);
    setNote(_t("Ты в списке первых. Оплату ещё не подключили, поэтому Pro остаётся открытым, пока она не появится. Тогда приложение спросит тебя, само ничего не спишется."));
  };
  const soon = (what: string) => setNote(_t("{0} появится, когда подключим оплату.", what));

  return (
    <div className="page pro">
      <button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← Профиль")}</button>
      <div className="pro-hero">
        <span className="pro-badge">PRO</span>
        <h1>Living Muslim Pro</h1>
        <p>{_t("Всё, что касается поклонения, бесплатно навсегда. Pro для тех, кто растёт дальше: больше привычек, кругов и целей, книги и курсы без ограничений.")}</p>
      </div>

      {p.owner ? (
        <div className="pro-on">{_t("✓ Ты владелец приложения: всё открыто, тарифов для тебя нет")}</div>
      ) : p.gift && p.giftEnds ? (
        <div className="pro-on">{_tj("✓ Pro в подарок на первый год, до {0}", p.giftEnds.toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: 'numeric' }))}<small>{_t("Для тех, кто недавно принял ислам. Платить ничего не нужно")}</small></div>
      ) : p.early ? (
        <div className="pro-on">{_tj("✓ Ты в списке первых ({0}). Pro открыт, пока не подключим оплату", NAME[mine ?? 'year'])}</div>
      ) : p.trial ? (
        <div className="pro-on">{_tj("Pro открыт ещё {0}  {1} · {2}", p.daysLeft, plural(p.daysLeft, _t("день"), _t("дня"), _t("дней")), leftLabel(p.msLeft))}<small>{_tj("Потом бесплатный тариф: по {0}", FREE.habits)}</small></div>
      ) : (
        <div className="pro-on off">{_tj("Сейчас бесплатный тариф: по {0} привычки, круга, цели, книги и курса", FREE.habits)}</div>
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

      {!p.early && !p.owner && !p.gift && <button type="button" className="pri-btn big-btn" onClick={buy}>{_tj("{0} за {1}", p.trial ? _t("Оставить Pro") : _t("Вернуть Pro"), PRICES[plan].price)}</button>}
      {note && <p className="pro-note">{note}</p>}

      <div className="pro-cols">
        <div className="pro-col">
          <h3>{_t("Бесплатно")}</h3>
          <ul>{FREE_LIST.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div className="pro-col is-pro">
          <h3>Pro <small>{_t("всё из бесплатного, плюс")}</small></h3>
          <ul>{PRO_LIST.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>

      <div className="pro-card">
        <b>{_t("🤝 Позови друга")}</b>
        <p>{_t("Без бонусов и баллов: просто хорошее дело. Друг получит те же 7 дней Pro с первого дня.")}</p>
        <button type="button" className="ghost-btn" onClick={async () => { const r = await inviteFriend(); if (r === 'copied') setNote(_t("Ссылка скопирована. Отправь её другу.")); }}>{_t("Отправить ссылку")}</button>
      </div>

      <div className="pro-card">
        <b>{_t("🎁 Подари Pro")}</b>
        <p>{_t("Год Pro брату или сестре как садака. Человек получит ссылку и откроет Pro без оплаты.")}</p>
        <button type="button" className="ghost-btn" onClick={() => soon(_t("Подарок Pro"))}>{_tj("Подарить год за {0}", PRICES.year.price)}</button>
      </div>

      <div className="pro-card soft">
        <b>{_t("Не можешь оплатить?")}</b>
        <p>{_t("Студентам и тем, кому сейчас трудно, дадим Pro бесплатно. Без справок и объяснений.")}</p>
        <button type="button" className="link-btn" onClick={() => { joinEarly('year'); setNote(_t("Принято. Pro открыт. Когда подключим оплату, такие просьбы будут одобряться сразу.")); }}>{_t("Попросить Pro бесплатно")}</button>
      </div>

      <ul className="pro-fair">
        <li>{_t("Без скрытых списаний: напомним за 3 дня до продления")}</li>
        <li>{_t("Возврат денег в течение 14 дней, без вопросов")}</li>
        <li>{_t("Твои данные не продаём и не показываем рекламу")}</li>
      </ul>
    </div>
  );
}
