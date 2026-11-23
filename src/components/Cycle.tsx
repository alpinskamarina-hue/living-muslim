// Profile → «Для сестёр» → «Мой цикл»: calendar, make-up fasts, madhab limits, lock and privacy.
// Nothing here leaves the phone.
import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import { addDays, daysBetween, fromKey, hijriLabel, plural } from '../dates';
import { _t, _tj, LOC } from '../i18n';
import { inRamadan } from '../rplan';
import { setSis, sisGuess, sisOf, syncSw, type CycMadhab } from '../sisters';
import {
  CYC_TAGS, LIMITS, MADHABS, addPast, averages, bioAdd, bioAvailable, bioCheck, closeNow, cycleFile, dayKind, dropPast, endOn,
  isOpen, limitsOf, madhabName, madhabOf, makeLock, markOpen, overLimit, pinOk, qadaOf, readCycleFile, setNote, startOn, wipeCycle,
} from '../cycle';
import { GhuslSheet } from './Sisters';

type Update = (fn: (s: AppState) => AppState) => void;
export type CyView = 'main' | 'qada' | 'madhab' | 'privacy' | 'setpin';

const fmt = (d: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) => fromKey(d).toLocaleDateString(LOC, o);
const nDays = (n: number) => `${n} ${plural(n, _t("день"), _t("дня"), _t("дней"))}`;
const WD = () => [_t("Пн"), _t("Вт"), _t("Ср"), _t("Чт"), _t("Пт"), _t("Сб"), _t("Вс")];

export function CyclePage({ state, update, today, view, setView }: { state: AppState; update: Update; today: string; view: CyView; setView: (v: CyView) => void }) {
  const x = sisOf(state);
  const [open, setOpen] = useState(() => !x.lock || isOpen());
  useEffect(() => {
    // Leaving the app for a while locks it again.
    const h = () => { if (document.visibilityState === 'visible' && x.lock && !isOpen()) setOpen(false); else if (document.visibilityState === 'hidden' && x.lock) markOpen(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [x.lock]);
  if (x.lock && !open) return <PinGate state={state} update={update} onOpen={() => { markOpen(); setOpen(true); }} />;
  if (view === 'qada') return <Qada state={state} update={update} today={today} />;
  if (view === 'madhab') return <Madhab state={state} update={update} today={today} />;
  if (view === 'privacy') return <Privacy state={state} update={update} today={today} onPin={() => setView('setpin')} />;
  if (view === 'setpin') return <SetPin update={update} onDone={() => setView('privacy')} />;
  return <Main state={state} update={update} today={today} go={setView} />;
}

// ───── Календарь ─────

function Main({ state, update, today, go }: { state: AppState; update: Update; today: string; go: (v: CyView) => void }) {
  const x = sisOf(state);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sel, setSel] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const guess = x.guess ? sisGuess(state, today) : null;
  const avg = averages(state);
  const q = qadaOf(state);
  const over = overLimit(state, today);
  const first = `${month}-01`;
  const lead = (fromKey(first).getDay() + 6) % 7;
  const len = daysBetween(first, addDays(`${shiftMonth(month, 1)}-01`, -1)) + 1;
  const days = Array.from({ length: len }, (_, i) => addDays(first, i));
  const hij = hijriSpan(first, days[days.length - 1]);
  const pick = (d: string) => {
    if (from) {
      if (d >= from && d <= today) { update((s) => addPast(s, from, d)); setFrom(null); return; }
      setFrom(null);
    }
    setSel(d);
  };
  return (
    <div className="cy">
      {over && (
        <div className="cy-note">
          <b>{_tj(over.nifas ? "{0}-й день. По мазхабу {1} нифас больше {2} дней уже не считается." : "{0}-й день. По мазхабу {1} больше {2} дней уже не хайд.", over.n, madhabName(madhabOf(state)), over.max)}</b>
          {_t("С этого дня намаз снова обязателен: сделай гусль. Если сомневаешься, спроси учительницу или имама.")}
        </div>
      )}
      {x.cur ? (
        <div className="cy-next now"><span className="cy-moon" aria-hidden="true">☾</span><div><b>{_tj(x.nifas ? "Нифас, день {0}" : "Дни без намаза, день {0}", daysBetween(x.cur, today) + 1)}</b><small>{_tj("Начались {0}", fmt(x.cur))}</small></div></div>
      ) : guess ? (
        <div className="cy-next"><span className="cy-moon" aria-hidden="true">☾</span><div><b>{guess.inDays > 0 ? _tj("Через {0}, примерно {1}", nDays(guess.inDays), fmt(guess.day)) : guess.inDays === 0 ? _t("Примерно сегодня") : _tj("Ожидались примерно {0}", fmt(guess.day))}</b><small>{x.rem !== false && guess.inDays >= 2 ? _t("Напомню за 2 дня. Это прогноз, не точная дата.") : _t("Это прогноз, не точная дата.")}</small></div></div>
      ) : (
        <div className="cy-next off"><span className="cy-moon" aria-hidden="true">☾</span><div><b>{x.guess ? _t("Прогноз появится после 2 циклов") : _t("Прогноз выключен")}</b><small>{x.guess ? _t("Отметь прошлые дни в календаре, и он посчитает сам") : _t("Включается в «Приватности» ниже")}</small></div></div>
      )}

      <div className="cy-card">
        <div className="cy-mon">
          <button type="button" className="cy-arr" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={_t("Прошлый месяц")}>‹</button>
          <div><b>{fromKey(first).toLocaleDateString(LOC, { month: 'long', year: 'numeric' })}</b>{hij && <small>{hij}</small>}</div>
          <button type="button" className="cy-arr" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={_t("Следующий месяц")} disabled={month >= shiftMonth(today.slice(0, 7), 2)}>›</button>
        </div>
        <div className="cy-wd">{WD().map((w) => <i key={w}>{w}</i>)}</div>
        <div className="cy-cal">
          {Array.from({ length: lead }, (_, i) => <i key={`e${i}`} />)}
          {days.map((d) => {
            const k = dayKind(state, d, today, guess, avg.days);
            const note = x.notes?.[d];
            const inSel = from && d === from;
            return (
              <button type="button" key={d} className={`k-${k || 'no'}${d === today ? ' td' : ''}${inSel ? ' fr' : ''}`} onClick={() => pick(d)} aria-label={fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}>
                {Number(d.slice(8))}{note && <s aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        {from ? <p className="cy-hint">{_tj("Начало: {0}. Теперь нажми на последний день.", fmt(from))} <button type="button" className="link-btn" onClick={() => setFrom(null)}>{_t("Отмена")}</button></p>
          : <div className="cy-leg"><span><i className="k-past" />{_t("без намаза")}</span>{x.guess && <span><i className="k-guess" />{_t("прогноз")}</span>}<span><i className="k-td" />{_t("сегодня")}</span></div>}
      </div>

      <div className="cy-stats">
        <div><b>{avg.cycle ?? '–'}</b><small>{_t("дней цикл, в среднем")}</small></div>
        <div><b>{avg.days ?? '–'}</b><small>{_t("дней без намаза, в среднем")}</small></div>
        <button type="button" onClick={() => go('qada')}><b>{q.left}</b><small>{_t("посты восполнить")} ›</small></button>
      </div>

      <div className="nk-grp">
        <button type="button" className="nk-r sis-row" onClick={() => go('qada')}><span>{_t("Посты к восполнению")}<small>{q.left ? _tj("Осталось {0}", nDays(q.left)) : _t("Долгов нет")}</small></span><i aria-hidden="true">›</i></button>
        <button type="button" className="nk-r sis-row" onClick={() => go('madhab')}><span>{_t("Мазхаб и граница дней")}<small>{madhabName(madhabOf(state))}</small></span><i aria-hidden="true">›</i></button>
        <button type="button" className="nk-r sis-row" onClick={() => go('privacy')}><span>{_t("Приватность и замок")}<small>{x.lock ? _t("Закрыто PIN-кодом") : _t("Без замка")}</small></span><i aria-hidden="true">›</i></button>
      </div>
      <p className="sis-lock">🔒 {_t("Хранится только на этом телефоне")}</p>

      {sel && <DaySheet state={state} update={update} today={today} d={sel} onClose={() => setSel(null)} onRange={(d) => { setSel(null); setFrom(d); }} />}
    </div>
  );
}

function shiftMonth(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
function hijriSpan(a: string, b: string) {
  const strip = (l: string) => l.replace(/^\d+\s+/, '');
  const x = strip(hijriLabel(fromKey(a))), y = strip(hijriLabel(fromKey(b)));
  if (!x) return '';
  if (x === y) return x;
  const [xn, yn] = [x.replace(/\s+\d+$/, ''), y.replace(/\s+\d+$/, '')];
  const yr = y.match(/\d+$/)?.[0] ?? '';
  return x.match(/\d+$/)?.[0] === yr ? `${xn} – ${yn} ${yr}` : `${x} – ${y}`;
}

function DaySheet({ state, update, today, d, onClose, onRange }: { state: AppState; update: Update; today: string; d: string; onClose: () => void; onRange: (d: string) => void }) {
  const x = sisOf(state);
  const n0 = x.notes?.[d];
  const [tags, setTags] = useState<string[]>(n0?.t ?? []);
  const [txt, setTxt] = useState(n0?.x ?? '');
  const [ghusl, setGhusl] = useState(false);
  const future = d > today;
  const inCur = Boolean(x.cur && d >= x.cur && d <= today);
  const past = (x.past ?? []).find((r) => d >= r.from && d <= r.to);
  const dayN = inCur ? daysBetween(x.cur!, d) + 1 : past ? daysBetween(past.from, d) + 1 : 0;
  const save = () => { update((s) => setNote(s, d, { t: tags, x: txt })); onClose(); };
  const act = (fn: (s: AppState) => AppState) => { update(fn); onClose(); };
  if (ghusl) return <GhuslSheet onClose={() => { setGhusl(false); onClose(); }} />;
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet sis-sheet cy-sheet" role="dialog" aria-modal="true" aria-label={fmt(d)}>
        <div className="grab" />
        <h2 className="sis-h">{fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <p className="sis-q">{inCur || past ? _tj("{0}-й день без намаза", dayN) : future ? _t("Этот день ещё не наступил") : _t("Обычный день")}</p>

        {inCur && (
          <>
            <div className="sis-opt moon on"><i>☾</i><span>{_t("Дни без намаза идут")}<small>{_tj("Начались {0}", fmt(x.cur!))}</small></span></div>
            <button type="button" className="sis-opt" onClick={() => { update((s) => endOn(s, d)); setGhusl(true); }}><i>✓</i><span>{_t("Закончились в этот день")}<small>{_t("Покажу, как сделать гусль")}</small></span></button>
          </>
        )}
        {past && (
          <>
            <div className="sis-opt moon on"><i>☾</i><span>{past.from === past.to ? fmt(past.from) : `${fmt(past.from)} – ${fmt(past.to)}`}<small>{past.nifas ? _t("нифас") : nDays(daysBetween(past.from, past.to) + 1)}</small></span></div>
            <button type="button" className="sis-opt off" onClick={() => act((s) => dropPast(s, past.from))}><i>✕</i><span>{_t("Убрать эти дни из истории")}<small>{_t("Если отмечено по ошибке")}</small></span></button>
          </>
        )}
        {!inCur && !past && !future && (
          <>
            {!x.cur && <button type="button" className="sis-opt moon" onClick={() => act((s) => startOn(s, d, today))}><i>☾</i><span>{d === today ? _t("Начались сегодня") : _t("Начались в этот день и идут сейчас")}<small>{_t("Намазы с этого дня не считаются пропущенными")}</small></span></button>}
            {d < today && <button type="button" className="sis-opt" onClick={() => onRange(d)}><i>+</i><span>{_t("Были дни с этого числа")}<small>{_t("Отметить прошлые дни: потом нажми на последний")}</small></span></button>}
          </>
        )}

        {!future && (
          <>
            <div className="nk-sec" style={{ margin: '12px 2px 6px' }}>{_t("Самочувствие, по желанию")}</div>
            <div className="sis-chips cy-tags">
              {CYC_TAGS.map((t) => <button type="button" key={t.id} aria-pressed={tags.includes(t.id)} onClick={() => setTags(tags.includes(t.id) ? tags.filter((y) => y !== t.id) : [...tags, t.id])}>{t.l()}</button>)}
            </div>
            <textarea className="sis-name cy-txt" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={_t("Заметка для себя или для врача…")} maxLength={280} rows={2} />
            <button type="button" className="pri-btn big-btn" onClick={save}>{_t("Сохранить")}</button>
          </>
        )}
        {future && <button type="button" className="pri-btn big-btn" onClick={onClose}>{_t("Закрыть")}</button>}
      </div>
    </>
  );
}

// ───── Посты к восполнению ─────

function nextRamadanStart(today: string): string | null {
  let d = today;
  let i = 0;
  while (inRamadan(d) && i < 40) { d = addDays(d, 1); i++; }
  for (let j = 0; j < 400; j++, d = addDays(d, 1)) if (inRamadan(d)) return d;
  return null;
}

function Qada({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const x = sisOf(state);
  const q = qadaOf(state);
  const madeToday = q.made.includes(today);
  const next = nextRamadanStart(today);
  const weeks = next ? Math.round(daysBetween(today, next) / 7) : null;
  const total = q.left + q.made.length;
  const toggle = () => update((s) => {
    const r = s.ramadan ?? { fasts: {}, qada: [], khatm: null, nights: {}, fitr: [], keep: {} };
    return { ...s, ramadan: { ...r, qada: r.qada.includes(today) ? r.qada.filter((d) => d !== today) : [...r.qada, today] } };
  });
  const qd = x.qd ?? [];
  const setQd = (n: number) => update((s) => { const next2 = setSis(s, { qd: qd.includes(n) ? qd.filter((y) => y !== n) : [...qd, n].sort() }); syncSw(next2); return next2; });
  const slots = Array.from({ length: Math.min(total, 30) }, (_, i) => q.made[i] ?? null);
  return (
    <div className="cy">
      <div className="cy-card">
        <div className="nk-sec" style={{ marginTop: 0 }}>{_t("Все пропущенные посты Рамадана")}</div>
        <div className="cy-big"><b>{q.left}</b><span>{total ? _tj("осталось из {0}", total) : _t("долгов нет, альхамдулиллях")}</span></div>
        {total > 0 && <div className="cy-bar"><i style={{ width: `${Math.round((q.made.length / total) * 100)}%` }} /></div>}
        <div className="cy-mini"><span>{_tj("{0} восполнено", q.made.length)}</span>{weeks != null && <span>{_tj("до Рамадана ≈ {0} нед.", weeks)}</span>}</div>
        {q.period.length > 0 && <p className="tiny" style={{ margin: '8px 0 0' }}>{_tj("Из них из-за дней без намаза: {0}. Они отмечаются сами, когда дни выпадают на Рамадан.", q.period.length)}</p>}
      </div>
      {total > 0 && (
        <div className="cy-card">
          <div className="nk-sec" style={{ marginTop: 0 }}>{_t("Дни")}</div>
          <div className="cy-dots">{slots.map((d, i) => <i key={i} className={d ? 'ok' : ''}>{d ? '✓' : i + 1}{d && <small>{fmt(d, { day: '2-digit', month: '2-digit' })}</small>}</i>)}</div>
          {!inRamadan(today) && (q.left > 0 || madeToday) && <button type="button" className={madeToday ? 'pri-btn big-btn' : 'gold-btn big-btn'} onClick={toggle}>{madeToday ? _t("Сегодня восполняю ✓") : _t("Восполняю сегодня")}</button>}
        </div>
      )}
      {q.left > 0 && (
        <div className="cy-card">
          <div className="nk-sec" style={{ marginTop: 0 }}>{_t("Напоминать накануне вечером")}</div>
          <div className="cy-wk">{WD().map((w, i) => <button type="button" key={w} aria-pressed={qd.includes(i)} onClick={() => setQd(i)}>{w}</button>)}</div>
          <p className="tiny" style={{ margin: '8px 0 0' }}>{_t("Придёт вместе с напоминанием об Иша: «Завтра можно восполнить пост». Понедельник и четверг сунна для поста.")}</p>
        </div>
      )}
      <p className="tiny">{_t("«…пусть постится столько же дней в другое время» (2:184). Лучше восполнить до следующего Рамадана. Это тот же счёт, что в «Посте» Рамадана.")}</p>
    </div>
  );
}

// ───── Мазхаб ─────

function Madhab({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const m = madhabOf(state);
  const lim = limitsOf(state);
  const over = overLimit(state, today);
  return (
    <div className="cy">
      {over && <div className="cy-note"><b>{_tj("Сейчас {0}-й день, предел {1}.", over.n, over.max)}</b>{_t("С этого дня намаз снова обязателен: сделай гусль.")}</div>}
      <div className="cy-card">
        <div className="nk-sec" style={{ marginTop: 0 }}>{_t("Мой мазхаб")}</div>
        <div className="sis-chips">{MADHABS.map((x) => <button type="button" key={x.id} aria-pressed={m === x.id} onClick={() => update((s) => setSis(s, { cmz: x.id as CycMadhab }))}>{x.l()}</button>)}</div>
      </div>
      {lim ? (
        <div className="cy-card">
          <div className="nk-sec" style={{ marginTop: 0 }}>{madhabName(m)}</div>
          <div className="cy-rule"><span>{_t("Хайд, меньше всего")}</span><b>{lim.min ? (m === 's' || m === 'b' ? _t("1 сутки") : nDays(lim.min)) : _t("нет нижней границы")}</b></div>
          <div className="cy-rule"><span>{_t("Хайд, больше всего")}</span><b>{nDays(lim.max)}</b></div>
          <div className="cy-rule"><span>{_t("Чистота между, не меньше")}</span><b>{nDays(lim.tuhr)}</b></div>
          <div className="cy-rule"><span>{_t("Нифас, больше всего")}</span><b>{nDays(lim.nifas)}</b></div>
          <p className="tiny" style={{ margin: '8px 0 0' }}>{_t("Если дни идут дольше предела, приложение подскажет, что намаз снова обязателен. Остальные случаи (истихада, смешанные дни) разбирай с учительницей или имамом.")}</p>
        </div>
      ) : (
        <div className="cy-card"><p className="tiny" style={{ margin: 0 }}>{_t("Без подсказок о границе: приложение только считает дни. Мазхаб можно выбрать в любой момент.")}</p></div>
      )}
      <div className="cy-card cy-table">
        <div className="nk-sec" style={{ marginTop: 0 }}>{_t("Сравнение мазхабов, дни")}</div>
        <div className="cy-rule hd"><span /><b>{_t("мин")}</b><b>{_t("макс")}</b><b>{_t("нифас")}</b></div>
        {(['h', 's', 'm', 'b'] as const).map((k) => <div key={k} className={`cy-rule${k === m ? ' on' : ''}`}><span>{madhabName(k)}</span><b>{LIMITS[k].min ? (k === 's' || k === 'b' ? '1*' : LIMITS[k].min) : '–'}</b><b>{LIMITS[k].max}</b><b>{LIMITS[k].nifas}</b></div>)}
        <p className="tiny" style={{ margin: '6px 0 0' }}>{_t("* сутки. По классическим книгам мазхабов. Если в твоей общине принято иначе, следуй своему имаму.")}</p>
      </div>
    </div>
  );
}

// ───── Приватность и замок ─────

function Privacy({ state, update, today, onPin }: { state: AppState; update: Update; today: string; onPin: () => void }) {
  const x = sisOf(state);
  const [msg, setMsg] = useState('');
  const [sure, setSure] = useState(false);
  const [bio, setBio] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { bioAvailable().then(setBio); }, []);
  const sw = (k: 'modest' | 'guess' | 'rem', def: boolean) => (
    <span className="switch"><input type="checkbox" checked={x[k] ?? def} onChange={(e) => update((s) => { const n = setSis(s, { [k]: e.target.checked }); syncSw(n); return n; })} /><span /></span>
  );
  const download = () => {
    const blob = new Blob([cycleFile(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cycle-${today}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg(_t("Файл сохранён. В нём только «Мой цикл»: дни, заметки и настройки."));
  };
  const load = async (f: File) => {
    const text = await f.text();
    let ok = false;
    update((s) => { const n = readCycleFile(s, text); ok = Boolean(n); return n ?? s; });
    setTimeout(() => setMsg(ok ? _t("Перенесено. Дни из файла добавлены в календарь.") : _t("Это не файл «Моего цикла». Нужен файл cycle-….json.")), 0);
  };
  const addBio = async () => {
    const id = await bioAdd();
    if (id) { update((s) => setSis(s, { lock: { ...sisOf(s).lock!, bio: id } })); setMsg(_t("Face ID или отпечаток добавлен.")); }
    else setMsg(_t("Не получилось. PIN по-прежнему работает."));
  };
  return (
    <div className="cy">
      <div className="nk-grp">
        <label className="nk-r"><span>{_t("Закрыть по PIN-коду")}<small>{_t("Спрашивать при каждом открытии раздела")}</small></span>
          <span className="switch"><input type="checkbox" checked={Boolean(x.lock)} onChange={(e) => { if (e.target.checked) onPin(); else { update((s) => setSis(s, { lock: null })); closeNow(); } }} /><span /></span></label>
        {x.lock && bio && !x.lock.bio && <button type="button" className="nk-r sis-row" onClick={addBio}><span>{_t("Добавить Face ID или отпечаток")}<small>{_t("Вместо PIN, на этом телефоне")}</small></span><i aria-hidden="true">›</i></button>}
        {x.lock?.bio && <div className="nk-r"><span>{_t("Face ID или отпечаток добавлен")}</span><button type="button" className="link-btn" onClick={() => update((s) => setSis(s, { lock: { ...sisOf(s).lock!, bio: undefined } }))}>{_t("Убрать")}</button></div>}
        <label className="nk-r"><span>{_t("Скромный текст уведомлений")}<small>{_t("«Напоминание от Living Muslim», без слов о цикле и зикре")}</small></span>{sw('modest', true)}</label>
        <label className="nk-r"><span>{_t("Прогноз следующих дней")}<small>{_t("Нужно хотя бы 2 прошлых цикла")}</small></span>{sw('guess', false)}</label>
        {x.guess && <label className="nk-r"><span>{_t("Напомнить за 2 дня")}<small>{_t("Приходит вместе с напоминанием о Зухре")}</small></span>{sw('rem', true)}</label>}
      </div>
      <div className="cy-card">
        <div className="nk-sec" style={{ marginTop: 0 }}>{_t("Где хранится")}</div>
        <p className="tiny" style={{ margin: 0 }}>{_t("Только на этом телефоне. Не уходит на сервер, его не видят круг, администратор, помощник и мы. Напоминания телефон показывает сам. При смене телефона перенеси файлом.")}</p>
      </div>
      <button type="button" className="ghost-btn cy-btn" onClick={download}>{_t("Сохранить в файл")}</button>
      <button type="button" className="ghost-btn cy-btn" onClick={() => file.current?.click()}>{_t("Перенести из файла")}</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} />
      {!sure ? <button type="button" className="ghost-btn cy-btn danger" onClick={() => setSure(true)}>{_t("Удалить все данные цикла")}</button> : (
        <div className="cy-card cy-sure">
          <b>{_t("Удалить всё безвозвратно?")}</b>
          <p className="tiny">{_t("Сотрутся дни, заметки, прогноз и PIN. Отметки постов Рамадана останутся: это счёт постов к восполнению.")}</p>
          <div className="cy-row"><button type="button" className="ghost-btn" onClick={() => setSure(false)}>{_t("Отмена")}</button><button type="button" className="pri-btn cy-del" onClick={() => { update(wipeCycle); closeNow(); setSure(false); setMsg(_t("Данные цикла удалены с телефона.")); }}>{_t("Удалить")}</button></div>
        </div>
      )}
      {msg && <p className="cy-msg" role="status">{msg}</p>}
    </div>
  );
}

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="cy-keys">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => <button type="button" key={k} onClick={() => onKey(k)}>{k}</button>)}
      <span />
      <button type="button" onClick={() => onKey('0')}>0</button>
      <button type="button" className="x" onClick={() => onKey('del')} aria-label={_t("Стереть")}>⌫</button>
    </div>
  );
}
const Dots = ({ n }: { n: number }) => <div className="cy-pd" aria-hidden="true">{[0, 1, 2, 3].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}</div>;
const Star = () => (
  <svg className="cy-star" viewBox="0 0 48 48" aria-hidden="true"><rect x="12" y="12" width="24" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="12" y="12" width="24" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" transform="rotate(45 24 24)" /><circle cx="24" cy="24" r="4" fill="currentColor" /></svg>
);

function SetPin({ update, onDone }: { update: Update; onDone: () => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  const second = a.length === 4;
  const key = async (k: string) => {
    setErr('');
    if (!second) { setA(k === 'del' ? a.slice(0, -1) : (a + k).slice(0, 4)); return; }
    const nb = k === 'del' ? b.slice(0, -1) : (b + k).slice(0, 4);
    setB(nb);
    if (nb.length === 4) {
      if (nb !== a) { setErr(_t("Не совпало, попробуй ещё раз")); setA(''); setB(''); return; }
      const lock = await makeLock(a);
      update((s) => setSis(s, { lock }));
      markOpen();
      onDone();
    }
  };
  return (
    <div className="cy-pin">
      <Star />
      <h3>{second ? _t("Повтори PIN") : _t("Придумай PIN")}</h3>
      <p>{_t("4 цифры. Хранится только на этом телефоне. Если забудешь, данные цикла придётся стереть.")}</p>
      <Dots n={second ? b.length : a.length} />
      {err && <p className="cy-err" role="alert">{err}</p>}
      <Keypad onKey={(k) => void key(k)} />
    </div>
  );
}

function PinGate({ state, update, onOpen }: { state: AppState; update: Update; onOpen: () => void }) {
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [forgot, setForgot] = useState(false);
  const bio = sisOf(state).lock?.bio;
  const tryBio = async () => { if (bio && (await bioCheck(bio))) onOpen(); };
  useEffect(() => { if (bio) void tryBio(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const key = async (k: string) => {
    setErr('');
    const n = k === 'del' ? p.slice(0, -1) : (p + k).slice(0, 4);
    setP(n);
    if (n.length === 4) {
      if (await pinOk(state, n)) onOpen();
      else { setErr(_t("Неверный PIN")); setP(''); }
    }
  };
  if (forgot) return (
    <div className="cy-pin">
      <Star />
      <h3>{_t("Забыла PIN?")}</h3>
      <p>{_t("Открыть без PIN нельзя. Можно стереть данные цикла и начать заново. Если есть файл-копия, его потом можно перенести.")}</p>
      <button type="button" className="pri-btn cy-del" onClick={() => { update(wipeCycle); onOpen(); }}>{_t("Стереть данные цикла")}</button>
      <button type="button" className="link-btn cy-link" onClick={() => setForgot(false)}>{_t("Назад к PIN")}</button>
    </div>
  );
  return (
    <div className="cy-pin">
      <Star />
      <h3>{_t("Мой цикл")}</h3>
      <p>{_t("Введи PIN. Он хранится только на этом телефоне.")}</p>
      <Dots n={p.length} />
      {err && <p className="cy-err" role="alert">{err}</p>}
      <Keypad onKey={(k) => void key(k)} />
      <div className="cy-pin-row">
        {bio && <button type="button" className="link-btn cy-link" onClick={() => void tryBio()}>{_t("Face ID / отпечаток")}</button>}
        <button type="button" className="link-btn cy-link" onClick={() => setForgot(true)}>{_t("Забыла PIN")}</button>
      </div>
    </div>
  );
}

