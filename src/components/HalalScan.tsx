// «Халяль-сканер» (mockup approved 20.11, step 1 without the shared base): point the camera at a barcode in a shop
// and get one of four answers. The word «халяль» is shown only with a certificate in the database or a sign the person
// saw on the pack themselves; otherwise the answer says honestly what was and was not found in the ingredients.
// A product the open database does not know can be checked from a photo of its ingredient list (read by AI).
import { Fragment, useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import { makeDetector, validCode } from '../barcode';
import { readIngredients, shrink, PHOTO_LIMIT } from '../foodphoto';
import {
  addHistory, checkProduct, findProduct, history, letterText, marksOf, mineHalal, optsOf, ruleName, ruleWhy, setMineHalal, setOpts,
  type Check, type Found, type HProduct, type Hist, type Mz, type Opts, type Verdict,
} from '../halal';
import { LANG, _t, _tj } from '../i18n';
import { PIcon } from './PIcon';
import { dropSign, saveShared, sendSign, sharedOf, type Shared } from '../halalCloud';
import { authMe } from '../auth';

type Stage =
  | { s: 'cam' }
  | { s: 'type'; code: string }
  | { s: 'look'; code: string }
  | { s: 'result'; p: HProduct; saved?: number }
  | { s: 'sign'; p: HProduct }
  | { s: 'sending'; p: HProduct }
  | { s: 'none'; code: string }
  | { s: 'net'; code: string }
  | { s: 'reading'; code: string; url: string }
  | { s: 'photoErr'; code: string; why: string; reason?: string }
  | { s: 'rules'; back: Stage }
  | { s: 'hist'; back?: Stage };

const group = (c: string) => (c.length === 13 ? `${c[0]} ${c.slice(1, 7)} ${c.slice(7)}` : c);

/** Short words for the history line under a product. */
export function verdictShort(v: Verdict, found: Found[], mine: boolean): string {
  if (v === 'green') return mine ? _t("знак халяль, отмечено тобой") : _t("есть сертификат");
  if (v === 'red') return found.filter((f) => f.level === 'red').map((f) => ruleName(f.id).toLowerCase()).join(', ');
  if (v === 'yellow') return _tj("{0}, проверь", found.map((f) => ruleName(f.id)).slice(0, 2).join(', '));
  if (v === 'clean') return _t("запрещённого нет");
  return _t("состава нет");
}

export function dayWord(t: number): string {
  const d = new Date(t), now = new Date();
  const k = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (k(d) === k(now)) return _t("сегодня");
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (k(d) === k(y)) return _t("вчера");
  return d.toLocaleDateString(LANG === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
}

/** The ingredient text with each flagged word marked red or yellow. */
const LETTER = /[\p{L}\p{N}]/u;
function highlight(text: string, m: ReturnType<typeof marksOf>, ok: boolean) {
  if (!m) return text;
  const out: JSX.Element[] = [];
  let at = 0, k = 0;
  for (const x of text.matchAll(m.re)) {
    if (!x[0] || x.index === undefined || x.index < at) continue;
    // Mark the whole word («свин» → «свиной», «varken» → «varkensgelatine»).
    let a = x.index, b = x.index + x[0].length;
    while (a > at && LETTER.test(text[a - 1])) a--;
    while (b < text.length && LETTER.test(text[b])) b++;
    // «желатин свиной», «gelatine de porc»: keep the pair together.
    const pair = text.slice(at, a).match(/(желатин|gelatine?)\s+$/i);
    if (pair && pair.index !== undefined && m.level(x[0]) === 'red') a = at + pair.index;
    const pair2 = text.slice(b).match(/^\s+(желатин|gelatine?)/i);
    if (pair2 && m.level(x[0]) === 'red') b += pair2[0].length;
    if (a > at) out.push(<Fragment key={k++}>{text.slice(at, a)}</Fragment>);
    out.push(<mark key={k++} className={ok ? 'ok' : m.level(x[0])}>{text.slice(a, b)}</mark>);
    at = b;
  }
  if (at < text.length) out.push(<Fragment key={k++}>{text.slice(at)}</Fragment>);
  return out;
}

const VIc = ({ v }: { v: Verdict }) => (
  <i className="hv-ic" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      {v === 'green' ? <path d="M20 6 9 17l-5-5" /> : v === 'red' ? <path d="M18 6 6 18M6 6l12 12" /> : v === 'yellow' ? <path d="M12 7v6M12 17h.01" /> : v === 'clean' ? <><circle cx="12" cy="12" r="8" strokeWidth="2" /><path d="m8.5 12 2.5 2.5 4.5-5" strokeWidth="2.2" /></> : <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />}
    </svg>
  </i>
);

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>((r) => window.setTimeout(() => r(null), ms))]);
/** Adds what the shared base knows: approved signs count as a halal label (the owner checked the photos). */
function withShared(p: HProduct, sh: Shared | null): HProduct {
  if (!sh) return p;
  const q: HProduct = { ...p, signs: sh.signs, approved: sh.ok === true ? true : sh.ok === false ? false : undefined };
  if (!q.ing && sh.ingredients) { q.ing = sh.ingredients; q.shared = true; }
  if (sh.ok === true && sh.signs > 0) { q.offLabel = p.label; q.label = true; }
  return q;
}

async function shareText(title: string, text: string) {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) { try { await nav.share({ title, text }); return true; } catch { return false; } }
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function HalalScan({ state, today, onClose, start }: { state: AppState; today: string; onClose: () => void; start?: 'cam' | 'hist' }) {
  const [stage, setStage] = useState<Stage>(start === 'hist' ? { s: 'hist' } : { s: 'cam' });
  const [camErr, setCamErr] = useState<'' | 'denied' | 'none'>('');
  const [torch, setTorch] = useState<boolean | null>(null);
  const [opts, setO] = useState<Opts>(() => optsOf(state.settings.madhab));
  const [, bump] = useState(0);
  const [note, setNote] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const abort = useRef<AbortController | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const photoFor = useRef('');
  const photoKind = useRef<'ing' | 'sign'>('ing');
  const signFor = useRef<HProduct | null>(null);
  const [savedShared, setSavedShared] = useState('');

  const stopCam = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => () => { stopCam(); abort.current?.abort(); }, []);

  const show = (p: HProduct, saved?: number) => {
    const mine = mineHalal(p.code);
    const c = checkProduct(p, opts, mine);
    addHistory({ code: p.code, n: p.n, v: c.verdict, why: verdictShort(c.verdict, c.found, mine && !p.label), t: Date.now(), p });
    setNote('');
    setStage({ s: 'result', p, saved });
  };

  const find = async (code: string) => {
    stopCam();
    if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* */ }
    setStage({ s: 'look', code });
    const ac = new AbortController(); abort.current = ac;
    const timer = window.setTimeout(() => ac.abort(), 12000);
    const [r, sh] = await Promise.all([findProduct(code, ac.signal), withTimeout(sharedOf(code, ac.signal), 5000)]);
    window.clearTimeout(timer);
    if (ac.signal.aborted && !r.ok && abort.current !== ac) return;
    const saved = history().find((h) => h.code === code && h.p);
    if (r.ok) show(withShared(r.p, sh));
    else if (r.why === 'none' && sh && (sh.ingredients || sh.ok)) show(withShared({ code, n: sh.name || _t("Товар без названия"), ing: sh.ingredients || undefined, label: false, shared: Boolean(sh.ingredients), t: Date.now() }, sh));
    else if (r.why === 'net' && saved?.p) show(saved.p, saved.t);
    else if (r.why === 'none' && saved?.p?.photo) show(saved.p, saved.t);
    else if (r.why === 'none') setStage({ s: 'none', code });
    else setStage({ s: 'net', code });
  };

  // The camera, and the reader that looks at it a few times a second (same reader as in «Питание»).
  useEffect(() => {
    if (stage.s !== 'cam') return;
    let live = true, timer = 0;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCamErr('none'); return; }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!live) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        const v = video.current!;
        v.srcObject = s; await v.play().catch(() => undefined);
        const tr = s.getVideoTracks()[0];
        const caps = (tr.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(caps.torch ? false : null);
        const detect = await makeDetector();
        let seen = '';
        const tick = async () => {
          if (!live) return;
          const code = await detect(v).catch(() => null);
          if (!live) return;
          // Two equal reads in a row, so a half-seen code does not slip through.
          if (code && code === seen) { live = false; find(code); return; }
          seen = code ?? '';
          timer = window.setTimeout(tick, 180);
        };
        tick();
      } catch (e) {
        setCamErr((e as Error)?.name === 'NotAllowedError' ? 'denied' : 'none');
      }
    })();
    return () => { live = false; window.clearTimeout(timer); };
  }, [stage.s]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTorch = async () => {
    const tr = stream.current?.getVideoTracks()[0];
    if (!tr || torch === null) return;
    try { await tr.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { setTorch(null); }
  };

  const takePhoto = (code: string) => { photoFor.current = code; photoKind.current = 'ing'; stopCam(); file.current?.click(); };
  const takeSign = (p: HProduct) => { signFor.current = p; photoKind.current = 'sign'; file.current?.click(); };
  const onSignFile = async (f: File) => {
    const p = signFor.current;
    if (!p) return;
    setStage({ s: 'sending', p });
    let data = '';
    try { data = (await shrink(f, 900)).data; } catch { /* sent without a photo */ }
    const r = await sendSign(p.code, p.n, data);
    setMineHalal(p.code, true);
    const np = { ...p, signs: r.ok ? r.signs : p.signs };
    show(np);
    setNote(r.ok ? _tj("Спасибо! Подтверждений: {0}. После проверки знак станет зелёным у всех, а у тебя он зелёный уже сейчас.", r.signs)
      : r.why === 'signin' ? _t("Отмечено на твоём телефоне. Чтобы знак увидели все, войди по почте в Профиле и отметь ещё раз.")
      : r.why === 'nosql' ? _t("Отмечено на твоём телефоне. Общая база ещё не включена.")
      : r.why === 'day' ? _t("Отмечено на твоём телефоне. На сегодня в общую базу уже много отметок, продолжи завтра.")
      : _t("Отмечено на твоём телефоне. В общую базу отправить не получилось, проверь интернет и отметь ещё раз."));
  };
  const onFile = async (f: File | undefined) => {
    if (file.current) file.current.value = '';
    if (!f) return;
    if (photoKind.current === 'sign') { onSignFile(f); return; }
    const code = photoFor.current;
    let img: { data: string; url: string };
    try { img = await shrink(f, 1400); } catch { setStage({ s: 'photoErr', code, why: 'image' }); return; }
    setStage({ s: 'reading', code, url: img.url });
    const ac = new AbortController(); abort.current = ac;
    const r = await readIngredients(img.data, today, ac.signal);
    URL.revokeObjectURL(img.url);
    if (ac.signal.aborted) return;
    if (!r.ok) { setStage({ s: 'photoErr', code, why: r.why, reason: r.why === 'unreadable' ? r.reason : undefined }); return; }
    show({ code, n: r.name || _t("Товар с фото состава"), ing: r.ingredients.slice(0, 2000), label: false, photo: true, t: Date.now() });
    if (r.logo && code) setNote(_t("На фото виден знак халяль. Если он и правда на упаковке, отметь это ниже."));
  };

  const close = () => { stopCam(); abort.current?.abort(); onClose(); };
  const hist = history();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const fileInput = <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />;

  if (stage.s === 'cam') return (
    <div className="bc-cam" role="dialog" aria-modal="true" aria-label={_t("Халяль-сканер")}>
      {fileInput}
      <video ref={video} playsInline muted />
      <div className="bc-frame"><u /></div>
      <div className="bc-hd">
        <button type="button" className="icon-btn" onClick={close} aria-label={_t("Закрыть")}>✕</button>
        {hist.length > 0
          ? <button type="button" className="hs-pill" onClick={() => { stopCam(); setStage({ s: 'hist', back: { s: 'cam' } }); }}>{offline ? _tj("Без интернета: {0} сохранённых", hist.length) : _tj("Проверено: {0}", hist.length)}</button>
          : <b>{_t("Халяль-сканер")}</b>}
        <span className="hs-sp" />
        {torch !== null && <button type="button" className={`icon-btn bc-torch${torch ? ' on' : ''}`} onClick={toggleTorch} aria-label={_t("Фонарик")}>🔦</button>}
      </div>
      <p className="bc-msg">
        {camErr === 'denied' ? <><b>{_t("Нет доступа к камере")}</b><small>{_t("Разреши камеру для этого сайта в настройках браузера или введи цифры под штрихкодом.")}</small></>
          : camErr === 'none' ? <><b>{_t("Камера не открылась")}</b><small>{_t("Можно ввести цифры под штрихкодом.")}</small></>
          : <><b>{_t("Наведи на штрихкод")}</b><small>{_t("поймаю сам и проверю состав")}</small></>}
      </p>
      <div className="bc-bot">
        <button type="button" onClick={() => takePhoto('')}>{_t("Фото состава")}</button>
        <button type="button" onClick={() => { stopCam(); setStage({ s: 'type', code: '' }); }}>{_t("Ввести код")}</button>
      </div>
    </div>
  );

  const head = (title: string, sub: string, back?: () => void) => (
    <div className="sess-top">
      <button type="button" className="icon-btn" onClick={back ?? close} aria-label={back ? _t("Назад") : _t("Закрыть")}>{back ? '‹' : '✕'}</button>
      <div><b>{title}</b><small>{sub}</small></div>
    </div>
  );

  const toRules = () => setStage({ s: 'rules', back: stage });
  let body: JSX.Element | null = null;

  if (stage.s === 'type') {
    const ok = validCode(stage.code);
    body = (<>
      {head(_t("Халяль-сканер"), _t("цифры под штрихкодом"))}
      <div className="fp-body">
        <p className="fp-status"><b>{_t("Цифры под штрихкодом")}</b><small>{_t("обычно 13 цифр, вводи все подряд")}</small></p>
        <input className="bc-digits" inputMode="numeric" autoFocus value={stage.code} maxLength={14} onChange={(e) => setStage({ s: 'type', code: e.target.value.replace(/\D/g, '') })} aria-label={_t("Цифры штрихкода")} />
        {stage.code.length >= 8 && !ok && <p className="fp-note">{_t("Похоже, одна цифра не та. Проверь ещё раз.")}</p>}
        <button type="button" className="pri-btn" disabled={!ok} onClick={() => find(stage.code)}>{_t("Проверить")}</button>
        <button type="button" className="link-btn fp-center" onClick={() => setStage({ s: 'cam' })}>{_t("Снова камера")}</button>
      </div>
    </>);
  } else if (stage.s === 'look') {
    body = (<>
      {head(_t("Халяль-сканер"), group(stage.code))}
      <div className="fp-body">
        <p className="fp-status" style={{ marginTop: 40 }}><b>{_t("Ищу товар…")}</b><small>{_t("в открытой базе продуктов")}</small></p>
        <div className="fp-dots"><i /><i /><i /></div>
        <button type="button" className="link-btn fp-center" onClick={() => { abort.current?.abort(); setStage({ s: 'cam' }); }}>{_t("Отмена")}</button>
      </div>
    </>);
  } else if (stage.s === 'net') {
    body = (<>
      {head(_t("Халяль-сканер"), group(stage.code))}
      <div className="fp-body"><div className="fp-err">
        <div className="fp-big">📶</div><b>{_t("Не получилось связаться")}</b><p>{_t("Проверь интернет и попробуй ещё раз. Товары, которые ты уже проверял, открываются и без интернета.")}</p>
        <button type="button" className="pri-btn" onClick={() => find(stage.code)}>{_t("Попробовать ещё раз")}</button>
        <button type="button" className="link-btn fp-center" onClick={() => setStage({ s: 'cam' })}>{_t("Сканировать другой")}</button>
      </div></div>
    </>);
  } else if (stage.s === 'none') {
    body = (<>
      {head(_t("Товара нет в базе"), group(stage.code))}
      <div className="fp-body">
        <div className="h-card hs-none">
          <span className="hs-cam" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3" /></svg></span>
          <b>{_t("Сфотографируй состав на упаковке")}</b>
          <p>{_t("Прочитаю его и проверю теми же правилами.")}</p>
        </div>
        <p className="fp-note">{_t("Открытая база знает не всё, особенно местные и новые товары.")} {_tj("Фото тратит одно из {0} фото в день, как в Питании.", PHOTO_LIMIT)}</p>
        <span className="hs-grow" />
        <button type="button" className="pri-btn fp-save" onClick={() => takePhoto(stage.code)}>{_t("Сфотографировать состав")}</button>
        <button type="button" className="link-btn fp-center" onClick={() => setStage({ s: 'cam' })}>{_t("Сканировать другой")}</button>
      </div>
    </>);
  } else if (stage.s === 'reading') {
    body = (<>
      {head(_t("Читаю состав"), stage.code ? group(stage.code) : _t("с фото упаковки"))}
      <div className="fp-body">
        <div className="fp-photo sm"><img src={stage.url} alt="" /><div className="fp-scan" /></div>
        <p className="fp-status"><b>{_t("Читаю состав…")}</b><small>{_t("обычно 5–10 секунд")}</small></p>
        <div className="fp-dots"><i /><i /><i /></div>
        <button type="button" className="link-btn fp-center" onClick={() => { abort.current?.abort(); setStage({ s: 'cam' }); }}>{_t("Отмена")}</button>
      </div>
    </>);
  } else if (stage.s === 'photoErr') {
    const w = stage.why;
    body = (<>
      {head(_t("Фото состава"), stage.code ? group(stage.code) : '')}
      <div className="fp-body"><div className="fp-err">
        <div className="fp-big">{w === 'unreadable' ? '🔍' : w === 'limit' ? '⏳' : w === 'signin' ? '🔑' : '📶'}</div>
        <b>{w === 'unreadable' ? _t("Не получилось прочитать состав") : w === 'limit' ? _tj("{0} фото на сегодня уже использованы", PHOTO_LIMIT) : w === 'signin' ? _t("Нужно войти по почте") : w === 'image' ? _t("Не получилось открыть фото") : _t("Не получилось связаться")}</b>
        <p>{w === 'unreadable' ? (stage.reason || _t("Сними список ингредиентов поближе, при хорошем свете.")) : w === 'limit' ? _t("Завтра снова можно. Состав можно посмотреть глазами по списку «Что ищем в составе».") : w === 'signin' ? _t("Чтение фото работает после входа, как и Помощник. Войти можно в Профиле.") : _t("Проверь интернет и попробуй ещё раз. Фото не потратилось.")}</p>
        {(w === 'unreadable' || w === 'net' || w === 'busy' || w === 'image') && <button type="button" className="pri-btn" onClick={() => takePhoto(stage.code)}>{_t("Сфотографировать ещё раз")}</button>}
        {w === 'limit' && <button type="button" className="pri-btn" onClick={toRules}>{_t("Что ищем в составе")}</button>}
        <button type="button" className="link-btn fp-center" onClick={() => setStage({ s: 'cam' })}>{_t("Сканировать другой")}</button>
        {w === 'unreadable' && <p className="fp-note">{_t("Неудачная попытка не тратит фото из дневного лимита.")}</p>}
      </div></div>
    </>);
  } else if (stage.s === 'sign') {
    const p = stage.p;
    const signed = Boolean(authMe());
    body = (<>
      {head(_t("Знак халяль"), p.n, () => setStage({ s: 'result', p }))}
      <div className="fp-body">
        <div className="h-card hs-none">
          <span className="hs-cam" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3" /></svg></span>
          <b>{_t("Сфотографируй знак халяль на упаковке")}</b>
          <p>{_t("Фото увидит только проверяющий. После проверки знак станет зелёным для всех, кто сканирует этот товар.")}</p>
        </div>
        {!signed && <p className="hs-note">{_t("Чтобы помочь другим, нужно войти по почте в Профиле. Без входа отметка останется только на твоём телефоне.")}</p>}
        <span className="hs-grow" />
        {signed && <button type="button" className="pri-btn fp-save" onClick={() => takeSign(p)}>{_t("Сфотографировать знак")}</button>}
        <button type="button" className={signed ? 'ghost-btn' : 'pri-btn fp-save'} onClick={() => {
          setMineHalal(p.code, true); show(p); setNote(_t("Отмечено. На этом телефоне товар теперь зелёный."));
        }}>{_t("Только для меня")}</button>
      </div>
    </>);
  } else if (stage.s === 'sending') {
    body = (<>
      {head(_t("Знак халяль"), stage.p.n)}
      <div className="fp-body">
        <p className="fp-status" style={{ marginTop: 40 }}><b>{_t("Отправляю в общую базу…")}</b><small>{_t("пара секунд")}</small></p>
        <div className="fp-dots"><i /><i /><i /></div>
      </div>
    </>);
  } else if (stage.s === 'result') {
    const { p } = stage;
    const mine = mineHalal(p.code);
    const c: Check = checkProduct(p, opts, mine);
    const v = c.verdict;
    const reds = c.found.filter((f) => f.level === 'red');
    const m = p.ing ? marksOf(c.found, opts) : null;
    // With a certificate or the person's own mark, meat and additives are covered; only alcohol stays worth a line.
    const shown = v === 'green' ? c.found.filter((f) => f.id === 'alcohol') : c.found;
    const people = Boolean(p.approved && !p.offLabel);
    const title = v === 'green' ? (people ? _t("Халяль: знак подтверждён") : p.label ? _t("Халяль: есть сертификат") : _t("Халяль: знак на упаковке"))
      : v === 'red' ? _t("Харам по составу")
      : v === 'yellow' ? _t("Сомнительно, проверь")
      : v === 'clean' ? _t("Запрещённого в составе нет")
      : _t("Состава в базе нет");
    const text = v === 'green' ? (people ? _tj("Знак халяль на упаковке подтвердили по фото: {0}. Отметки проверены.", p.signs || 1)
        : p.label ? _t("В базе товаров отмечено, что на упаковке есть знак халяль.") + (p.approved && p.signs ? ' ' + _tj("Знак подтвердили по фото: {0}.", p.signs) : '')
        : _t("Ты отметил, что на упаковке есть знак халяль. Это видно только на твоём телефоне."))
      : v === 'red' ? _tj("В составе: {0}.", reds.map((f) => ruleName(f.id).toLowerCase()).join(', '))
      : v === 'yellow' ? (c.found.length > 1 ? _t("Есть то, что бывает и растительным, и животным. По составу не понять.") : _t("Есть то, что бывает и дозволенным, и нет. По составу не понять."))
      : v === 'clean' ? _t("Сертификата в базе нет, но и сомнительного в составе мы не нашли.")
      : _t("Сфотографируй список ингредиентов на упаковке, и я проверю его.");
    const share = async () => {
      const ok = await shareText(p.n, `${p.n}: ${title}. ${_t("Проверено халяль-сканером Living Muslim, это подсказка по составу, не фетва.")} https://living-muslim.vercel.app`);
      if (ok && !(navigator as Navigator & { share?: unknown }).share) setNote(_t("Текст скопирован."));
    };
    const letter = async () => {
      const l = letterText(p, c.found);
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (nav.share) { try { await nav.share({ title: l.subject, text: l.body }); return; } catch { return; } }
      window.location.href = `mailto:?subject=${encodeURIComponent(l.subject)}&body=${encodeURIComponent(l.body)}`;
    };
    const mark = (on: boolean) => {
      if (on) { setStage({ s: 'sign', p }); return; }
      dropSign(p.code);
      setMineHalal(p.code, on);
      const c2 = checkProduct(p, opts, on);
      addHistory({ code: p.code, n: p.n, v: c2.verdict, why: verdictShort(c2.verdict, c2.found, on && !p.label), t: Date.now(), p });
      setNote(on ? _t("Отмечено. На этом телефоне товар теперь зелёный.") : '');
      bump((x) => x + 1);
    };
    body = (<>
      {head(_t("Результат"), p.code ? group(p.code) : _t("по фото состава"))}
      <div className={`fp-body hs-res hv-${v}`}>
        <div className="h-card hs-prod">
          {p.img ? <img src={p.img} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="hs-ph" aria-hidden="true"><PIcon k="scan" /></span>}
          <span><b>{p.n}</b><small>{[p.brand, p.photo ? _t("состав с фото") : p.shared ? _t("состав от людей") : ''].filter(Boolean).join(' · ') || (p.code ? group(p.code) : '')}</small></span>
        </div>
        <div className="hv-box" role="status">
          <VIc v={v} />
          <span><b>{title}</b><small>{text}</small></span>
        </div>
        {stage.saved && <p className="fp-note">{_tj("Без интернета: ответ из сохранённых, проверено {0}.", dayWord(stage.saved))}</p>}
        {p.ing && (
          <div className="h-card hs-ing">
            <small className="fd-lbl">{p.photo ? _t("Прочитали с фото") : _t("Состав")}</small>
            <p>{highlight(p.ing, m, v === 'green')}</p>
          </div>
        )}
        {shown.length > 0 && (
          <ul className="hs-why">
            {shown.map((f) => <li key={f.id} className={f.level}><i aria-hidden="true">{f.level === 'red' ? '!' : '?'}</i><span><b>{ruleName(f.id)}:</b> {ruleWhy(f.id)}</span></li>)}
          </ul>
        )}
        {v === 'green' && c.found.length > 0 && !reds.length && <p className="hs-ok">{_t("Запрещённого в составе нет. Мясо и добавки с сертификатом халяль считаются дозволенными.")}</p>}
        {(v === 'clean' || (v === 'green' && !c.found.length && p.ing)) && <p className="hs-ok">{_t("Нет свинины, крови, спирта, мяса без сертификата и добавок двойного происхождения.")}</p>}
        {v === 'clean' && (
          <div className="h-card hs-q"><b>{_t("Почему не «халяль»?")}</b><small>{_t("Мы называем товар халяль только с сертификатом или знаком на упаковке. Здесь нечему быть харамом, но подтверждения нет.")}</small></div>
        )}
        {v !== 'green' && v !== 'red' && (p.signs ?? 0) > 0 && p.approved !== false && <p className="hs-note">{_tj("Знак халяль на этом товаре отметили по фото: {0}. Ждёт проверки.", p.signs)}</p>}
        {p.photo && p.code && p.ing && (
          <div className="h-card hs-help">
            <small className="fd-lbl">{_t("Помоги другим")}</small>
            {savedShared === p.code ? <p>{_t("Сохранено. Теперь этот состав увидят все, кто сканирует товар.")}</p> : <>
              <p>{_t("Сохрани прочитанный состав, и следующему человеку не придётся фотографировать.")}</p>
              <button type="button" className="ghost-btn" onClick={async () => {
                const r = await saveShared(p.code, p.n, p.ing!);
                if (r.ok) setSavedShared(p.code);
                else setNote(r.why === 'signin' ? _t("Сохранять в общую базу можно после входа по почте в Профиле.") : r.why === 'nosql' ? _t("Общая база ещё не включена.") : _t("Не получилось сохранить, проверь интернет."));
              }}>{_t("Сохранить в общую базу")}</button>
            </>}
          </div>
        )}
        {note && <p className="hs-note">{note}</p>}
        <span className="hs-grow" />
        <div className="hs-acts">
          {v === 'unknown' && <button type="button" className="pri-btn" onClick={() => takePhoto(p.code)}>{_t("Сфотографировать состав")}</button>}
          {v === 'yellow' && <button type="button" className="ghost-btn" onClick={letter}>{_t("Написать производителю")}</button>}
          {(v === 'yellow' || v === 'clean' || v === 'unknown') && p.code && <button type="button" className="ghost-btn" onClick={() => mark(true)}>{_t("Вижу знак халяль")}</button>}
          {(v === 'green' || v === 'clean') && <button type="button" className={v === 'green' ? 'pri-btn' : 'ghost-btn'} onClick={share}>{_t("Поделиться")}</button>}
          {v === 'red' && <button type="button" className="pri-btn" onClick={() => setStage({ s: 'cam' })}>{_t("Сканировать другой")}</button>}
        </div>
        {v === 'green' && mine && !p.label && <button type="button" className="link-btn fp-center" onClick={() => mark(false)}>{_t("Убрать мою отметку")}</button>}
        <p className="fp-note">{v === 'yellow' ? _t("Готовое письмо: «Из чего сделаны эти добавки?». Отправь его со своей почты или через сайт производителя.") + ' ' : ''}{_t("Это подсказка по составу, не фетва.")} {p.photo ? '' : p.shared ? _t("Состав добавили люди по фото упаковки.") : _t("Данные из открытой базы Open Food Facts.")}</p>
        <div className="hs-links">
          {v !== 'red' && <button type="button" className="link-btn" onClick={() => setStage({ s: 'cam' })}>{_t("Сканировать другой")}</button>}
          <button type="button" className="link-btn" onClick={toRules}>{_t("Что ищем в составе")}</button>
        </div>
      </div>
    </>);
  } else if (stage.s === 'rules') {
    const back = stage.back;
    const pick = (o: Partial<Opts>) => { const n = { ...opts, ...o }; n.sea = n.mz === 'hanafi'; setO(n); setOpts(n); };
    const MZ: [Mz, string][] = [['hanafi', _t("Ханафитский")], ['shafi', _t("Шафиитский")], ['maliki', _t("Маликитский")], ['hanbali', _t("Ханбалитский")]];
    body = (<>
      {head(_t("Что ищем в составе"), _t("правила проверки"), () => setStage(back))}
      <div className="fp-body hs-rules">
        <p className="fp-note" style={{ textAlign: 'left', marginTop: 0 }}>{_t("Список до запуска проверяет имам. Мазхаб меняет только спорные пункты.")}</p>
        <div className="hs-mz" role="radiogroup" aria-label={_t("Мазхаб")}>
          {MZ.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={opts.mz === k} onClick={() => pick({ mz: k })}>{l}</button>)}
        </div>
        <label className="hs-tog"><input type="checkbox" checked={opts.e471} onChange={(e) => pick({ e471: e.target.checked })} /><span><b>{_t("Считать E471 и похожие сомнительными")}</b><small>{_t("Строже: жиры двойного происхождения всегда жёлтые. Если выключить, их не отмечаем.")}</small></span></label>
        <h4 className="red">{_t("Красный, харам")}</h4>
        <ul>
          <li>{_t("Свинина: сало, бекон, lard, свиной желатин")}</li>
          <li>{_t("Кровь и продукты из неё")}</li>
          <li>{_t("Спирт, вино, пиво, ром, коньяк в составе")}</li>
        </ul>
        <h4 className="yellow">{_t("Жёлтый, сомнительно")}</h4>
        <ul>
          <li>{_t("Мясо, колбаса, животный жир без сертификата")}</li>
          <li>{_t("Желатин без указания (E441)")}</li>
          {opts.e471 && <li>{_t("E471, E472, E422, E570: жиры двойного происхождения")}</li>}
          <li>{_t("E120 кармин, E904 шеллак, E542 костный фосфат, E920 цистеин")}</li>
          <li>{_t("Сычужный фермент и пепсин в сыре")}</li>
          <li>{_t("Ароматизаторы и экстракты на спирту")}</li>
          {opts.sea && <li>{_t("Морепродукты кроме рыбы (для ханафитов)")}</li>}
        </ul>
        <h4 className="green">{_t("Зелёный, халяль")}</h4>
        <ul>
          <li>{_t("Знак халяль отмечен в базе товаров")}</li>
          <li>{_t("Ты сам отметил знак на упаковке (видно только тебе)")}</li>
        </ul>
        <h4 className="clean">{_t("Серо-зелёный, запрещённого нет")}</h4>
        <ul><li>{_t("Ничего из списков выше, но и сертификата нет")}</li></ul>
        <p className="fp-note" style={{ textAlign: 'left' }}>{_t("Состав читаем на русском, английском, нидерландском, немецком, французском и турецком.")}</p>
      </div>
    </>);
  } else if (stage.s === 'hist') {
    const back = stage.back;
    const open = (h: Hist) => (h.p ? show(h.p, h.t) : h.code ? find(h.code) : undefined);
    body = (<>
      {head(_t("Проверенные товары"), _tj("{0} на этом телефоне", hist.length), back ? () => setStage(back) : undefined)}
      <div className="fp-body">
        {hist.length === 0 && <p className="fp-status"><b>{_t("Пока пусто")}</b><small>{_t("Здесь будут товары, которые ты проверил.")}</small></p>}
        <div className="h-card hs-list">
          {hist.map((h) => (
            <button key={`${h.code}-${h.t}`} type="button" onClick={() => open(h)}>
              <i className={`hs-dot ${h.v}`} aria-hidden="true" />
              <span><b>{h.n}</b><small>{h.why} · {dayWord(h.t)}</small></span><em aria-hidden="true">›</em>
            </button>
          ))}
        </div>
        <p className="fp-note">{_t("Сохранённые товары открываются и без интернета. Список хранится только на этом телефоне.")}</p>
        <button type="button" className="pri-btn" onClick={() => setStage({ s: 'cam' })}>{_t("Сканировать")}</button>
      </div>
    </>);
  }
  return <div className="sess light-sess fp-screen hs-screen" role="dialog" aria-modal="true" aria-label={_t("Халяль-сканер")}>{fileInput}{body}</div>;
}

/** The card on «Сегодня»: a big button into the scanner and the last three checks with coloured dots. */
export function HalalCard({ onOpen }: { onOpen: (start?: 'cam' | 'hist') => void }) {
  const h = history();
  return (
    <section className="hs-card">
      <button type="button" className="hs-go" onClick={() => onOpen('cam')}>
        <PIcon k="scan" />
        <span><b>{_t("Халяль-сканер")}</b><small>{_t("Наведи камеру на штрихкод в магазине")}</small></span><em aria-hidden="true">›</em>
      </button>
      {h.length > 0 && (
        <div className="hs-recent">
          <small className="fd-lbl">{_t("Недавно проверял")}</small>
          {h.slice(0, 3).map((x) => (
            <button key={`${x.code}-${x.t}`} type="button" onClick={() => onOpen('hist')}>
              <i className={`hs-dot ${x.v}`} aria-hidden="true" /><span><b>{x.n}</b><small>{x.why} · {dayWord(x.t)}</small></span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
