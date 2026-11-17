import { useState } from 'react';
import type { AppState, UmrahState } from '../types';
import { IHRAM_RULES, PREP, STEPS, type Step } from '../umrah/guide';
import { uid } from '../store';

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
        <button type="button" className="icon-btn" onClick={onExit} aria-label="Выйти">✕</button>
        <div><b>Умра</b><small>Гид, подготовка {prepPct(state)}%, мои дуа</small></div>
      </div>
      <div className="seg">
        {([['guide', 'Обряды'], ['prep', 'Подготовка'], ['duas', 'Мои дуа']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="h-wrap">
        {tab === 'guide' && (
          <>
            {STEPS.map((s, i) => (
              <button type="button" key={s.id} className="q-row" onClick={() => setStep(s)}>
                <span className="q-n">{i + 1}</span>
                <span className="q-t"><b>{s.title}</b><small>{s.short}{s.counter ? ' · счётчик' : ''}</small></span>
              </button>
            ))}
            <h2 className="sub-h">Запреты в ихраме</h2>
            <ul className="rules">{IHRAM_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="q-msg left tiny-note">Гид описывает умру по сунне в общих чертах. Детали различаются по мазхабам: уточняй у своего имама или руководителя группы.</p>
          </>
        )}
        {tab === 'prep' && (
          <>
            <div className="stat-card"><div className="big">{prepPct(state)}%</div><div><b>готовности</b><small>видна группе, если едешь с Кругом</small></div></div>
            {PREP.map((p) => {
              const ok = u.prep.includes(p.id);
              return (
                <label key={p.id} className="chk">
                  <input type="checkbox" checked={ok} onChange={() => update((s) => patch(s, { prep: ok ? umrahOf(s).prep.filter((x) => x !== p.id) : [...umrahOf(s).prep, p.id] }))} />
                  <span><b>{p.text}</b><small>за {p.when} до поездки</small></span>
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
      <p className="q-msg left">Запиши, о чём хочешь попросить у Каабы, на Сафе и Марве, когда пьёшь Замзам. И просьбы близких, чтобы ничего не забыть.</p>
      <label className="field"><span>Дуа</span><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: о здоровье мамы" /></label>
      <label className="field"><span>За кого или от кого (необязательно)</span><input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Мама" /></label>
      <button type="button" className="pri-btn" onClick={add} disabled={!text.trim()}>Добавить</button>
      {u.duas.map((d) => (
        <label key={d.id} className="chk">
          <input type="checkbox" checked={Boolean(d.done)} onChange={() => update((s) => patch(s, { duas: umrahOf(s).duas.map((x) => (x.id === d.id ? { ...x, done: !x.done } : x)) }))} />
          <span><b style={d.done ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{d.text}</b>{d.who && <small>{d.who}</small>}</span>
          <button type="button" className="hg-act" onClick={(e) => { e.preventDefault(); update((s) => patch(s, { duas: umrahOf(s).duas.filter((x) => x.id !== d.id) })); }}>Убрать</button>
        </label>
      ))}
    </>
  );
}

export function StepView({ step, state, update, onBack, onNext }: { step: Step; state: AppState; update: Props['update']; onBack: () => void; onNext: () => void }) {
  const u = umrahOf(state);
  const idx = STEPS.findIndex((x) => x.id === step.id);
  const n = step.counter ? u[step.counter] : 0;
  const setN = (v: number) => step.counter && update((s) => patch(s, { [step.counter!]: Math.max(0, Math.min(7, v)) }));
  const tap = () => { if (n < 7) { setN(n + 1); try { navigator.vibrate?.(n + 1 === 7 ? [150, 80, 150] : 60); } catch { /* ignore */ } } };
  const saeeDir = (k: number) => (k % 2 === 1 ? 'Сафа → Марва' : 'Марва → Сафа');

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="К обрядам">‹</button>
        <div><b>{idx + 1}. {step.title}</b><small>{step.short}</small></div>
      </div>
      <div className="h-wrap">
        {step.counter && (
          <div className="lap-wrap">
            <button type="button" className={`lap${n === 7 ? ' done' : ''}`} onClick={tap} aria-label="Отметить круг">
              <span className="lap-n">{n}<small>/7</small></span>
              <span className="lap-t">{n === 7 ? 'Готово, машаАллах' : step.counter === 'tawaf' ? `Нажми, когда закончишь ${n + 1}-й круг` : `Проход ${n + 1}: ${saeeDir(n + 1)}`}</span>
            </button>
            <div className="lap-dots">{Array.from({ length: 7 }, (_, i) => <i key={i} data-on={i < n} />)}</div>
            <div className="row2 light">
              <button type="button" onClick={() => setN(n - 1)} disabled={n === 0}>− Ошибся</button>
              <button type="button" onClick={() => setN(0)} disabled={n === 0}>Сбросить</button>
            </div>
            <p className="q-msg tiny-note">Если сомневаешься в числе кругов, бери меньшее и доделай.</p>
          </div>
        )}
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
          <button type="button" className="pri-btn" onClick={onNext}>Дальше: {STEPS[idx + 1].title}</button>
        ) : (
          <button type="button" className="pri-btn" onClick={() => { update((s) => patch(s, { tawaf: 0, saee: 0 })); onBack(); }}>Умра завершена, сбросить счётчики</button>
        )}
      </div>
    </div>
  );
}
