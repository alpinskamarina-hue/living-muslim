import { useState } from 'react';
import { _t, _tj } from '../i18n';

// "Подари пропуск на умру": someone buys a €10 umrah pass in the app for a person who asked
// "не могу оплатить". This is a pass in the app (guide, counter, dua at the Kaaba, group radar),
// not money for the trip. The trip fund is a separate thing for later. No payments yet.

const PRICE = 10;
const LS = 'lm.giftNudge';
const hijriMonth = (d: Date) => Number(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).format(d).replace(/\D/g, ''));

export function GiftPass({ compact }: { compact?: boolean }) {
  const [mode, setMode] = useState<'once' | 'month'>('once');
  const [count, setCount] = useState(1);
  const [forWhom, setFor] = useState('');
  const [note, setNote] = useState('');
  const total = PRICE * (mode === 'once' ? count : 1);
  return (
    <div className="gp">
      {!compact && (
        <div className="gp-hero">
          <span className="gp-ticket" aria-hidden="true">🎟️</span>
          <b>{_t("Подари пропуск на умру")}</b>
          <small>{_t("Кто-то едет к Каабе и не может оплатить пропуск. Твои €10 откроют ему весь путь в приложении.")}</small>
        </div>
      )}
      <div className="seg gp-seg">
        <button type="button" aria-pressed={mode === 'once'} onClick={() => setMode('once')}>{_t("Один раз")}</button>
        <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>{_t("Каждый месяц")}</button>
      </div>
      {mode === 'once' ? (
        <div className="gp-count">
          {[1, 3, 5].map((n) => (
            <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)}>
              <b>{n}</b><small>{n === 1 ? _t("пропуск") : _t("пропуска")} · €{PRICE * n}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="tiny">{_tj("Один пропуск в месяц, €{0}. Отменить можно в любой момент. Если в этом месяце все просьбы уже закрыты, деньги не списываются.", PRICE)}</p>
      )}
      <label className="gp-for">
        <span>{_t("Как садака за кого-то (необязательно)")}</span>
        <input id="gp-for" value={forWhom} onChange={(e) => setFor(e.target.value)} placeholder={_t("Например: за маму")} maxLength={40} />
      </label>
      <button type="button" className="pri-btn big-btn" onClick={() => setNote(_t("Оплата появится, когда подключим платежи. Сейчас пропуск и так открыт всем бесплатно, поэтому просьб пока нет."))}>
        {_tj("Подарить €{0}{1}", total, mode === 'month' ? _t(" в месяц") : '')}
      </button>
      {note && <p className="pro-note">{note}</p>}
      <ol className="gp-how">
        <li>{_t("Человек нажимает «Не могу оплатить» и встаёт в очередь. Без справок и объяснений.")}</li>
        <li>{_t("Твой пропуск уходит первому в очереди. Имя знаешь только ты, если он сам захочет его показать.")}</li>
        <li>{_tj("Ты получаешь: «Твой пропуск получил брат, едет 12 марта». А когда он у Каабы, может сделать за тебя дуа{0}.", forWhom.trim() ? _t(" и за {0}", forWhom.trim().replace(/^за\s+/i, '')) : '')}</li>
      </ol>
      <p className="tiny">{_t("Это пропуск в приложении: гид, счётчик тавафа, микат, дуа у Каабы, радар группы. Он не оплачивает саму поездку. Если подарков больше, чем просьб, мы честно напишем «все обеспечены» и не возьмём деньги впрок.")}</p>
    </div>
  );
}

/** Small entry card that opens the gift in place. */
export function GiftPassCard({ title, sub }: { title?: string; sub?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`gp-card${open ? ' open' : ''}`}>
      <button type="button" className="gp-entry" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span aria-hidden="true">🎟️</span>
        <span><b>{title ?? _t("Подари пропуск на умру")}</b><small>{sub ?? _t("€10 тому, кто едет, но не может оплатить")}</small></span>
        <i aria-hidden="true">{open ? '▴' : '›'}</i>
      </button>
      {open && <GiftPass compact />}
    </div>
  );
}

/** On Fridays and in Ramadan, a quiet reminder on Today. Hidden for the day once closed. */
export function GiftNudge({ today }: { today: string }) {
  const d = new Date(today + 'T12:00:00');
  const ramadan = hijriMonth(d) === 9;
  const friday = d.getDay() === 5;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(LS) === today; } catch { return false; } });
  if (hidden || !(ramadan || friday)) return null;
  const close = () => { try { localStorage.setItem(LS, today); } catch { /* fine */ } setHidden(true); };
  return (
    <div className="gp-nudge">
      <button type="button" className="gp-x" onClick={close} aria-label={_t("Скрыть на сегодня")}>✕</button>
      <GiftPassCard title={ramadan ? _t("Рамадан: подари пропуск на умру") : _t("Пятница: подари пропуск на умру")} sub={_t("Кто-то едет к Каабе и не может оплатить. €10")} />
    </div>
  );
}
