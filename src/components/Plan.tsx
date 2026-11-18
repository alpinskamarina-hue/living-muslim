import { useEffect, useState } from 'react';
import type { AppState } from '../types';
import { plural, addDays, dayKey } from '../dates';
import { isCounted, wouldQueue } from '../store';
import { myCircles } from '../cloud';
import { FREE, PRO, PRICES, LIMIT_RU, TRIAL_DAYS, usePlan, openPro, inviteFriend, leftLabel, markSheet, type LimitKey } from '../plan';
import { _t, _tj } from '../i18n';

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
        <span>{_tj("Бесплатный тариф: по {0} привычки, круга и цели", FREE.habits)}</span><b>Pro −37% ›</b>
      </button>
    );
  }
  const ms = Math.max(0, p.ends.getTime() - now);
  const days = Math.ceil(ms / 86400000);
  const last = days <= 1;
  return (
    <button type="button" className={`pl-dial${last ? ' last' : ''}`} onClick={openPro} aria-label={_t("Pro открыт ещё {0}. Открыть тарифы", leftLabel(ms))}>
      <span className="pl-ring"><Dial left={days} /><span><b>{days}</b><small>{plural(days, _t("день"), _t("дня"), _t("дней"))}</small></span></span>
      <span className="pl-txt">
        <b>{last ? _t("Последний день Pro") : _t("Pro открыт полностью")}</b>
        <span className="pl-clock">{leftLabel(ms)}</span>
        <small>{_tj("Потом бесплатный: по {0} привычки, круга, цели, книги и курса", FREE.habits)}</small>
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
      <div className="pl-p best"><i>{_t("−37% на первый год")}</i><b>{PRICES.year.price}</b><span>{_tj("в год · {0} в месяц", PRICES.year.month)}</span></div>
      <div className="pl-p"><b>{PRICES.month.price}</b><span>{_t("в месяц")}</span></div>
      <div className="pl-p"><b>{PRICES.family.price}</b><span>{_t("семья до 5 человек")}</span></div>
    </div>
  );
}

function Share() {
  const [msg, setMsg] = useState('');
  return (
    <>
      <button type="button" className="ghost-btn pl-share" onClick={async () => { const r = await inviteFriend(); setMsg(r === 'copied' ? _t("Ссылка скопирована. Отправь её другу.") : r === 'shared' ? _t("Джазак Аллаху хайран. Хорошее дело передаётся.") : ''); }}>
        {_t("🤝 Позвать друга в Living Muslim")}
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
    if (queued.length) changes.push(_t("Привычки: активных станет {0}, {1} подождут в «Скоро».", FREE.habits, queued.map((h) => `«${h.action}»`).join(', ')));
    if (circles > FREE.circles) changes.push(_t("Круги: твои {0} останутся, новые можно будет добавить в Pro.", circles));
    if (goals > FREE.goals) changes.push(_t("Цели: начатые останутся, новые встанут в «Потом»."));
  }

  return (
    <>
      <div className="dim" onClick={close} />
      <div className="sheet pl-sheet" role="dialog" aria-label={_t("Тариф")}>
        <div className="grab" />
        <div className={`pl-head${k === 8 ? ' free' : ''}`}>
          {k !== 8 ? <span className="pl-ring big"><Dial left={left} size={84} /><span><b>{left}</b><small>{plural(left, _t("день"), _t("дня"), _t("дней"))}</small></span></span> : <span className="pl-ring big free"><span><b>{FREE.habits}</b><small>{_t("по")}</small></span></span>}
          <div>
            <h3>{k === 5 ? _t("Осталось {0} {1} Pro", left, plural(left, _t("день"), _t("дня"), _t("дней"))) : k === 7 ? _t("Последний день Pro") : _t("Теперь бесплатный тариф")}</h3>
            {k !== 8 ? <p className="pl-clock dark">{leftLabel(ms)}</p> : <p>{_t("Всё для поклонения остаётся с тобой навсегда.")}</p>}
          </div>
        </div>

        {k !== 8 && r.days > 0 && (
          <div className="pl-recap">
            <small>{_t("За эти дни")}</small>
            <div><b>{r.days}</b><span>{_tj("{0} в деле", plural(r.days, _t("день"), _t("дня"), _t("дней")))}</span></div>
            <div><b>{r.prayers}</b><span>{plural(r.prayers, _t("намаз"), _t("намаза"), _t("намазов"))}</span></div>
            <div><b>{r.marks}</b><span>{plural(r.marks, _t("отметка"), _t("отметки"), _t("отметок"))}</span></div>
          </div>
        )}

        {k === 8 ? (
          <>
            <ul className="pl-list">
              <li>{_t("Намазы, Коран, тасбих, Рамадан, садака, сафар: бесплатно навсегда")}</li>
              <li>{_tj("По {0}: активные привычки, круги, цели, книги, видеокурсы", FREE.habits)}</li>
              {waiting.length > 0 && <li>{_tj("В «Скоро» ждут: {0}. Включатся, когда освободится место или с Pro", waiting.map((h) => `«${h.action}»`).join(', '))}</li>}
            </ul>
          </>
        ) : (
          <>
            <p className="pl-lead">{k === 5 ? _t("Ещё {0} {1} всё открыто, потом бесплатный тариф. Чтобы ничего не останавливать из того, что уже начал, оставь Pro.", left, plural(left, _t("день"), _t("дня"), _t("дней"))) : _t("Завтра приложение перейдёт на бесплатный тариф. Ничего не удалится.")}</p>
            {changes.length > 0 && <ul className="pl-list">{changes.map((x) => <li key={x}>{x}</li>)}</ul>}
          </>
        )}

        <Prices />
        <button type="button" className="pri-btn big-btn" onClick={go}>{k === 8 ? _t("Вернуть Pro со скидкой −37%") : _t("Оставить Pro")}</button>
        <Share />
        <button type="button" className="link-btn pl-later" onClick={close}>{k === 8 ? _t("Хорошо, остаюсь на бесплатном") : _t("Напомнить позже")}</button>
      </div>
    </>
  );
}

/** Shown instead of an «add» button when the free limit is reached. */
export function ProGate({ k, have }: { k: LimitKey; have?: number }) {
  const [asked, setAsked] = useState(false);
  const n = PRO[k] >= 100 ? _t("без ограничений") : _t("до {0}", PRO[k]);
  return (
    <div className="pl-gate">
      <b>{_tj("🔒 На бесплатном тарифе {0}  {1}", FREE[k], LIMIT_RU[k][1])}</b>
      <p>{_tj("{0}В Pro {1}  {2}. Первый год со скидкой −37%: {3} в месяц.", have != null ? _t("У тебя уже {0}. ", have) : '', LIMIT_RU[k][0], n, PRICES.year.month)}</p>
      <div className="da-row">
        <button type="button" className="pri-btn" onClick={openPro}>{_t("Открыть Pro")}</button>
        <button type="button" className="link-btn" onClick={() => setAsked(true)}>{_t("Не можешь оплатить?")}</button>
      </div>
      {asked && <p className="tiny">{_t("Напиши в экране Pro «Попросить Pro бесплатно». Студентам и тем, кому сейчас трудно, Pro дадим без вопросов.")}</p>}
    </div>
  );
}
