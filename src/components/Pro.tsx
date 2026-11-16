import { useState } from 'react';

// Pricing screen. No payments yet: buttons explain what will happen and remember a demo trial on this device.

const FREE = [
  '5 намазов: вовремя, с опозданием, статистика за 30 дней',
  'До 3 активных привычек вокруг намазов',
  'Коран с переводом, тасбих, фокус',
  'Рамадан, садака, сафар',
  'Круг до 5 человек',
];
const PRO = [
  'До 5 активных привычек, очередь «Скоро», минимальные версии',
  'Цели с вехами, автопрогресс и пятничный пересмотр',
  'Вся история и статистика, поиск по мухасабе',
  'Книги, пересказы глав, курс английского, языки',
  'Умра-гид, совместная умра, общий хатм и ифтары',
  'Круг до 30 человек',
  'Синхронизация между устройствами и резервная копия',
  'Темы и иконки',
];

const PLANS = {
  year: { price: '€29.99', per: 'в год', note: '≈ €2.50 в месяц · выгоднее в 2 раза' },
  month: { price: '€3.99', per: 'в месяц', note: 'можно отменить в любой момент' },
  family: { price: '€44.99', per: 'в год', note: 'до 5 человек в одной семье' },
} as const;
type PlanId = keyof typeof PLANS;

const LS = 'lm.pro';
function readTrial(): number | null {
  try { const x = JSON.parse(localStorage.getItem(LS) || 'null'); return typeof x?.trial === 'number' ? x.trial : null; } catch { return null; }
}

export function ProPlans({ onBack }: { onBack: () => void }) {
  const [plan, setPlan] = useState<PlanId>('year');
  const [trial, setTrial] = useState<number | null>(readTrial());
  const [note, setNote] = useState('');
  const daysLeft = trial ? Math.max(0, 14 - Math.floor((Date.now() - trial) / 86400000)) : 0;

  const startTrial = () => {
    const t = Date.now();
    try { localStorage.setItem(LS, JSON.stringify({ trial: t })); } catch { /* private mode */ }
    setTrial(t);
    setNote('Пробный период включён на 14 дней. Карта не нужна, в конце ничего не спишется само.');
  };
  const soon = (what: string) => setNote(`${what} появится, когда подключим оплату. Сейчас все функции открыты бесплатно.`);

  return (
    <div className="page pro">
      <button type="button" className="link-btn pro-back" onClick={onBack}>← Профиль</button>
      <div className="pro-hero">
        <span className="pro-badge">PRO</span>
        <h1>Living Muslim Pro</h1>
        <p>Всё, что касается поклонения, бесплатно навсегда. Pro для тех, кто растёт дальше: цели, книги, курсы и большой Круг.</p>
      </div>

      <div className="pro-seg" role="tablist">
        {(['year', 'month', 'family'] as PlanId[]).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={plan === id} onClick={() => setPlan(id)}>
            {id === 'year' ? 'Год' : id === 'month' ? 'Месяц' : 'Семья'}
            {id === 'year' && <i>−37%</i>}
          </button>
        ))}
      </div>

      <div className="pro-price">
        <b>{PLANS[plan].price}</b> <span>{PLANS[plan].per}</span>
        <small>{PLANS[plan].note}</small>
      </div>

      {trial && daysLeft > 0 ? (
        <div className="pro-on">Pro пробный: осталось {daysLeft} {daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'}</div>
      ) : (
        <button type="button" className="pri-btn big-btn" onClick={startTrial}>Попробовать 14 дней бесплатно</button>
      )}
      <button type="button" className="ghost-btn" onClick={() => soon('Оформление подписки')}>Оформить за {PLANS[plan].price}</button>
      {note && <p className="pro-note">{note}</p>}

      <div className="pro-cols">
        <div className="pro-col">
          <h3>Бесплатно</h3>
          <ul>{FREE.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div className="pro-col is-pro">
          <h3>Pro <small>всё из бесплатного, плюс</small></h3>
          <ul>{PRO.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>

      <div className="pro-card">
        <b>🎁 Подари Pro</b>
        <p>Год Pro брату или сестре как садака. Человек получит ссылку и откроет Pro без оплаты.</p>
        <button type="button" className="ghost-btn" onClick={() => soon('Подарок Pro')}>Подарить год за €29.99</button>
      </div>

      <div className="pro-card soft">
        <b>Не можешь оплатить?</b>
        <p>Студентам и тем, кому сейчас трудно, дадим Pro бесплатно. Без справок и объяснений.</p>
        <button type="button" className="link-btn" onClick={() => setNote('Спасибо, что написал. Когда подключим оплату, такие просьбы будут одобряться сразу. Пока всё и так открыто.')}>Попросить Pro бесплатно</button>
      </div>

      <ul className="pro-fair">
        <li>Без скрытых списаний: напомним за 3 дня до продления</li>
        <li>Возврат денег в течение 14 дней, без вопросов</li>
        <li>Твои данные не продаём и не показываем рекламу</li>
      </ul>
    </div>
  );
}
