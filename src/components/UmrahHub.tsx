import { useState } from 'react';
import type { AppState, UmrahState } from '../types';
import type { UmrahApi } from '../umrahCircle';
import { IHRAM_RULES, PREP, STEPS, type Step } from '../umrah/guide';
import { DuaList, StepView, umrahOf, prepPct } from './Umrah';
import { UmrahTrips } from './UmrahTrips';
import { MiqatView } from './Miqat';
import { UmrahSavings } from './UmrahSavings';
import { plural } from '../dates';
import { UMRAH_VIDEOS, embed, mins } from '../umrah/videos';

// One place for the whole umrah: what matters today, the heart, my duas, the rites and the trip.
// Both Practice and the Circle open this screen.

export type HubTab = 'heart' | 'duas' | 'rites' | 'trip';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  today: string;
  api: UmrahApi;
  nameOf: (id: string) => string;
  onExit: () => void;
  backLabel: string;
  start?: HubTab;
}

const HEART = ['niyya', 'tawba', 'debts', 'learn', 'talbiya', 'duas', 'farewell'];
const daysOf = (when: string) => Number(when.split(' ')[0]) || 0;
const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const diff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const dLabel = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${day} ${['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][m - 1]}`; };

export function UmrahHub({ state, update, today, api, nameOf, onExit, backLabel, start }: Props) {
  const [tab, setTab] = useState<HubTab>(start ?? 'heart');
  const [step, setStep] = useState<Step | null>(null);
  const [miqat, setMiqat] = useState(false);
  const u = umrahOf(state);
  const { me, trips, rsvp, duas } = api;

  // Travel days: the chosen dates of the group trip I am going on, else my own.
  const myTrips = me ? Object.entries(rsvp[me] ?? {}).filter(([h, r]) => r.s === 'go' && trips[h]).map(([h]) => h) : [];
  const groupDates = myTrips.map((h) => trips[h].dates?.find((d) => d.id === trips[h].chosen)).find(Boolean);
  const from = groupDates?.from ?? u.from;
  const to = groupDates?.to ?? u.to;
  const left = from ? diff(today, from) : null;
  const phase = !from ? 'none' : left! > 30 ? 'far' : left! > 6 ? 'month' : left! > 0 ? 'week' : to && diff(today, to) >= 0 ? 'there' : to && diff(to, today) <= 40 ? 'after' : 'done';

  const togglePrep = (id: string) => update((s) => patch(s, { prep: umrahOf(s).prep.includes(id) ? umrahOf(s).prep.filter((x) => x !== id) : [...umrahOf(s).prep, id] }));
  const heart = PREP.filter((p) => HEART.includes(p.id));
  const deeds = PREP.filter((p) => !HEART.includes(p.id));
  const pct = (l: typeof PREP) => Math.round((l.filter((p) => u.prep.includes(p.id)).length / l.length) * 100);
  // What to do next: undone items whose time has come, earliest deadline first.
  const due = PREP.filter((p) => !u.prep.includes(p.id) && (left === null || left > 30 ? HEART.includes(p.id) : left <= daysOf(p.when) + 7)).sort((a, b) => daysOf(b.when) - daysOf(a.when)).slice(0, 3);

  // Requests for dua from the Circle for the trips I am going on.
  const asks = Object.entries(duas).flatMap(([who, m]) => myTrips.flatMap((h) => (m?.[h] ?? []).map((text, i) => ({ key: `${who}:${h}:${i}`, who, text }))));
  const toggleAsk = (k: string) => update((s) => { const a = umrahOf(s).asked ?? []; return patch(s, { asked: a.includes(k) ? a.filter((x) => x !== k) : [...a, k] }); });

  if (step) return <StepView step={step} state={state} update={update} asks={asks.map((a) => ({ ...a, who: nameOf(a.who) }))} onBack={() => setStep(null)}
    onNext={() => { const i = STEPS.findIndex((x) => x.id === step.id); setStep(STEPS[i + 1] ?? null); }} />;

  if (miqat) return <MiqatView state={state} update={update} onBack={() => setMiqat(false)} />;

  const talbiya = STEPS.find((s) => s.id === 'talbiya')?.dua?.[0];

  return (
    <div className="page umrah-page">
      <button type="button" className="link-btn um-back" onClick={onExit}>← {backLabel}</button>
      <div className="um-hero">
        <span>🕋</span>
        <h1 className="page-h">Умра</h1>
        <div className="um-ready">
          <span><b>{pct(heart)}%</b><small>сердце</small></span>
          <span><b>{pct(deeds)}%</b><small>дела</small></span>
          <span><b>{from ? (left! > 0 ? left : '—') : '—'}</b><small>{from && left! > 0 ? plural(left!, 'день до вылета', 'дня до вылета', 'дней до вылета') : 'дней до вылета'}</small></span>
        </div>
      </div>

      {u.ihram && (
        <button type="button" className="um-ihram" onClick={() => setMiqat(true)}>
          <b>Ты в ихраме</b><small>тальбия и запреты ›</small>
        </button>
      )}

      {/* Now: changes by the days left, so the person sees only what matters today. */}
      <div className="um-now">
        <em>Сейчас</em>
        {phase === 'none' && (
          <>
            <b>Копилка на умру</b>
            <UmrahSavings state={state} update={update} today={today} compact onOpen={() => setTab('trip')} />
            <b>Когда едешь?</b>
            <p>Укажи дни, и экран будет подсказывать, что делать сейчас. Если едешь группой из Круга, даты возьмутся из поездки.</p>
            <div className="up-add">
              <input type="date" defaultValue={u.from} onChange={(e) => update((s) => patch(s, { from: e.target.value || undefined }))} aria-label="Вылет" />
              <input type="date" defaultValue={u.to} onChange={(e) => update((s) => patch(s, { to: e.target.value || undefined }))} aria-label="Возвращение" />
            </div>
            <p className="tiny">Пока дат нет, начни с сердца: намерение и покаяние не зависят от билетов.</p>
          </>
        )}
        {phase === 'far' && <><b>Время намерения</b><p>До вылета {left} {plural(left!, 'день', 'дня', 'дней')}. Самое важное сейчас не билеты, а сердце: ради кого ты едешь. Обнови намерение, попроси прощения, начни учить тальбию.</p>{(u.funds ?? []).some((f) => !f.for) && <UmrahSavings state={state} update={update} today={today} compact />}</>}
        {phase === 'month' && <><b>Месяц до умры</b><p>Документы, разрешение в Nusuk, билеты. И по одному шагу гида в день, чтобы на месте всё было знакомо.</p></>}
        {phase === 'week' && <><b>Последняя неделя</b><p>Вещи, список дуа, договорённости с семьёй и работой. Попрощайся с близкими и оставь садака.</p><button type="button" className="pri-btn" onClick={() => setMiqat(true)}>✈ Микат в самолёте: указать рейс</button></>}
        {phase === 'there' && (
          <>
            <b>Ты в пути. Ляббайк, Аллахумма ляббайк</b>
            <p>Гид работает без интернета. Таваф {u.tawaf}/7, саи {u.saee}/7.</p>
            {!u.ihram && <button type="button" className="pri-btn" onClick={() => setMiqat(true)}>✈ Микат в самолёте</button>}
            <button type="button" className="pri-btn" onClick={() => setTab('rites')}>Открыть обряды</button>
          </>
        )}
        {phase === 'after' && <><b>Умра позади. Да примет Аллах</b><p>Сохрани это состояние: оставь одну привычку из поездки (ночной намаз, Коран после Фаджра, больше дуа) и не возвращайся к тому, от чего покаялся.</p></>}
        {phase === 'done' && <><b>Да примет Аллах твою умру</b><p>Если собираешься снова, укажи новые даты в «Поездке».</p></>}
        {due.length > 0 && phase !== 'there' && phase !== 'after' && (
          <div className="um-due">
            {due.map((p) => (
              <label key={p.id} className="chk">
                <input type="checkbox" checked={false} onChange={() => togglePrep(p.id)} />
                <span><b>{p.text}</b><small>{HEART.includes(p.id) ? 'сердце' : 'дела'} · за {p.when}</small></span>
              </label>
            ))}
          </div>
        )}
        {from && phase !== 'none' && <small className="um-dates">{groupDates ? 'Даты группы' : 'Мои даты'}: {dLabel(from)}{to ? ` – ${dLabel(to)}` : ''}</small>}
      </div>

      <div className="seg um-seg">
        {([['heart', 'Сердце'], ['duas', 'Дуа'], ['rites', 'Обряды'], ['trip', 'Поездка']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'heart' && (
        <div className="um-sec">
          <p className="tiny">Умра начинается задолго до самолёта. Главная подготовка внутри.</p>
          <UmrahVideos u={u} update={update} />
          {heart.map((p) => (
            <label key={p.id} className="chk"><input type="checkbox" checked={u.prep.includes(p.id)} onChange={() => togglePrep(p.id)} /><span><b>{p.text}</b><small>за {p.when} до поездки</small></span></label>
          ))}
          {talbiya && (
            <div className="h-card dua">
              <small className="um-k">Тальбия, учим наизусть</small>
              <p className="ar-dua" lang="ar" dir="rtl">{talbiya.ar}</p>
              <p className="dua-tr">{talbiya.tr}</p>
              <p className="dua-ru">{talbiya.ru}</p>
              <small className="src">{talbiya.src}</small>
            </div>
          )}
          <h3>Дела</h3>
          {deeds.map((p) => (
            <label key={p.id} className="chk"><input type="checkbox" checked={u.prep.includes(p.id)} onChange={() => togglePrep(p.id)} /><span><b>{p.text}</b><small>за {p.when} до поездки</small></span></label>
          ))}
          <p className="tiny">Готовность видна группе только процентом, сами пункты нет.</p>
        </div>
      )}

      {tab === 'duas' && (
        <div className="um-sec">
          {asks.length > 0 && (
            <>
              <h3>Просят из Круга <small>{asks.filter((a) => u.asked?.includes(a.key)).length} из {asks.length}</small></h3>
              {asks.map((a) => (
                <label key={a.key} className="chk">
                  <input type="checkbox" checked={Boolean(u.asked?.includes(a.key))} onChange={() => toggleAsk(a.key)} />
                  <span><b style={u.asked?.includes(a.key) ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{a.text}</b><small>{nameOf(a.who)}</small></span>
                </label>
              ))}
              <h3>Мои</h3>
            </>
          )}
          <DuaList state={state} update={update} />
        </div>
      )}

      {tab === 'rites' && (
        <div className="um-sec">
          <button type="button" className="q-row" onClick={() => setMiqat(true)}>
            <span className="q-n">✈</span>
            <span className="q-t"><b>{u.ihram ? 'Я в ихраме' : 'Микат в самолёте'}</b><small>{u.ihram ? 'Тальбия и запреты' : 'Таймер до намерения по времени посадки'}</small></span>
          </button>
          {STEPS.map((s, i) => (
            <button type="button" key={s.id} className="q-row" onClick={() => setStep(s)}>
              <span className="q-n">{i + 1}</span>
              <span className="q-t"><b>{s.title}</b><small>{s.short}{s.counter ? ` · ${u[s.counter]}/7` : ''}</small></span>
            </button>
          ))}
          <h3>Запреты в ихраме</h3>
          <ul className="rules">{IHRAM_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="tiny">Гид описывает умру по сунне в общих чертах. Детали различаются по мазхабам: уточняй у своего имама или руководителя группы.</p>
        </div>
      )}

      {tab === 'trip' && (
        <div className="um-sec">
          <UmrahSavings state={state} update={update} today={today} />
          {api.me ? (
            <UmrahTrips api={api} myReady={prepPct(state)} nameOf={nameOf} embedded />
          ) : (
            <p className="tiny">Чтобы поехать группой, войди в Круг: там собираются поездки, даты, жильё и общая касса.</p>
          )}
          {myTrips.length === 0 && (
            <div className="um-solo">
              <b>Едешь один или с агентством?</b>
              <p className="tiny">Укажи свои даты, и «Сейчас» будет подсказывать по дням.</p>
              <div className="up-add">
                <input type="date" defaultValue={u.from} onChange={(e) => update((s) => patch(s, { from: e.target.value || undefined }))} aria-label="Вылет" />
                <input type="date" defaultValue={u.to} onChange={(e) => update((s) => patch(s, { to: e.target.value || undefined }))} aria-label="Возвращение" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Video lessons: how to perform umrah, in Russian or English, played right here. */
function UmrahVideos({ u, update }: { u: UmrahState; update: Props['update'] }) {
  const [lang, setLang] = useState<'ru' | 'en'>(u.vlang ?? 'ru');
  const [play, setPlay] = useState<string | null>(null);
  const c = UMRAH_VIDEOS.find((x) => x.lang === lang)!;
  const seen = u.watched ?? [];
  const done = c.lessons.filter((l) => seen.includes(l.id)).length;
  const mark = (id: string) => update((s) => { const w = umrahOf(s).watched ?? []; return patch(s, { watched: w.includes(id) ? w : [...w, id] }); });
  const pick = (l: 'ru' | 'en') => { setLang(l); setPlay(null); update((s) => patch(s, { vlang: l })); };
  return (
    <div className="um-vid">
      <div className="um-vid-top">
        <span><b>▶ Как совершить умру</b><small>{c.by} · {done} из {c.lessons.length}</small></span>
        <div className="um-lang">{(['ru', 'en'] as const).map((l) => <button key={l} type="button" aria-pressed={lang === l} onClick={() => pick(l)}>{l.toUpperCase()}</button>)}</div>
      </div>
      {play && (
        <div className="um-player">
          <iframe src={embed(play)} title="Видеоурок" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      )}
      <div className="um-lessons">
        {c.lessons.map((l, i) => (
          <button key={l.id} type="button" className={`${play === l.id ? 'on' : ''}${seen.includes(l.id) ? ' seen' : ''}`} onClick={() => { setPlay(l.id); mark(l.id); }}>
            <em>{seen.includes(l.id) ? '✓' : i + 1}</em>
            <span>{l.t}</span>
            <small>{mins(l.s)}</small>
          </button>
        ))}
      </div>
      <small className="um-vid-src">Видео с YouTube, канал автора. Детали различаются по мазхабам, уточняй у своего имама.</small>
    </div>
  );
}
