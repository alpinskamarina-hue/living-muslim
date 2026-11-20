import { useEffect, useRef, useState } from 'react';
import type { Anchor, AppState, Habit } from '../types';
import { _t, LANG } from '../i18n';
import { uid } from '../store';
import { ANCHOR_LABEL } from '../types';
import { sttAvailable } from '../speech';
import {
  ayahFor, hear, keepAwake, kh, rate, SPEECH, summarise, translate,
  type HearStatus, type Hearing, type KFrom, type KLine, type KTerm, type KTo, type KhutbaRec, type Summary,
} from '../khutba';

type Update = (fn: (s: AppState) => AppState) => void;

const FROM: { id: KFrom; label: string; code: string }[] = [
  { id: 'ar', label: _t("Арабский"), code: 'AR' },
  { id: 'tr', label: _t("Турецкий"), code: 'TR' },
  { id: 'en', label: _t("Английский"), code: 'EN' },
];
const TO: { id: KTo; label: string; code: string }[] = [
  { id: 'ru', label: 'Русский', code: 'RU' },
  { id: 'en', label: 'English', code: 'EN' },
  { id: 'tr', label: 'Türkçe', code: 'TR' },
];
const QURAN_SRC: Record<KTo, string> = { ru: _t("перевод смыслов Э. Кулиева"), en: 'Saheeh International', tr: _t("перевод на турецкий") };
const code = (f: KFrom) => FROM.find((x) => x.id === f)!.code;
const codeTo = (t: KTo) => TO.find((x) => x.id === t)!.code;
const isAnchor = (v: unknown): v is Anchor => ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].includes(v as string);

/** The Friday card on Today: an arch with the brass button. */
export function KhutbaCard({ onOpen, onHide }: { onOpen: () => void; onHide: () => void }) {
  return (
    <div className="kh-card">
      <button type="button" className="kh-card-x" aria-label={_t("Скрыть до следующей пятницы")} onClick={onHide}>✕</button>
      <div className="kh-k">{_t("Джума сегодня")}</div>
      <b>{_t("Не понимаете хутбу на арабском?")}</b>
      <p>{_t("Телефон послушает имама и покажет перевод текстом на экране")}</p>
      <button type="button" className="kh-go gold" onClick={onOpen}>{_t("Перевод хутбы")}</button>
    </div>
  );
}

export function Khutba({ state, update, today, onClose }: { state: AppState; update: Update; today: string; onClose: () => void }) {
  const k = kh(state);
  const [stage, setStage] = useState<'setup' | 'live' | 'end' | 'saved'>('setup');
  const [from, setFrom] = useState<KFrom>(k.from ?? 'ar');
  const [to, setTo] = useState<KTo>(k.to ?? (LANG === 'en' ? 'en' : 'ru'));
  const [result, setResult] = useState<{ lines: KLine[]; mins: number } | null>(null);
  const [open, setOpen] = useState<KhutbaRec | null>(null);

  const start = () => {
    update((s) => ({ ...s, khutba: { ...kh(s), from, to } }));
    setStage('live');
  };

  if (stage === 'live') {
    return <Live state={state} update={update} from={from} to={to} setFrom={setFrom}
      onEnd={(lines, mins) => { setResult({ lines, mins }); setStage('end'); }} onClose={onClose} />;
  }
  if (stage === 'end' && result) {
    return <End state={state} update={update} today={today} from={from} to={to} lines={result.lines} mins={result.mins} onClose={onClose} />;
  }
  if (stage === 'saved' && open) return <Saved rec={open} onBack={() => { setOpen(null); setStage('setup'); }} />;

  return (
    <div className="sess light-sess kh-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        <div><b>{_t("Перевод хутбы")}</b><small>{_t("Хутба, уроки и лекции")}</small></div>
      </div>
      <div className="kh-setup">
        <div className="kh-mih">
          <div className="kh-ar" lang="ar">خطبة الجمعة</div>
          <h2>{_t("Перевод хутбы")}</h2>
          <p>{_t("Телефон слушает имама и показывает перевод текстом. Звук не сохраняется.")}</p>
        </div>
        {!sttAvailable() && <p className="kh-warn">{_t("Этот браузер не умеет распознавать речь. Откройте приложение в Chrome или Safari.")}</p>}
        <div className="kh-lab">{_t("Язык хутбы")}</div>
        <div className="kh-chips">
          {FROM.map((f) => <button key={f.id} type="button" aria-pressed={from === f.id} onClick={() => setFrom(f.id)}>{f.label}</button>)}
        </div>
        <div className="kh-lab">{_t("Перевести на")}</div>
        <div className="kh-chips">
          {TO.filter((t) => t.id !== from).map((t) => <button key={t.id} type="button" aria-pressed={to === t.id} onClick={() => setTo(t.id)}>{t.label}</button>)}
        </div>
        <div className="kh-lab">{_t("Перед началом")}</div>
        <Tips />
        {(k.saved?.length ?? 0) > 0 && (
          <>
            <div className="kh-lab">{_t("Мои хутбы")}</div>
            <div className="kh-tips">
              {k.saved!.slice(0, 6).map((r) => (
                <button key={r.id} type="button" className="kh-rec" onClick={() => { setOpen(r); setStage('saved'); }}>
                  <span><b>{r.points[0] || r.lines[0] || _t("Хутба")}</b><small>{dayLabel(r.day)} · {_t("{0} мин", r.mins)} · {code(r.from)} → {codeTo(r.to)}</small></span><i aria-hidden="true">›</i>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="kh-foot">
        <button type="button" className="kh-start" disabled={!sttAvailable() || from === to} onClick={start}>{_t("Начать слушать")}</button>
        <small>{_t("Браузер спросит доступ к микрофону. Нужен интернет и вход в аккаунт.")}</small>
      </div>
    </div>
  );
}

const dayLabel = (d: string) => new Date(d + 'T12:00').toLocaleDateString(LANG === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short' });

function Tips() {
  const [ticks, setTicks] = useState<string[]>(['awake']);
  const [how, setHow] = useState(false);
  const t = (id: string) => setTicks((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const rows: [string, string, string][] = [
    ['awake', _t("Экран не погаснет"), _t("иначе телефон перестанет слушать")],
    ['dnd', _t("Включите «Не беспокоить»"), _t("нажмите, чтобы узнать как")],
    ['near', _t("Сядьте ближе к минбару или колонке"), _t("чем ближе, тем точнее перевод")],
  ];
  return (
    <div className="kh-tips">
      {rows.map(([id, b, s]) => (
        <div key={id} className="kh-tip">
          <button type="button" className={`kh-ck${ticks.includes(id) ? ' y' : ''}`} aria-pressed={ticks.includes(id)} aria-label={b} onClick={() => t(id)}>{ticks.includes(id) ? '✓' : ''}</button>
          <span onClick={id === 'dnd' ? () => setHow((v) => !v) : undefined} role={id === 'dnd' ? 'button' : undefined}>
            {b}<small>{s}</small>
            {id === 'dnd' && how && (
              <em>{ios
                ? _t("iPhone: проведите вниз от правого верхнего угла → «Фокусирование» → «Не беспокоить». Можно настроить, чтобы он включался сам по пятницам: Настройки → Фокусирование → Не беспокоить → Добавить расписание.")
                : _t("Android: проведите вниз от верха экрана → значок «Не беспокоить» (полумесяц или перечёркнутый колокольчик). Можно выбрать «До выключения» или «1 час».")}</em>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function TermText({ line, onTerm }: { line: KLine; onTerm: (t: KTerm) => void }) {
  if (!line.terms.length) return <>{line.text}</>;
  const out: (string | JSX.Element)[] = [];
  let rest = line.text;
  line.terms.forEach((t, i) => {
    const at = rest.indexOf(t.w);
    if (at < 0) return;
    out.push(rest.slice(0, at));
    out.push(<button key={i} type="button" className="kh-term" onClick={() => onTerm(t)}>{t.w}</button>);
    rest = rest.slice(at + t.w.length);
  });
  out.push(rest);
  return <>{out}</>;
}

function Live({ state, update, from, to, setFrom, onEnd, onClose }: {
  state: AppState; update: Update; from: KFrom; to: KTo; setFrom: (f: KFrom) => void;
  onEnd: (lines: KLine[], mins: number) => void; onClose: () => void;
}) {
  const k = kh(state);
  const [lines, setLines] = useState<KLine[]>([]);
  const [interim, setInterim] = useState('');
  const [status, setStatus] = useState<HearStatus>('on');
  const [paused, setPaused] = useState(false);
  const [lang, setLang] = useState<KFrom>(from);
  const [other, setOther] = useState(0);
  const [err, setErr] = useState<'' | 'signin' | 'net' | 'busy'>('');
  const [term, setTerm] = useState<KTerm | null>(null);
  const [size, setSize] = useState<0 | 1 | 2>(k.size ?? 1);
  const [showSrc, setShowSrc] = useState(k.src !== false);
  const [heardAt, setHeardAt] = useState(0);
  const [, setNow] = useState(0);
  const began = useRef(Date.now());
  const buf = useRef(''), lastFinal = useRef(0), busy = useRef(false), sent = useRef(''), nid = useRef(1);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const h = useRef<Hearing | null>(null);
  const shown = useRef(new Set<string>());
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => keepAwake(), []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  // Listening: (re)started when the language changes or after a pause.
  useEffect(() => {
    if (paused) return;
    h.current = hear(SPEECH[lang], setInterim, (t) => { buf.current = (buf.current + ' ' + t).trim(); lastFinal.current = Date.now(); setHeardAt(Date.now()); }, setStatus);
    return () => { h.current?.stop(); h.current = null; };
  }, [lang, paused]);

  // Sending: one request at a time; a piece goes when it has about 10 words or the imam paused.
  useEffect(() => {
    const t = setInterval(async () => {
      if (busy.current || !buf.current) return;
      const words = buf.current.split(' ').length;
      if (words < 10 && Date.now() - lastFinal.current < 3500) return;
      const text = buf.current; buf.current = '';
      busy.current = true;
      const f = langRef.current;
      const r = await translate(f, to, text, sent.current.slice(-500));
      busy.current = false;
      sent.current = (sent.current + ' ' + text).slice(-2000);
      if (!r.ok) {
        setErr(r.why);
        if (r.why !== 'signin') buf.current = (text + ' ' + buf.current).trim().slice(-2000);
        return;
      }
      setErr('');
      setOther((n) => (r.other ? n + 1 : 0));
      const add: KLine[] = r.lines.map((l) => ({ id: nid.current++, text: l.text, terms: l.terms }));
      for (const a of r.ayahs) {
        // The same verse heard again a minute later (imams repeat it) is not shown twice in a row.
        if (shown.current.has(`${a.s}:${a.a}`)) continue;
        const ay = await ayahFor(a.s, a.a, to, f, text);
        if (ay) shown.current.add(`${a.s}:${a.a}`);
        if (ay) add.push({ id: nid.current++, text: '', terms: [], ayah: ay });
      }
      if (add.length) setLines((x) => [...x, ...add].slice(-400));
    }, 700);
    return () => clearInterval(t);
  }, [to]);

  useEffect(() => { if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight; }, [lines, interim]);

  const mins = Math.max(0, Math.round((Date.now() - began.current) / 60000));
  const setPref = (p: Partial<typeof k>) => update((s) => ({ ...s, khutba: { ...kh(s), ...p } }));
  const finish = () => { h.current?.stop(); onEnd(lines, Math.max(1, mins)); };
  const quiet = !paused && status === 'quiet';
  const last = lines.length - 1;
  const switchTo = (f: KFrom) => { setLang(f); setFrom(f); setOther(0); setPref({ from: f }); };

  return (
    <div className={`kh-live sz${size}`}>
      <div className="kh-bar">
        <span className={`kh-dot${paused ? ' p' : quiet ? ' q' : ''}`} />
        <span>{paused ? _t("Пауза") : status === 'denied' ? _t("Нет доступа к микрофону") : quiet ? _t("Слышно плохо") : _t("Слушаю · отставание ~3 с")}</span>
        <span className={`kh-lvl${!paused && Date.now() - heardAt < 2500 ? ' on' : ''}`} aria-hidden="true"><i /><i /><i /><i /><i /></span>
        <button type="button" className="kh-x" onClick={() => { h.current?.stop(); onClose(); }} aria-label={_t("Закрыть")}>✕</button>
      </div>
      <div className="kh-title">
        <b>{_t("Хутба · {0} мин", mins)}</b>
        <span>{code(lang)} → {codeTo(to)}</span>
      </div>

      {status === 'denied' && <p className="kh-warn dk">{_t("Разрешите доступ к микрофону в настройках браузера для этого сайта и начните снова.")}</p>}
      {status === 'none' && <p className="kh-warn dk">{_t("Этот браузер не умеет распознавать речь. Откройте приложение в Chrome или Safari.")}</p>}
      {quiet && <p className="kh-warn dk"><b>{_t("Имама почти не слышно")}</b>{_t("Подвиньтесь ближе к колонке или положите телефон экраном вверх. Перевод продолжится сам.")}</p>}
      {err === 'signin' && <p className="kh-warn dk">{_t("Для перевода нужно войти в аккаунт: Профиль → Вход по почте.")}</p>}
      {(err === 'net' || err === 'busy') && <p className="kh-warn dk">{err === 'net' ? _t("Нет интернета. Текст копится и переведётся, когда связь вернётся.") : _t("Перевод на минуту задерживается. Продолжаю слушать.")}</p>}
      {other >= 2 && (
        <div className="kh-warn dk"><b>{_t("Похоже, хутба на другом языке?")}</b>
          <div className="kh-switch">{FROM.filter((f) => f.id !== lang && f.id !== to).map((f) => <button key={f.id} type="button" onClick={() => switchTo(f.id)}>{f.label}</button>)}</div>
        </div>
      )}

      <div className="kh-subs" ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        {!lines.length && !interim && <p className="kh-wait">{paused ? _t("Перевод на паузе") : _t("Жду, когда имам начнёт говорить…")}</p>}
        {lines.map((l, i) => l.ayah ? (
          <div key={l.id} className="kh-ayah">
            <div className="kh-ak">{l.ayah.sure ? _t("Аят узнан · Коран {0}:{1}", l.ayah.s, l.ayah.a) : _t("Аят по смыслу · Коран {0}:{1}", l.ayah.s, l.ayah.a)}</div>
            <div className="kh-aa" lang="ar">{l.ayah.ar}</div>
            <p>{l.ayah.tr}</p>
            <small>{_t("{0}, {1}:{2} · {3}, не машинный перевод", l.ayah.name, l.ayah.s, l.ayah.a, QURAN_SRC[to])}</small>
          </div>
        ) : (
          <p key={l.id} className={i === last ? 'kh-now' : i >= last - 2 ? 'kh-old' : 'kh-old far'}><TermText line={l} onTerm={setTerm} /></p>
        ))}
        {showSrc && interim && <p className={`kh-src${lang === 'ar' ? ' ar' : ''}`} lang={lang}>{interim}</p>}
      </div>

      {term && (
        <div className="kh-pop" role="dialog" onClick={() => setTerm(null)}>
          <div className="kh-ph"><b>{term.w}</b><span lang="ar">{term.src}</span></div>
          <p>{term.note}</p>
        </div>
      )}

      <div className="kh-ctl">
        <div className="kh-row">
          <button type="button" className="kh-rb" aria-label={_t("Размер текста")} onClick={() => { const n = ((size + 1) % 3) as 0 | 1 | 2; setSize(n); setPref({ size: n }); }}>Aa</button>
          <button type="button" className={`kh-rb ar${showSrc ? ' on' : ''}`} aria-pressed={showSrc} aria-label={_t("Показывать оригинал")} onClick={() => { setShowSrc(!showSrc); setPref({ src: !showSrc }); }}>ع</button>
          <button type="button" className="kh-rb big" aria-label={paused ? _t("Продолжить") : _t("Пауза")} onClick={() => setPaused(!paused)}>
            {paused
              ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>}
          </button>
          <button type="button" className="kh-rb" aria-label={_t("К новому")} onClick={() => { stick.current = true; if (box.current) box.current.scrollTop = box.current.scrollHeight; }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
          </button>
          <button type="button" className="kh-rb" aria-label={_t("Завершить")} onClick={finish}><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg></button>
        </div>
        <div className="kh-note">{_t("Машинный перевод, возможны неточности")}</div>
      </div>
    </div>
  );
}

function End({ state, update, today, from, to, lines, mins, onClose }: {
  state: AppState; update: Update; today: string; from: KFrom; to: KTo; lines: KLine[]; mins: number; onClose: () => void;
}) {
  const text = lines.filter((l) => !l.ayah).map((l) => l.text);
  const [sum, setSum] = useState<Summary | null | 'wait'>(text.length >= 3 ? 'wait' : null);
  const [savedId, setSavedId] = useState('');
  const [habitDone, setHabitDone] = useState(false);
  const [rated, setRated] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (text.length < 3) return;
    let live = true;
    summarise(to, text.join('\n').slice(-30000)).then((s) => { if (live) setSum(s); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const points = sum && sum !== 'wait' ? sum.points : [];
  const habit = sum && sum !== 'wait' ? sum.habit : null;

  const save = () => {
    if (savedId) return;
    const rec: KhutbaRec = { id: uid(), day: today, mins, from, to, lines: text.slice(0, 600), points };
    update((s) => ({ ...s, khutba: { ...kh(s), saved: [rec, ...(kh(s).saved ?? [])].slice(0, 20) } }));
    setSavedId(rec.id);
  };
  const addHabit = () => {
    if (!habit || habitDone) return;
    const h: Habit = { id: uid(), action: habit.action, min: habit.minimum || habit.action, anchor: isAnchor(habit.after_prayer) ? habit.after_prayer : 'isha', sphere: 'faith', status: 'active', createdAt: today };
    update((s) => ({ ...s, habits: [...s.habits, h] }));
    setHabitDone(true);
  };
  const share = async () => {
    const body = [_t("Хутба {0}", dayLabel(today)), ...(points.length ? points.map((p, i) => `${i + 1}. ${p}`) : text.slice(0, 12))].join('\n') + '\n\nLiving Muslim · living-muslim.vercel.app';
    try {
      if (navigator.share) { await navigator.share({ text: body }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(body); setCopied(true); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="sess light-sess kh-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        <div><b>{_t("Хутба завершена · {0} мин", mins)}</b><small>{code(from)} → {codeTo(to)}</small></div>
      </div>
      <div className="kh-setup">
        <div className="kh-mih">
          <div className="kh-ar" lang="ar">جزاك الله خيرا</div>
          <h2>{_t("О чём была хутба")}</h2>
          <p>{_t("Коротко, из текста перевода")}</p>
        </div>
        <div className="kh-sum">
          {sum === 'wait' && <p className="kh-muted">{_t("Собираю главное…")}</p>}
          {points.length > 0 && <ol>{points.map((p, i) => <li key={i}>{p}</li>)}</ol>}
          {sum === null && <p className="kh-muted">{text.length ? _t("Текста мало для краткого итога, но его можно сохранить.") : _t("Перевода не получилось: телефон ничего не расслышал.")}</p>}
        </div>
        <div className="kh-acts">
          {habit && <button type="button" className="kh-start" disabled={habitDone} onClick={addHabit}>{habitDone ? _t("✓ Привычка добавлена") : _t("Сделать привычкой «{0}» после {1}", habit.action, ANCHOR_LABEL[isAnchor(habit.after_prayer) ? habit.after_prayer : 'isha'].ru)}</button>}
          {text.length > 0 && <button type="button" className="kh-q" disabled={Boolean(savedId)} onClick={save}>{savedId ? _t("✓ Сохранено в «Мои хутбы»") : _t("Сохранить текст")}</button>}
          {text.length > 0 && <button type="button" className="kh-q" onClick={share}>{copied ? _t("✓ Скопировано") : _t("Поделиться с кругом")}</button>}
        </div>
        <div className="kh-rate">
          <b>{_t("Как был перевод сегодня?")}</b>
          <div>
            {([['good', _t("Хорошо")], ['ok', _t("Терпимо")], ['bad', _t("Плохо")]] as const).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={rated === v} disabled={Boolean(rated)} onClick={() => { setRated(v); rate(v, from, to, mins); }}>{l}</button>
            ))}
          </div>
          {rated && <small>{_t("Спасибо, это поможет сделать перевод лучше")}</small>}
        </div>
        <p className="kh-priv">{_t("Звук не сохранялся. Текст останется, только если вы нажмёте «Сохранить».")}</p>
      </div>
    </div>
  );
}

function Saved({ rec, onBack }: { rec: KhutbaRec; onBack: () => void }) {
  return (
    <div className="sess light-sess kh-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onBack} aria-label={_t("Назад")}>‹</button>
        <div><b>{_t("Хутба {0}", dayLabel(rec.day))}</b><small>{_t("{0} мин", rec.mins)} · {code(rec.from)} → {codeTo(rec.to)}</small></div>
      </div>
      <div className="kh-setup">
        {rec.points.length > 0 && <div className="kh-sum"><ol>{rec.points.map((p, i) => <li key={i}>{p}</li>)}</ol></div>}
        <div className="kh-text">{rec.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      </div>
    </div>
  );
}
