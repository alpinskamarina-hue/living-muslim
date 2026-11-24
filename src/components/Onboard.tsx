import { useEffect, useRef, useState } from 'react';
import type { Anchor, AppState, Habit } from '../types';
import { ANCHOR_LABEL } from '../types';
import { PLACES, type DayTimes } from '../prayer';
import { CityPicker } from './CityPicker';
import { hhmm } from '../dates';
import { uid } from '../store';
import { aiName } from '../assistant';
import { AiFace } from '../aiLook';
import { inviteFriend } from '../plan';
import { startPath } from './NewPath';
import { aiTopicChips } from '../aiTopics';
import { askAssistant } from './Assistant';
import { _t } from '../i18n';
import { SisterPrivacyCard } from './Sisters';

type Update = (fn: (s: AppState) => AppState) => void;

/** First day with the helper: a sister helps sisters, a brother helps brothers. State on this phone only. */
const KEY = 'lm.onb';
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
/** '' = not started, '1'..'3' = steps done, 'done' / 'skip' = finished. */
export const onbState = () => ls.get(KEY) || '';
const setOnb = (v: string) => { ls.set(KEY, v); try { window.dispatchEvent(new Event(KEY)); } catch { /* */ } };
/** Start again from Profile → «Как пользоваться». */
export const onbReset = () => setOnb('again');

export function useOnb() {
  const [v, setV] = useState(onbState);
  useEffect(() => {
    const f = () => setV(onbState());
    window.addEventListener(KEY, f);
    return () => window.removeEventListener(KEY, f);
  }, []);
  return v;
}

const HABITS: { ic: string; action: string; min: string; anchor: Anchor }[] = [
  { ic: '📖', action: _t("1 страница Корана"), min: _t("1 аят"), anchor: 'fajr' },
  { ic: '📿', action: _t("Азкары"), min: _t("3 зикра"), anchor: 'maghrib' },
  { ic: '🤲', action: _t("Дуа за родителей"), min: _t("Одно дуа"), anchor: 'isha' },
];

/** Card on Today: the brother/sister question, then the helper's greeting with 3 steps. */
export function OnboardCard({ state, update, times, today, onGo }: { state: AppState; update: Update; times: DayTimes; today: string; onGo: (t: 'circle' | 'assistant' | 'privacy') => void }) {
  const st = useOnb();
  const [open, setOpen] = useState(false);
  const over = st === 'done' || st === 'skip';
  if (over && !open) return null;
  const s = state.settings;
  const f = s.me === 'f';
  const name = aiName(s);
  const skip = () => setOnb('skip');
  const n = Number(st) || 0;
  if (!s.me) {
    return (
      <div className="onb">
        <div className="onb-hd"><span className="onb-spark" aria-hidden="true">✨</span><span><b>{_t("Добро пожаловать в Living Muslim")}</b><small>{_t("Помощник покажет приложение за 2 минуты")}</small></span></div>
        <p>{_t("Как к тебе обращаться? От этого зависит, кто будет помогать: брату помогает брат, сестре сестра.")}</p>
        <div className="onb-two">
          <button type="button" className="onb-go" onClick={() => update((x) => ({ ...x, settings: { ...x.settings, me: 'm' } }))}>🧔 {_t("Я брат")}</button>
          <button type="button" className="onb-go" onClick={() => update((x) => ({ ...x, settings: { ...x.settings, me: 'f' } }))}>🧕 {_t("Я сестра")}</button>
        </div>
        <button type="button" className="onb-skip" onClick={skip}>{f ? _t("Разберусь сама") : _t("Разберусь сам")}</button>
      </div>
    );
  }
  const steps = [_t("🕌 Время намаза для твоего города"), _t("🌱 Первая маленькая привычка"), _t("🤝 Круг: позвать близкого")];
  const herSelf = s.me === 'f';
  return (
    <>
      {herSelf && !over && <SisterPrivacyCard state={state} update={update} onOwn={() => onGo('privacy')} />}
      {!over && <div className="onb">
        <div className="onb-hd"><AiFace s={s} size={44} /><span>
          <b>{herSelf ? _t("Я {0}, твоя помощница", name) : _t("Я {0}, твой помощник", name)}</b>
          <small>{_t("Покажу приложение за 2 минуты")}</small></span></div>
        <p>{n ? _t("Продолжим? Осталось совсем немного:") : f ? _t("Сестра, давай вместе настроим главное. Три шага, и приложение будет твоим:") : _t("Брат, давай вместе настроим главное. Три шага, и приложение будет твоим:")}</p>
        <div className="onb-steps">
          {steps.map((t, i) => <div key={i} className={i < n ? 'ok' : i === n ? 'cur' : ''}><i>{i < n ? '✓' : ''}</i>{t}</div>)}
        </div>
        <button type="button" className="onb-go wide" onClick={() => setOpen(true)}>{n ? _t("Продолжить") : _t("Давай, {0}", name)}</button>
        <button type="button" className="onb-skip" onClick={skip}>{f ? _t("Разберусь сама") : _t("Разберусь сам")}</button>
      </div>}
      {open && <OnboardChat state={state} update={update} times={times} today={today} start={n} onClose={() => setOpen(false)} onGo={(t) => { setOpen(false); onGo(t); }} />}
    </>
  );
}

type Line = { k: string; ai: boolean; node: React.ReactNode };

function nearest(lat: number, lng: number) {
  let best = PLACES[0], d = Infinity;
  for (const p of PLACES) {
    const dd = (p.lat - lat) ** 2 + ((p.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (dd < d) { d = dd; best = p; }
  }
  return Math.sqrt(d) * 111 < 50 ? best.name : '';
}

/** The guided chat. Scripted, so it works without sign-in and costs nothing. Every change can be undone. */
function OnboardChat({ state, update, times, today, start, onClose, onGo }: { state: AppState; update: Update; times: DayTimes; today: string; start: number; onClose: () => void; onGo: (t: 'circle' | 'assistant') => void }) {
  const s = state.settings;
  const f = s.me === 'f';
  const she = f; // the helper is a sister for sisters
  const name = aiName(s);
  const [step, setStep] = useState(start); // 0 city, 1 habit, 2 circle, 3 final
  const [sub, setSub] = useState<'ask' | 'pick' | 'madhab' | 'set' | 'own'>('ask');
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [own, setOwn] = useState({ t: '', a: 'fajr' as Anchor });
  const listRef = useRef<HTMLDivElement>(null);
  const prev = useRef({ place: s.place, lat: s.lat, lng: s.lng, madhab: s.madhab });

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [lines, sub, step]);

  const say = (ai: boolean, node: React.ReactNode) => setLines((l) => [...l, { k: uid(), ai, node }]);
  const me = (t: string) => say(false, t);
  const next = (to: number) => { setOnb(String(to)); setStep(to); setSub('ask'); };

  // ── step 1: city and madhab
  const setPlace = (place: string, lat: number, lng: number) => {
    update((x) => ({ ...x, settings: { ...x.settings, place, lat, lng } }));
    setSub('madhab');
  };
  const locate = () => {
    me(_t("📍 Определить по телефону"));
    if (!navigator.geolocation) { say(true, _t("Телефон не даёт место. Выбери город из списка.")); setSub('pick'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); const nm = nearest(p.coords.latitude, p.coords.longitude) || _t("Моё место"); setPlace(nm, p.coords.latitude, p.coords.longitude); },
      () => { setBusy(false); say(true, _t("Не получилось определить. Выбери город из списка.")); setSub('pick'); },
      { timeout: 10000 },
    );
  };
  const madhab = (m: 'hanafi' | 'shafi', label: string, unsure = false) => {
    me(label);
    update((x) => ({ ...x, settings: { ...x.settings, madhab: m } }));
    if (unsure) say(true, _t("Поставлю как у большинства мазхабов. Поменять можно в Профиле → Время намаза."));
    setSub('set');
  };
  const undoCity = () => {
    const p = prev.current;
    update((x) => ({ ...x, settings: { ...x.settings, place: p.place, lat: p.lat, lng: p.lng, madhab: p.madhab } }));
    setLines((l) => l.slice(0, 0)); setSub('ask');
  };

  // ── step 2: first habit
  const addHabit = (action: string, min: string, anchor: Anchor) => {
    const h: Habit = { id: uid(), action, min: min || action, anchor, sphere: 'faith', status: 'active', createdAt: today };
    update((x) => ({ ...x, habits: [...x.habits, h] }));
    setAdded((a) => [...a, h.id]);
    me(`${action} ${ANCHOR_LABEL[anchor].after.toLowerCase()}`);
    say(true, <>
      {she ? _t("Хороший выбор. Добавила:") : _t("Хороший выбор. Добавил:")}
      <span className="onb-done"><b>🌱 {action}</b>{_t("Каждый день · {0}", ANCHOR_LABEL[anchor].after.toLowerCase())}
        <span className="onb-u"><button type="button" onClick={() => { update((x) => ({ ...x, habits: x.habits.filter((y) => y.id !== h.id) })); setAdded((a) => a.filter((y) => y !== h.id)); }}>{_t("Отменить")}</button></span></span>
      {_t("Отмечай её на «Сегодня» после намаза. Если совсем нет сил, хватит минимума: «{0}».", min || action)}
    </>);
    setSub('set');
  };

  const finish = () => { setOnb('done'); try { localStorage.setItem('lm.fw', 'hide'); } catch { /* */ } };

  const city = s.place;
  return (
    <div className="onb-sheet" role="dialog" aria-modal="true" aria-label={name}>
      <button type="button" className="onb-scrim" aria-label={_t("Закрыть")} onClick={onClose} />
      <div className="onb-box">
        <div className="onb-top"><AiFace s={s} size={40} /><span><b>{name}</b><small>{_t("Ответы ИИ, не фетва")}</small></span>
          {step < 3 && <em>{_t("Шаг {0} из 3", step + 1)}</em>}
          <button type="button" className="onb-x" onClick={onClose} aria-label={_t("Закрыть")}>×</button></div>
        <div className="onb-list" ref={listRef}>
          {step === 0 && <Ai s={s}>{_t("Где ты живёшь? Сейчас время намаза считается для города {0}.", city)}</Ai>}
          {step === 1 && <Ai s={s}>{_t("Привычка держится, когда она маленькая и привязана к намазу. Что тебе ближе?")}</Ai>}
          {step === 2 && <Ai s={s}>{_t("Вместе держаться легче. В Круге близкие видят только итог дня и делают дуа друг за друга. Позовём кого-нибудь?")}</Ai>}
          {step === 3 && <Ai s={s}>{_t("Всё готово, барак Аллаху фик 🤍")}<br /><br />{_t("Я всегда рядом: круглая кнопка внизу справа. Спрашивай, как что работает, или просто скажи, и я сделаю: «запиши, что я съел», «напомни в пятницу сделать дуа», «отметь Зухр».")}</Ai>}
          {step === 3 && <Ai s={s}>{f ? <>{_t("И главное:")} <b>{_t("всё, что связано с жизнью мусульманки, здесь есть.")}</b></> : <>{_t("И главное:")} <b>{_t("всё, что связано с жизнью мусульманина, здесь есть.")}</b></>} {_t("Намаз, Коран, учёба, умра и поездки, халяльная еда, здоровье, садака, семья, дела. Просто спроси меня, и я покажу, где это и как пользоваться.")}</Ai>}

          {lines.map((l) => (l.ai ? <Ai key={l.k} s={s}>{l.node}</Ai> : <div key={l.k} className="onb-me">{l.node}</div>))}
          {busy && <Ai s={s}><span className="onb-dots"><i /><i /><i /></span></Ai>}

          {step === 0 && sub === 'ask' && !busy && <Chips>
            <button type="button" className="f" onClick={locate}>{_t("📍 Определить по телефону")}</button>
            <button type="button" onClick={() => { me(_t("{0}, верно", city)); setSub('madhab'); }}>{_t("{0}, верно", city)}</button>
            <button type="button" onClick={() => { me(_t("Другой город")); setSub('pick'); }}>{_t("Другой город")}</button>
          </Chips>}
          {step === 0 && sub === 'pick' && <Chips>
            <div className="onb-city"><CityPicker value={null} onPick={(p) => { me(p.name); setPlace(p.name, p.lat, p.lng); }} /></div>
          </Chips>}
          {step === 0 && sub === 'madhab' && <>
            <Ai s={s}>{_t("А мазхаб? От него зависит время Асра.")}</Ai>
            <Chips>
              <button type="button" onClick={() => madhab('hanafi', _t("Ханафи"))}>{_t("Ханафи")}</button>
              <button type="button" onClick={() => madhab('shafi', _t("Шафии, маликии, ханбали"))}>{_t("Шафии, маликии, ханбали")}</button>
              <button type="button" onClick={() => madhab('shafi', _t("Не знаю"), true)}>{_t("Не знаю")}</button>
            </Chips>
          </>}
          {step === 0 && sub === 'set' && <>
            <Ai s={s}>{_t("Готово, машаАллах.")}
              <span className="onb-done"><b>{_t("🕌 Время намаза: {0}", s.place)}</b>{_t("Сегодня Аср в {0}, Магриб в {1}", hhmm(times.asr), hhmm(times.maghrib))}
                <span className="onb-u"><button type="button" onClick={undoCity}>{_t("Отменить")}</button></span></span>
              {_t("Когда помолишься, нажми на намаз на «Сегодня», так он отмечается. Если время расходится с мечетью, поправь по минуте в Профиле.")}</Ai>
            <Chips><button type="button" className="f" onClick={() => { setLines([]); next(1); }}>{_t("Дальше →")}</button></Chips>
          </>}

          {step === 1 && sub === 'ask' && <Chips>
            {HABITS.map((h) => <button key={h.action} type="button" onClick={() => addHabit(h.action, h.min, h.anchor)}>{h.ic} {h.action} {ANCHOR_LABEL[h.anchor].after.toLowerCase()}</button>)}
            <button type="button" onClick={() => setSub('own')}>{_t("✍️ Своё")}</button>
            <button type="button" onClick={() => { finish(); startPath(update, today); onClose(); }}>{f ? _t("🌱 Я недавно приняла ислам") : _t("🌱 Я недавно принял ислам")}</button>
          </Chips>}
          {step === 1 && sub === 'own' && <div className="onb-own">
            <input autoFocus value={own.t} onChange={(e) => setOwn({ ...own, t: e.target.value })} maxLength={80} placeholder={_t("Например, 10 минут арабского")} />
            <div className="onb-anc">{(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as Anchor[]).map((a) => <button key={a} type="button" className={own.a === a ? 'on' : ''} onClick={() => setOwn({ ...own, a })}>{ANCHOR_LABEL[a].ru}</button>)}</div>
            <button type="button" className="onb-go" disabled={!own.t.trim()} onClick={() => { addHabit(own.t.trim(), '', own.a); setOwn({ t: '', a: 'fajr' }); }}>{_t("Добавить")}</button>
          </div>}
          {step === 1 && sub === 'set' && <Chips>
            <button type="button" className="f" disabled={!added.length} onClick={() => { setLines([]); next(2); }}>{_t("Дальше →")}</button>
            <button type="button" onClick={() => setSub('ask')}>{_t("Добавить ещё одну")}</button>
          </Chips>}

          {step === 2 && sub === 'ask' && <Chips>
            <button type="button" className="f" onClick={async () => { me(_t("Отправить приглашение")); const r = await inviteFriend(); say(true, r === 'cancel' ? _t("Ничего страшного, позвать можно позже на вкладке «Круг».") : r === 'copied' ? _t("Ссылка скопирована, отправь её близкому в любом мессенджере.") : _t("Отправлено. Когда близкий войдёт, позови его в свой круг на вкладке «Круг».")); setSub('set'); }}>{_t("Отправить приглашение")}</button>
            <button type="button" onClick={() => { finish(); onGo('circle'); }}>{_t("Открыть Круг")}</button>
            <button type="button" onClick={() => { me(_t("Позже")); setSub('set'); }}>{_t("Позже")}</button>
          </Chips>}
          {step === 2 && sub === 'set' && <Chips><button type="button" className="f" onClick={() => { setLines([]); next(3); finish(); }}>{_t("Дальше →")}</button></Chips>}

          {step === 3 && <Chips>
            {aiTopicChips(s).map((c) => <button key={c.label} type="button" onClick={() => { finish(); onClose(); askAssistant(c.ask); }}>{c.label}</button>)}
          </Chips>}
          {step === 3 && <Chips>
            <button type="button" className="f" onClick={() => { finish(); onGo('assistant'); }}>{_t("Задать свой вопрос")}</button>
            <button type="button" onClick={() => { finish(); onClose(); }}>{_t("Готово")}</button>
          </Chips>}
        </div>
      </div>
    </div>
  );
}

function Ai({ s, children }: { s: AppState['settings']; children: React.ReactNode }) {
  return <div className="onb-row"><AiFace s={s} size={26} /><div className="onb-it">{children}</div></div>;
}
const Chips = ({ children }: { children: React.ReactNode }) => <div className="onb-chips">{children}</div>;
