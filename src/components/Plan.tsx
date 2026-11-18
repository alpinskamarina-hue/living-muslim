import { useEffect, useState } from 'react';
import type { AppState } from '../types';
import { plural, addDays, dayKey } from '../dates';
import { isCounted, wouldQueue } from '../store';
import { myCircles } from '../cloud';
import { FREE, PRO, PRICES, LIMIT_RU, TRIAL_DAYS, usePlan, openPro, inviteFriend, leftLabel, markSheet, type LimitKey } from '../plan';

// Trial dial on Today, the reminder sheets on day 5, day 7 and day 8, and the «это в Pro» gate.
// No rewards for inviting: the share button only passes on the app.

const SEG = (2 * Math.PI * 26) / TRIAL_DAYS;
const C = 2 * Math.PI * 26;

/** Seconds tick only while the dial is on screen. */
function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function Dial({ left, size = 62 }: { left: number; size?: number }) {
  return (
    <svg viewBox="0 0 62 62" width={size} height={size} aria-hidden="true">
      {Array.from({ length: TRIAL_DAYS }, (_, i) => (
        <circle key={i} cx="31" cy="31" r="26" fill="none" strokeWidth="6" strokeLinecap="round"
          stroke={i < left ? 'var(--gold-light, #e9c77b)' : 'rgba(255,255,255,.18)'}
          strokeDasharray={`${SEG - 7} ${C}`} strokeDashoffset={-i * SEG - 3.5} transform="rotate(-90 31 31)" />
      ))}
    </svg>
  );
}

/** Top of Today: how long Pro stays open, with a live countdown. After the trial, one quiet line. */
export function TrialDial() {
  const p = usePlan();
  const now = useNow(1000);
  if (p.early || p.owner) return null;
  if (!p.trial) {
    return (
      <button type="button" className="pl-free" onClick={openPro}>
        <span>Бесплатный тариф: по {FREE.habits} привычки, круга и цели</span><b>Pro −37% ›</b>
      </button>
    );
  }
  const ms = Math.max(0, p.ends.getTime() - now);
  const days = Math.ceil(ms / 86400000);
  const last = days <= 1;
  return (
    <button type="button" className={`pl-dial${last ? ' last' : ''}`} onClick={openPro} aria-label={`Pro открыт ещё ${leftLabel(ms)}. Открыть тарифы`}>
      <span className="pl-ring"><Dial left={days} /><span><b>{days}</b><small>{plural(days, 'день', 'дня', 'дней')}</small></span></span>
      <span className="pl-txt">
        <b>{last ? 'Последний день Pro' : 'Pro открыт полностью'}</b>
        <span className="pl-clock">{leftLabel(ms)}</span>
        <small>Потом бесплатный: по {FREE.habits} привычки, круга, цели, книги и курса</small>
      </span>
      <i aria-hidden="true">›</i>
    </button>
  );
}

/** What the person did since the first day: for the day 5 and day 7 sheets. */
function recap(s: AppState, from: string, today: string) {
  let prayers = 0, marks = 0, days = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const p = Object.keys(s.prayers?.[d] ?? {}).length;
    const m = Object.values(s.log[d] ?? {}).filter((x) => isCounted(x)).length;
    prayers += p; marks += m; if (p || m) days++;
  }
  return { prayers, marks, days };
}

function Prices() {
  return (
    <div className="pl-prices">
      <div className="pl-p best"><i>−37% на первый год</i><b>{PRICES.year.price}</b><span>в год · {PRICES.year.month} в месяц</span></div>
      <div className="pl-p"><b>{PRICES.month.price}</b><span>в месяц</span></div>
      <div className="pl-p"><b>{PRICES.family.price}</b><span>семья до 5 человек</span></div>
    </div>
  );
}

function Share() {
  const [msg, setMsg] = useState('');
  return (
    <>
      <button type="button" className="ghost-btn pl-share" onClick={async () => { const r = await inviteFriend(); setMsg(r === 'copied' ? 'Ссылка скопирована. Отправь её другу.' : r === 'shared' ? 'Джазак Аллаху хайран. Хорошее дело передаётся.' : ''); }}>
        🤝 Позвать друга в Living Muslim
      </button>
      {msg && <p className="tiny pl-msg">{msg}</p>}
    </>
  );
}

/** Reminder sheets: day 5 (two days left), day 7 (last day), day 8 (moved to the free plan). */
export function PlanSheet({ k, state, today, onClose }: { k: 5 | 7 | 8; state: AppState; today: string; onClose: () => void }) {
  const p = usePlan();
  const now = useNow(1000);
  const close = () => { markSheet(k); onClose(); };
  const go = () => { markSheet(k); onClose(); openPro(); };
  const from = dayKey(new Date(p.ends.getTime() - TRIAL_DAYS * 86400000));
  const r = recap(state, from, today);
  const queued = wouldQueue(state, FREE.habits);
  const waiting = state.habits.filter((h) => h.status === 'queued');
  const circles = myCircles().length;
  const goals = (state.goals ?? []).filter((g) => g.status === 'active').length;
  const ms = Math.max(0, p.ends.getTime() - now);
  const left = Math.ceil(ms / 86400000);

  const changes: string[] = [];
  if (k !== 8) {
    if (queued.length) changes.push(`Привычки: активных станет ${FREE.habits}, ${queued.map((h) => `«${h.action}»`).join(', ')} подождут в «Скоро».`);
    if (circles > FREE.circles) changes.push(`Круги: твои ${circles} останутся, новые можно будет добавить в Pro.`);
    if (goals > FREE.goals) changes.push(`Цели: начатые останутся, новые встанут в «Потом».`);
  }

  return (
    <>
      <div className="dim" onClick={close} />
      <div className="sheet pl-sheet" role="dialog" aria-label="Тариф">
        <div className="grab" />
        <div className={`pl-head${k === 8 ? ' free' : ''}`}>
          {k !== 8 ? <span className="pl-ring big"><Dial left={left} size={84} /><span><b>{left}</b><small>{plural(left, 'день', 'дня', 'дней')}</small></span></span> : <span className="pl-ring big free"><span><b>{FREE.habits}</b><small>по</small></span></span>}
          <div>
            <h3>{k === 5 ? `Осталось ${left} ${plural(left, 'день', 'дня', 'дней')} Pro` : k === 7 ? 'Последний день Pro' : 'Теперь бесплатный тариф'}</h3>
            {k !== 8 ? <p className="pl-clock dark">{leftLabel(ms)}</p> : <p>Всё для поклонения остаётся с тобой навсегда.</p>}
          </div>
        </div>

        {k !== 8 && r.days > 0 && (
          <div className="pl-recap">
            <small>За эти дни</small>
            <div><b>{r.days}</b><span>{plural(r.days, 'день', 'дня', 'дней')} в деле</span></div>
            <div><b>{r.prayers}</b><span>{plural(r.prayers, 'намаз', 'намаза', 'намазов')}</span></div>
            <div><b>{r.marks}</b><span>{plural(r.marks, 'отметка', 'отметки', 'отметок')}</span></div>
          </div>
        )}

        {k === 8 ? (
          <>
            <ul className="pl-list">
              <li>Намазы, Коран, тасбих, Рамадан, садака, сафар: бесплатно навсегда</li>
              <li>По {FREE.habits}: активные привычки, круги, цели, книги, видеокурсы</li>
              {waiting.length > 0 && <li>В «Скоро» ждут: {waiting.map((h) => `«${h.action}»`).join(', ')}. Включатся, когда освободится место или с Pro</li>}
            </ul>
          </>
        ) : (
          <>
            <p className="pl-lead">{k === 5 ? `Ещё ${left} ${plural(left, 'день', 'дня', 'дней')} всё открыто, потом бесплатный тариф. Чтобы ничего не останавливать из того, что уже начал, оставь Pro.` : 'Завтра приложение перейдёт на бесплатный тариф. Ничего не удалится.'}</p>
            {changes.length > 0 && <ul className="pl-list">{changes.map((x) => <li key={x}>{x}</li>)}</ul>}
          </>
        )}

        <Prices />
        <button type="button" className="pri-btn big-btn" onClick={go}>{k === 8 ? 'Вернуть Pro со скидкой −37%' : 'Оставить Pro'}</button>
        <Share />
        <button type="button" className="link-btn pl-later" onClick={close}>{k === 8 ? 'Хорошо, остаюсь на бесплатном' : 'Напомнить позже'}</button>
      </div>
    </>
  );
}

/** Shown instead of an «add» button when the free limit is reached. */
export function ProGate({ k, have }: { k: LimitKey; have?: number }) {
  const [asked, setAsked] = useState(false);
  const n = PRO[k] >= 100 ? 'без ограничений' : `до ${PRO[k]}`;
  return (
    <div className="pl-gate">
      <b>🔒 На бесплатном тарифе {FREE[k]} {LIMIT_RU[k][1]}</b>
      <p>{have != null ? `У тебя уже ${have}. ` : ''}В Pro {LIMIT_RU[k][0]} {n}. Первый год со скидкой −37%: {PRICES.year.month} в месяц.</p>
      <div className="da-row">
        <button type="button" className="pri-btn" onClick={openPro}>Открыть Pro</button>
        <button type="button" className="link-btn" onClick={() => setAsked(true)}>Не можешь оплатить?</button>
      </div>
      {asked && <p className="tiny">Напиши в экране Pro «Попросить Pro бесплатно». Студентам и тем, кому сейчас трудно, Pro дадим без вопросов.</p>}
    </div>
  );
}
