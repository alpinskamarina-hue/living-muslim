import { useEffect, useRef, useState } from 'react';
import type { AppState, UmrahState } from '../types';
import { IHRAM_RULES, PREP, ROUND_IDEAS, STEPS, type Step } from '../umrah/guide';
import { uid } from '../store';
import { UMRAH_VIDEOS, embed } from '../umrah/videos';
import { SaeeScene, TawafScene } from './LapScene';
import { _t, _tj } from '../i18n';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  onExit: () => void;
}

export const umrahOf = (s: AppState): UmrahState => ({ prep: [], duas: [], tawaf: 0, saee: 0, ...(s.umrah ?? {}) });
const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
export const prepPct = (s: AppState) => Math.round((umrahOf(s).prep.filter((id) => PREP.some((p) => p.id === id)).length / PREP.length) * 100);

export function Umrah({ state, update, onExit }: Props) {
  const [tab, setTab] = useState<'guide' | 'prep' | 'duas'>('guide');
  const [step, setStep] = useState<Step | null>(null);
  const u = umrahOf(state);

  if (step) return <StepView step={step} state={state} update={update} onBack={() => setStep(null)}
    onNext={() => { const i = STEPS.findIndex((x) => x.id === step.id); setStep(STEPS[i + 1] ?? null); }} />;

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onExit} aria-label={_t("Выйти")}>✕</button>
        <div><b>{_t("Умра")}</b><small>{_tj("Гид, подготовка {0}%, мои дуа", prepPct(state))}</small></div>
      </div>
      <div className="seg">
        {([['guide', _t("Обряды")], ['prep', _t("Подготовка")], ['duas', _t("Мои дуа")]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="h-wrap">
        {tab === 'guide' && (
          <>
            {STEPS.map((s, i) => (
              <button type="button" key={s.id} className="q-row" onClick={() => setStep(s)}>
                <span className="q-n">{i + 1}</span>
                <span className="q-t"><b>{s.title}</b><small>{s.short}{s.counter ? _t(" · счётчик") : ''}</small></span>
              </button>
            ))}
            <h2 className="sub-h">{_t("Запреты в ихраме")}</h2>
            <ul className="rules">{IHRAM_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="q-msg left tiny-note">{_t("Гид описывает умру по сунне в общих чертах. Детали различаются по мазхабам: уточняй у своего имама или руководителя группы.")}</p>
          </>
        )}
        {tab === 'prep' && (
          <>
            <div className="stat-card"><div className="big">{prepPct(state)}%</div><div><b>{_t("готовности")}</b><small>{_t("видна группе, если едешь с Кругом")}</small></div></div>
            {PREP.map((p) => {
              const ok = u.prep.includes(p.id);
              return (
                <label key={p.id} className="chk">
                  <input type="checkbox" checked={ok} onChange={() => update((s) => patch(s, { prep: ok ? umrahOf(s).prep.filter((x) => x !== p.id) : [...umrahOf(s).prep, p.id] }))} />
                  <span><b>{p.text}</b><small>{_tj("за {0} до поездки", p.when)}</small></span>
                </label>
              );
            })}
          </>
        )}
        {tab === 'duas' && <DuaList state={state} update={update} />}
      </div>
    </div>
  );
}

export function DuaList({ state, update }: { state: AppState; update: Props['update'] }) {
  const u = umrahOf(state);
  const [text, setText] = useState('');
  const [who, setWho] = useState('');
  const add = () => {
    if (!text.trim()) return;
    update((s) => patch(s, { duas: [...umrahOf(s).duas, { id: uid(), text: text.trim(), who: who.trim() || undefined }] }));
    setText(''); setWho('');
  };
  return (
    <>
      <p className="q-msg left">{_t("Запиши, о чём хочешь попросить у Каабы, на Сафе и Марве, когда пьёшь Замзам. И просьбы близких, чтобы ничего не забыть.")}</p>
      <label className="field"><span>{_t("Дуа")}</span><input value={text} onChange={(e) => setText(e.target.value)} placeholder={_t("Например: о здоровье мамы")} /></label>
      <label className="field"><span>{_t("За кого или от кого (необязательно)")}</span><input value={who} onChange={(e) => setWho(e.target.value)} placeholder={_t("Мама")} /></label>
      <button type="button" className="pri-btn" onClick={add} disabled={!text.trim()}>{_t("Добавить")}</button>
      {u.duas.map((d) => (
        <label key={d.id} className="chk">
          <input type="checkbox" checked={Boolean(d.done)} onChange={() => update((s) => patch(s, { duas: umrahOf(s).duas.map((x) => (x.id === d.id ? { ...x, done: !x.done } : x)) }))} />
          <span><b style={d.done ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{d.text}</b>{d.who && <small>{d.who}</small>}</span>
          <button type="button" className="hg-act" onClick={(e) => { e.preventDefault(); update((s) => patch(s, { duas: umrahOf(s).duas.filter((x) => x.id !== d.id) })); }}>{_t("Убрать")}</button>
        </label>
      ))}
    </>
  );
}

/** A dua request from the Circle, already resolved to a name. */
export interface Ask { key: string; who: string; text: string }

export function StepView({ step, state, update, onBack, onNext, asks = [] }: { step: Step; state: AppState; update: Props['update']; onBack: () => void; onNext: () => void; asks?: Ask[] }) {
  const u = umrahOf(state);
  const idx = STEPS.findIndex((x) => x.id === step.id);
  const n = step.counter ? u[step.counter] : 0;
  const setN = (v: number) => step.counter && update((s) => patch(s, { [step.counter!]: Math.max(0, Math.min(7, v)) }));
  const saeeDir = (k: number) => (k % 2 === 1 ? _t("Сафа → Марва") : _t("Марва → Сафа"));

  // A round takes minutes, so a second tap within seconds is almost always a slip in the crowd: ask once more.
  const last = useRef(0);
  const [sure, setSure] = useState(false);
  const tap = () => {
    if (n >= 7) return;
    const now = Date.now();
    if (n > 0 && now - last.current < 40000 && !sure) { setSure(true); setTimeout(() => setSure(false), 5000); return; }
    last.current = now; setSure(false); setN(n + 1);
    try { navigator.vibrate?.(n + 1 === 7 ? [150, 80, 150] : 60); } catch { /* ignore */ }
  };

  // Keep the screen awake while counting, so the phone does not lock in the middle of a round.
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    if (!step.counter || n >= 7) return;
    type Lock = { release: () => Promise<void> };
    let lock: Lock | null = null;
    let off = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } };
    nav.wakeLock?.request('screen').then((l) => { if (off) l.release(); else { lock = l; setAwake(true); } }).catch(() => {});
    return () => { off = true; lock?.release().catch(() => {}); setAwake(false); };
  }, [step.counter, n >= 7]);

  // My duas and the Circle's requests, spread over the 7 rounds so that by the end nobody is forgotten.
  const items = [
    ...u.duas.map((d) => ({ key: `me:${d.id}`, text: d.text, who: d.who, done: Boolean(d.done) })),
    ...asks.map((a) => ({ key: `ask:${a.key}`, text: a.text, who: a.who, done: Boolean(u.asked?.includes(a.key)) })),
  ];
  const round = Math.min(n, 6);
  const mine = items.filter((_, i) => i % 7 === round);
  const madeAll = items.filter((x) => x.done).length;
  const toggle = (key: string) => update((s) => {
    const cur = umrahOf(s);
    if (key.startsWith('me:')) { const id = key.slice(3); return patch(s, { duas: cur.duas.map((d) => (d.id === id ? { ...d, done: !d.done } : d)) }); }
    const k = key.slice(4); const a = cur.asked ?? [];
    return patch(s, { asked: a.includes(k) ? a.filter((x) => x !== k) : [...a, k] });
  });
  const idea = step.counter === 'tawaf' ? ROUND_IDEAS[round] : null;

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onBack} aria-label={_t("К обрядам")}>‹</button>
        <div><b>{idx + 1}. {step.title}</b><small>{step.short}</small></div>
      </div>
      <div className="h-wrap">
        {!step.counter && <StepVideo stepId={step.id} lang={u.vlang ?? 'ru'} />}
        {step.counter && (
          <div className="lap-wrap">
            <button type="button" className={`scene-btn${sure ? ' sure' : ''}`} onClick={tap} aria-label={_t("Отметить круг")}>
              {step.counter === 'tawaf' ? <TawafScene n={n} /> : <SaeeScene n={n} />}
            </button>
            <div className={`scene-count${n === 7 ? ' done' : ''}`}>
              <span className="lap-n">{n}<small>/7</small></span>
              <span className="lap-t">{n === 7 ? _t("Готово, машаАллах")
                : sure ? _t("Так быстро? Нажми ещё раз, если правда закончил")
                : step.counter === 'tawaf' ? _t("Круг {0}: нажми, когда снова дойдёшь до Чёрного камня", n + 1) : _t("Проход {0}: {1}", n + 1, saeeDir(n + 1))}</span>
            </div>
            {n < 7 && <button type="button" className={`pri-btn scene-tap${sure ? ' sure' : ''}`} onClick={tap}>{sure ? _t("Да, пройден") : step.counter === 'tawaf' ? _t("Круг пройден") : _t("Проход пройден")}</button>}
            <div className="row2 light">
              <button type="button" onClick={() => setN(n - 1)} disabled={n === 0}>{_t("− Ошибся")}</button>
              <button type="button" onClick={() => setN(0)} disabled={n === 0}>{_t("Сбросить")}</button>
            </div>
            <p className="q-msg tiny-note">{_tj("Если сомневаешься в числе кругов, бери меньшее и доделай.{0}", awake ? _t(" Экран не погаснет, пока считаешь.") : '')}</p>
          </div>
        )}

        {step.counter && n < 7 && (
          <div className="h-card lap-now">
            <small className="um-k">{step.counter === 'tawaf' ? _t("Круг {0}", n + 1) : _t("Проход {0} · {1}", n + 1, saeeDir(n + 1))}</small>
            {step.counter === 'saee' && <p className="lap-hint">{_tj("{0}: повернись к Каабе, подними руки, повтори зикр трижды и делай дуа между повторениями.{1}", n % 2 === 0 ? _t("На Сафе") : _t("На Марве"), n === 0 ? _t(" В самом начале скажи «Инна-с-Сафа ва-ль-Марвата…».") : '')}</p>}
            {idea && (
              <>
                <b className="lap-theme">{_tj("О чём можно попросить: {0}", idea.theme.toLowerCase())}</b>
                <p className="ar-dua" lang="ar" dir="rtl">{idea.ar}</p>
                <p className="dua-tr">{idea.tr}</p>
                <p className="dua-ru">{idea.ru}</p>
                <small className="src">{idea.src}</small>
              </>
            )}
            {mine.length > 0 && (
              <div className="lap-mine">
                <b>{_tj("Из твоего списка на этот {0}", step.counter === 'tawaf' ? _t("круг") : _t("проход"))}</b>
                {mine.map((d) => (
                  <label key={d.key} className="chk">
                    <input type="checkbox" checked={d.done} onChange={() => toggle(d.key)} />
                    <span><b style={d.done ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{d.text}</b>{d.who && <small>{d.who}</small>}</span>
                  </label>
                ))}
              </div>
            )}
            {items.length === 0 && <p className="tiny">{_t("Запиши свои дуа и просьбы близких во вкладке «Дуа», и они разложатся по кругам, чтобы никого не забыть.")}</p>}
            {step.counter === 'tawaf' && <p className="lap-hint">{_t("Между Йеменским углом и Чёрным камнем: «Раббана атина фи-д-дунья хасанатан…» (дуа ниже).")}</p>}
            {idea && <p className="tiny">{_t("В сунне нет особого дуа для каждого круга. Это подсказка, если растерялся: проси своими словами и на своём языке.")}</p>}
          </div>
        )}
        {step.counter && n === 7 && items.length > 0 && (
          <div className="h-card lap-now"><b>{_tj("Ты сделал {0} из {1} дуа из списка", madeAll, items.length)}</b>{madeAll < items.length && <p className="tiny">{_t("Остальные можно сделать на Сафе и Марве, у Замзама или в любой момент в Хараме.")}</p>}</div>
        )}

        {step.counter && <StepVideo stepId={step.id} lang={u.vlang ?? 'ru'} />}
        <div className="md">{step.body.map((b) => <p key={b}>{b}</p>)}</div>
        {step.dua?.map((d) => (
          <div key={d.ar} className="h-card dua">
            <p className="ar-dua" lang="ar" dir="rtl">{d.ar}</p>
            <p className="dua-tr">{d.tr}</p>
            <p className="dua-ru">{d.ru}</p>
            <small className="src">{d.src}</small>
          </div>
        ))}
        {idx < STEPS.length - 1 ? (
          <button type="button" className="pri-btn" onClick={onNext}>{_tj("Дальше: {0}", STEPS[idx + 1].title)}</button>
        ) : (
          <button type="button" className="pri-btn" onClick={() => { update((s) => patch(s, { tawaf: 0, saee: 0, ihram: undefined })); onBack(); }}>{_t("Умра завершена, выйти из ихрама")}</button>
        )}
      </div>
    </div>
  );
}

/** The lesson for this rite, if there is one in the chosen language. */
function StepVideo({ stepId, lang }: { stepId: string; lang: 'ru' | 'en' }) {
  const c = UMRAH_VIDEOS.find((x) => x.lang === lang);
  const l = c?.lessons.find((x) => x.step === stepId);
  if (!c || !l) return null;
  return (
    <div className="um-stepvid">
      <div className="um-player"><iframe src={embed(l.id, false)} title={l.t} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></div>
      <small>▶ {l.t} · {c.by}</small>
    </div>
  );
}
