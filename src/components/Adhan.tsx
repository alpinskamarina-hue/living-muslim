// Adhan: settings (reciter, Fajr, each prayer, volume), the player at prayer time, and repeating after the muezzin.
import { useEffect, useRef, useState } from 'react';
import type { AdhanMode, AdhanPrefs, Anchor, AppState } from '../types';
import { ANCHORS, ANCHOR_LABEL } from '../types';
import type { DayTimes } from '../prayer';
import { hhmm } from '../dates';
import {
  AFTER_ADHAN, OWN, OWN_FAJR, RECITERS, SOON, adhanOf, dropOwn, isPlaying, lineAt, linesFor, markPlayed, modeOf, onAdhanChange,
  ownName, playAdhan, playChime, progress, reciterFor, reciterName, saveOwn, setVolume, stopAdhan, unlockAdhan, wasPlayed,
} from '../adhan';
import { _t, _tj } from '../i18n';

type Settings = AppState['settings'];
type SetFn = (patch: Partial<Settings>) => void;

function usePlaying() {
  const [, tick] = useState(0);
  useEffect(() => onAdhanChange(() => tick((n) => n + 1)), []);
  return isPlaying();
}

const MODES: { id: AdhanMode; ru: string }[] = [
  { id: 'full', ru: _t("Азан") },
  { id: 'short', ru: _t("Звук") },
  { id: 'off', ru: _t("Тихо") },
];

export function AdhanSettings({ s, set, times, onTry }: { s: Settings; set: SetFn; times: DayTimes; onTry: (a: Anchor) => void }) {
  const p = adhanOf(s);
  const setP = (patch: Partial<AdhanPrefs>) => set({ adhan: { ...p, ...patch } });
  const playingNow = usePlaying();
  const [preview, setPreview] = useState('');
  const [msg, setMsg] = useState('');
  const [, bump] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const fileFor = useRef<string>(OWN);
  useEffect(() => () => stopAdhan(), []);
  useEffect(() => { if (!playingNow) setPreview(''); }, [playingNow]);

  const listen = async (id: string) => {
    if (preview === id) { stopAdhan(); setPreview(''); return; }
    setMsg('');
    setPreview(id);
    const r = await playAdhan(id, p.vol);
    if (r !== 'ok') { setPreview(''); setMsg(r === 'error' ? (id === OWN || id === OWN_FAJR ? _t("Сначала выбери файл с азаном.") : _t("Запись не загрузилась. Проверь интернет.")) : _t("Нажми ещё раз, чтобы послушать.")); }
  };
  const pick = (id: string) => { fileFor.current = id; file.current?.click(); };
  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      await saveOwn(fileFor.current, f);
      if (fileFor.current === OWN_FAJR) setP({ fajr: OWN_FAJR }); else setP({ reciter: OWN });
      setMsg(_t("Файл сохранён на этом телефоне."));
      bump((n) => n + 1);
    } catch (e) { setMsg((e as Error).message === 'size' ? _t("Файл больше 20 МБ. Возьми запись покороче.") : _t("Это не аудиофайл. Подойдёт mp3, m4a, wav или ogg.")); }
  };
  const forget = async (id: string) => {
    await dropOwn(id);
    if (id === OWN_FAJR && p.fajr === OWN_FAJR) setP({ fajr: '' });
    if (id === OWN && p.reciter === OWN) setP({ reciter: RECITERS[0].id });
    bump((n) => n + 1);
  };

  const ReciterRow = ({ id, title, sub, credit, page, selected, onSelect }: { id: string; title: string; sub: string; credit?: string; page?: string; selected: boolean; onSelect: () => void }) => (
    <div className={`adh-rec${selected ? ' on' : ''}`}>
      <button type="button" className="adh-pick" aria-pressed={selected} onClick={onSelect}>
        <span className="adh-dot" aria-hidden="true" />
        <span><b>{title}</b><small>{sub}</small>{credit && <small className="adh-credit">{page ? <a href={page} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{credit}</a> : credit}</small>}</span>
      </button>
      <button type="button" className="adh-play" onClick={() => listen(id)} aria-label={preview === id ? _t("Остановить") : _t("Послушать")}>{preview === id ? '■' : '▶'}</button>
    </div>
  );

  const own = ownName(OWN);
  const ownF = ownName(OWN_FAJR);

  return (
    <>
      <label className="adh-main">
        <span><b>{_t("Азан в начале намаза")}</b><small>{_t("Звучит, когда приложение открыто на телефоне или компьютере")}</small></span>
        <span className="switch"><input type="checkbox" checked={p.on} onChange={(e) => { unlockAdhan(); setP({ on: e.target.checked }); }} /><span /></span>
      </label>

      <h2 className="sub-h">{_t("Чтец")}</h2>
      {RECITERS.map((r) => (
        <ReciterRow key={r.id} id={r.id} title={r.name} sub={_tj("{0} · {1} мин", r.place, Math.round(r.secs / 60))} credit={r.credit} page={r.page} selected={p.reciter === r.id} onSelect={() => setP({ reciter: r.id })} />
      ))}
      {own ? (
        <ReciterRow id={OWN} title={_t("Свой азан")} sub={own} selected={p.reciter === OWN} onSelect={() => setP({ reciter: OWN })} />
      ) : null}
      <div className="adh-own">
        <button type="button" className="ghost-btn" onClick={() => pick(OWN)}>{own ? _t("Заменить свой файл") : _t("＋ Свой азан из файла")}</button>
        {own && <button type="button" className="link-btn" onClick={() => forget(OWN)}>{_t("Убрать свой файл")}</button>}
        <p className="tiny">{_t("Любимый чтец, муэдзин твоей мечети или запись друга. Файл хранится только на этом телефоне и никуда не отправляется.")}</p>
      </div>
      <div className="adh-soon">
        <small>{_t("Скоро")}</small>
        {SOON.map((n) => <span key={n}>{n}</span>)}
      </div>

      <h2 className="sub-h">{_t("Азан фаджра")}</h2>
      <p className="tiny">{_t("В утреннем азане есть слова «Ас-саляту хайрун мина-н-наум», молитва лучше сна. Записи с ними у нас пока нет, поэтому можно поставить свой файл. В тексте ниже эти слова видны всегда.")}</p>
      <label className="field">
        <span>{_t("Что звучит на фаджр")}</span>
        <select value={p.fajr} onChange={(e) => { if (e.target.value === 'new') { pick(OWN_FAJR); return; } setP({ fajr: e.target.value }); }}>
          <option value="">{_tj("Как у остальных ({0})", reciterName(p.reciter))}</option>
          {RECITERS.filter((r) => r.id !== p.reciter).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          {ownF && <option value={OWN_FAJR}>{_tj("Свой азан фаджра: {0}", ownF)}</option>}
          <option value="new">{ownF ? _t("Заменить свой файл фаджра…") : _t("Свой файл для фаджра…")}</option>
        </select>
      </label>
      {ownF && (
        <div className="adh-own">
          <button type="button" className="ghost-btn" onClick={() => listen(OWN_FAJR)}>{preview === OWN_FAJR ? _t("■ Остановить") : _t("▶ Послушать азан фаджра")}</button>
          <button type="button" className="link-btn" onClick={() => forget(OWN_FAJR)}>{_t("Убрать файл фаджра")}</button>
        </div>
      )}

      <h2 className="sub-h">{_t("Для каждого намаза")}</h2>
      <div className="adh-modes">
        {ANCHORS.map((a) => (
          <div key={a} className="adh-mode">
            <span><b>{ANCHOR_LABEL[a].ru}</b><small>{hhmm(times[a])}</small></span>
            <div className="adh-seg" role="group" aria-label={ANCHOR_LABEL[a].ru}>
              {MODES.map((m) => (
                <button key={m.id} type="button" aria-pressed={modeOf(p, a) === m.id} onClick={() => { unlockAdhan(); setP({ mode: { ...p.mode, [a]: m.id } }); if (m.id === 'short') playChime(p.vol); }}>{m.ru}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="tiny">{_t("Азан: полный азан. Звук: короткий мягкий сигнал. Тихо: ничего не звучит.")}</p>

      <label className="field">
        <span>{_tj("Громкость азана: {0}%", Math.round(p.vol * 100))}</span>
        <input type="range" min={0.1} max={1} step={0.05} value={p.vol} onChange={(e) => { const v = Number(e.target.value); setVolume(v); setP({ vol: v }); }} />
      </label>
      <p className="tiny">{_t("На iPhone громкость меняется только кнопками телефона.")}</p>

      <button type="button" className="pri-btn big-btn" onClick={() => { unlockAdhan(); onTry(nearestAnchor(times)); }}>{_t("Проверить, как прозвучит в намаз")}</button>
      {msg && <p className="tiny">{msg}</p>}

      <h2 className="sub-h">{_t("Когда телефон заблокирован")}</h2>
      <p className="tiny">{_t("Сайт не может сам включить азан на заблокированном телефоне: так устроены телефоны. Включи напоминания (Профиль → Напоминания). В момент намаза придёт уведомление с именем чтеца, нажми на него, и азан зазвучит. Полный азан на заблокированном экране умеют только приложения из App Store и Google Play.")}</p>

      <input ref={file} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );
}

function nearestAnchor(times: DayTimes): Anchor {
  const now = Date.now();
  let best: Anchor = 'fajr';
  let d = Infinity;
  for (const a of ANCHORS) { const x = Math.abs(times[a].getTime() - now); if (x < d) { d = x; best = a; } }
  return best;
}

export const ADHAN_TRY = 'lm-adhan-try';
export const tryAdhan = (a: Anchor) => window.dispatchEvent(new CustomEvent(ADHAN_TRY, { detail: a }));

export interface AdhanOpen { a: Anchor; at: number; n: number; /** Prayer time shown on screen. */ time: number }

/** Full-screen adhan: big stop button, volume, the words with replies, and the dua after it. */
export function AdhanPlayer({ open, s, set, onClose }: { open: AdhanOpen; s: Settings; set: SetFn; onClose: () => void }) {
  const p = adhanOf(s);
  const { a } = open;
  const id = reciterFor(p, a);
  const playingNow = usePlaying();
  const [state, setState] = useState<'wait' | 'play' | 'blocked' | 'error' | 'done'>(open.at > Date.now() + 1000 ? 'wait' : 'play');
  const [share, setShare] = useState(0);
  const lines = linesFor(a);
  const started = useRef(false);

  const start = async () => {
    started.current = true;
    const r = await playAdhan(id, p.vol);
    setState(r === 'ok' ? 'play' : r);
  };
  useEffect(() => {
    if (state === 'play' && !started.current) start();
    if (state !== 'wait') return;
    const t = setTimeout(() => { setState('play'); start(); }, Math.max(0, open.at - Date.now()));
    return () => clearTimeout(t);
  }, [open.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (started.current && !playingNow && state === 'play') setState('done'); }, [playingNow, state]);
  useEffect(() => {
    if (!playingNow) return;
    const t = setInterval(() => setShare(progress()), 500);
    return () => clearInterval(t);
  }, [playingNow]);
  useEffect(() => () => stopAdhan(), []);

  const cur = state === 'play' && playingNow ? lineAt(lines, share) : state === 'done' ? lines.length : -1;
  const close = () => { stopAdhan(); onClose(); };

  return (
    <div className="sess adh-sess" role="dialog" aria-label={_t("Азан")}>
      <div className="sess-top">
        <button type="button" className="icon-btn light" onClick={close} aria-label={_t("Закрыть")}>✕</button>
        <div><b>{_tj("Азан · {0}", ANCHOR_LABEL[a].ru)}</b><small>{reciterName(id)}</small></div>
      </div>
      <div className="adh-head">
        <span className="adh-ar">{ANCHOR_LABEL[a].ar}</span>
        <small>{state === 'wait' ? _tj("Азан прозвучит в {0}. Держи приложение открытым.", hhmm(new Date(open.at))) : _tj("Время намаза {0}", hhmm(new Date(open.time)))}</small>
      </div>

      {playingNow ? (
        <button type="button" className="adh-big stop" onClick={() => { stopAdhan(); setState('done'); }}>{_t("Остановить")}</button>
      ) : state === 'wait' ? (
        <button type="button" className="adh-big" onClick={() => { setState('play'); start(); }}>{_t("Включить сейчас")}</button>
      ) : (
        <button type="button" className="adh-big" onClick={start}>{state === 'done' ? _t("Послушать ещё раз") : _t("Включить азан")}</button>
      )}
      {state === 'error' && <p className="adh-err">{id === OWN || id === OWN_FAJR ? _t("Свой файл не найден на этом телефоне. Выбери его снова в настройках азана.") : _t("Запись не загрузилась. Проверь интернет и нажми ещё раз.")}</p>}
      {state === 'blocked' && <p className="adh-err">{_t("Телефон ждёт касания: нажми «Включить азан».")}</p>}

      <label className="adh-vol">
        <span aria-hidden="true">🔈</span>
        <input type="range" min={0.1} max={1} step={0.05} value={p.vol} aria-label={_t("Громкость")} onChange={(e) => { const v = Number(e.target.value); setVolume(v); set({ adhan: { ...p, vol: v } }); }} />
        <span aria-hidden="true">🔊</span>
      </label>

      <div className="adh-words">
        <h3>{_t("Повторяй за муэдзином")}</h3>
        <p className="adh-hint">{_t("Подсветка идёт примерно, по времени записи.")}</p>
        {lines.map((l, i) => (
          <div key={i} className={`adh-line${i === cur ? ' now' : ''}${i < cur ? ' past' : ''}`}>
            <p className="adh-ar">{l.ar}{l.times > 1 && <i> ×{l.times}</i>}</p>
            <p className="adh-tr">{l.tr}</p>
            <p className="adh-mean">{l.mean}</p>
            <p className="adh-reply"><b>{_t("Ты:")}</b> {l.reply}</p>
          </div>
        ))}
        <h3>{_t("После азана")}</h3>
        {AFTER_ADHAN.map((d, i) => (
          <div key={i} className={`adh-line dua${state === 'done' && i > 0 ? ' now' : ''}`}>
            <small>{d.when}</small>
            <p className="adh-ar">{d.ar}</p>
            <p className="adh-tr">{d.tr}</p>
            <p className="adh-mean">{d.mean}</p>
            <small className="adh-src">{d.src}</small>
          </div>
        ))}
        <p className="adh-hint">{RECITERS.find((r) => r.id === id)?.credit ?? ''}</p>
      </div>
    </div>
  );
}

/** A small bar for «короткий звук». */
export function AdhanToast({ a, onClose }: { a: Anchor; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 12000); return () => clearTimeout(t); }, [a]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button type="button" className="adh-toast" onClick={onClose}>
      <span className="adh-ar">{ANCHOR_LABEL[a].ar}</span>{_tj("Время намаза {0}", ANCHOR_LABEL[a].ru)}
    </button>
  );
}

/** Watches the clock: at the start of each prayer opens the adhan or plays the short sound, once per prayer. */
export function useAdhanClock(s: Settings, times: DayTimes, today: string, now: Date) {
  const [open, setOpen] = useState<AdhanOpen | null>(null);
  const [toast, setToast] = useState<Anchor | null>(null);
  const p = adhanOf(s);
  const show = (a: Anchor, at: number) => setOpen((o) => ({ a, at, time: times[a].getTime(), n: (o?.n ?? 0) + 1 }));

  const check = () => {
    if (!p.on) return;
    const t = Date.now();
    for (const a of ANCHORS) {
      const at = times[a].getTime();
      const key = `${today}:${a}`;
      if (t >= at && t - at < 90000 && !wasPlayed(key)) {
        markPlayed(key);
        const m = modeOf(p, a);
        if (m === 'full') show(a, at);
        else if (m === 'short') { playChime(p.vol); setToast(a); }
      }
    }
  };
  useEffect(check, [now, p.on]); // eslint-disable-line react-hooks/exhaustive-deps
  // Exactly on time, not at the next half-minute tick.
  useEffect(() => {
    if (!p.on) return;
    const t = Date.now();
    const next = ANCHORS.map((a) => times[a].getTime()).filter((x) => x > t).sort((x, y) => x - y)[0];
    if (!next || next - t > 6 * 3600000) return;
    const h = setTimeout(check, next - t + 200);
    return () => clearTimeout(h);
  }, [times, p.on, now]); // eslint-disable-line react-hooks/exhaustive-deps
  // The first tap anywhere lets the adhan start by itself later.
  useEffect(() => {
    if (!p.on) return;
    const f = () => unlockAdhan();
    window.addEventListener('pointerdown', f, { once: true, capture: true });
    return () => window.removeEventListener('pointerdown', f, { capture: true });
  }, [p.on]);
  // «Проверить» in the settings.
  useEffect(() => {
    const f = (e: Event) => show((e as CustomEvent).detail as Anchor, Date.now());
    window.addEventListener(ADHAN_TRY, f);
    return () => window.removeEventListener(ADHAN_TRY, f);
  }, [times]); // eslint-disable-line react-hooks/exhaustive-deps
  // The prayer notification was tapped: /app/?adhan=maghrib.
  useEffect(() => {
    const go = (raw: string | null) => {
      const a = raw as Anchor;
      if (!a || !ANCHORS.includes(a)) return;
      const at = times[a].getTime();
      if (Date.now() - at > 30 * 60000) return;
      markPlayed(`${today}:${a}`);
      show(a, at);
    };
    try {
      const u = new URL(location.href);
      const q = u.searchParams.get('adhan');
      if (q) { u.searchParams.delete('adhan'); history.replaceState(null, '', u.toString()); go(q); }
    } catch { /* */ }
    const onMsg = (e: MessageEvent) => { try { if (e.data?.type === 'open') go(new URL(e.data.url, location.origin).searchParams.get('adhan')); } catch { /* */ } };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  return { open, toast, show, close: () => setOpen(null), closeToast: () => setToast(null) };
}
