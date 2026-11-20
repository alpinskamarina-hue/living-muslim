// «Сканировать штрихкод» (step 3 of the food concept, mockup approved 20.11): the camera with a frame that
// catches the code by itself, the product with numbers from its label, portions, «Проверь состав», and the
// way out when a product is not in the open database (photo of the label, or three numbers typed in).
import { Fragment, useEffect, useRef, useState } from 'react';
import type { FoodItem, Meal } from '../types';
import { flagName, flagWhy, lookup, makeDetector, marks, portion, remember, validCode, type Product } from '../barcode';
import { _t, _tj } from '../i18n';

type Stage =
  | { s: 'cam' }
  | { s: 'type'; code: string }
  | { s: 'look'; code: string }
  | { s: 'found'; p: Product; g: string }
  | { s: 'none'; code: string; name: string; k: string; g: string }
  | { s: 'net'; code: string };

const num = (x: string) => Number(x.replace(',', '.'));
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
/** The ingredient text with the flagged words marked. */
function highlight(text: string, re: RegExp) {
  const out: JSX.Element[] = [];
  let at = 0, k = 0;
  for (const m of text.matchAll(re)) {
    if (!m[0] || m.index === undefined) continue;
    if (m.index > at) out.push(<Fragment key={k++}>{text.slice(at, m.index)}</Fragment>);
    out.push(<mark key={k++}>{m[0]}</mark>);
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(<Fragment key={k++}>{text.slice(at)}</Fragment>);
  return out;
}
const group = (c: string) => (c.length === 13 ? `${c[0]} ${c.slice(1, 7)} ${c.slice(7)}` : c);

export function BarcodeScan({ meal, mealLabel, onAdd, onClose, onPhoto }: { meal: Meal; mealLabel: string; onAdd: (items: FoodItem[]) => void; onClose: () => void; onPhoto: (() => void) | null }) {
  const [stage, setStage] = useState<Stage>({ s: 'cam' });
  const [camErr, setCamErr] = useState<'' | 'denied' | 'none'>('');
  const [torch, setTorch] = useState<boolean | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const abort = useRef<AbortController | null>(null);

  const stopCam = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => () => { stopCam(); abort.current?.abort(); }, []);

  const find = async (code: string) => {
    stopCam();
    if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* */ }
    setStage({ s: 'look', code });
    const ac = new AbortController(); abort.current = ac;
    const timer = window.setTimeout(() => ac.abort(), 12000);
    const r = await lookup(code, ac.signal);
    window.clearTimeout(timer);
    if (r.ok) setStage({ s: 'found', p: r.p, g: String(portion(r.p)) });
    else if (r.why === 'none') setStage({ s: 'none', code, name: r.name ?? '', k: '', g: '' });
    else setStage({ s: 'net', code });
  };

  // The camera, and the reader that looks at it a few times a second.
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
        let seen = '', times = 0;
        const tick = async () => {
          if (!live) return;
          const code = await detect(v).catch(() => null);
          if (!live) return;
          // Two equal reads in a row, so a half-seen code does not slip through.
          if (code && code === seen) { times++; if (times >= 1) { live = false; find(code); return; } } else { seen = code ?? ''; times = 0; }
          timer = window.setTimeout(tick, 180);
        };
        tick();
      } catch (e) {
        setCamErr((e as Error)?.name === 'NotAllowedError' ? 'denied' : 'none');
      }
    })();
    return () => { live = false; window.clearTimeout(timer); };
  }, [stage.s]);

  const toggleTorch = async () => {
    const tr = stream.current?.getVideoTracks()[0];
    if (!tr || torch === null) return;
    try { await tr.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { setTorch(null); }
  };

  const save = (p: Product, g: number) => {
    remember(p);
    const q = g / 100;
    onAdd([{ id: `bc-${Date.now().toString(36)}`, n: p.n, g: Math.round(g), k: Math.round(p.k * q), p: Math.round(p.p * q * 10) / 10, f: Math.round(p.f * q * 10) / 10, c: Math.round(p.c * q * 10) / 10, m: meal }]);
    onClose();
  };

  const close = () => { stopCam(); abort.current?.abort(); onClose(); };
  const unit = (p: Product) => (p.ml ? _t("мл") : _t("г"));

  if (stage.s === 'cam') return (
    <div className="bc-cam" role="dialog" aria-modal="true" aria-label={_t("Штрихкод")}>
      <video ref={video} playsInline muted />
      <div className="bc-frame"><u /></div>
      <div className="bc-hd">
        <button type="button" className="icon-btn" onClick={close} aria-label={_t("Закрыть")}>✕</button>
        <b>{_t("Штрихкод")}</b>
        {torch !== null && <button type="button" className={`icon-btn bc-torch${torch ? ' on' : ''}`} onClick={toggleTorch} aria-label={_t("Фонарик")}>🔦</button>}
      </div>
      <p className="bc-msg">
        {camErr === 'denied' ? <><b>{_t("Нет доступа к камере")}</b><small>{_t("Разреши камеру для этого сайта в настройках браузера или введи цифры под штрихкодом.")}</small></>
          : camErr === 'none' ? <><b>{_t("Камера не открылась")}</b><small>{_t("Можно ввести цифры под штрихкодом.")}</small></>
          : <><b>{_t("Наведи на штрихкод")}</b><small>{_t("поймаю сам, нажимать ничего не нужно")}</small></>}
      </p>
      <div className="bc-bot">
        <button type="button" onClick={() => { stopCam(); setStage({ s: 'type', code: '' }); }}>{_t("Ввести цифры")}</button>
        {onPhoto && <button type="button" onClick={() => { close(); onPhoto(); }}>{_t("Сфотографировать еду")}</button>}
      </div>
    </div>
  );

  const head = (title: string, sub: string) => (
    <div className="sess-top">
      <button type="button" className="icon-btn" onClick={close} aria-label={_t("Закрыть")}>✕</button>
      <div><b>{title}</b><small>{sub}</small></div>
    </div>
  );

  let body: JSX.Element | null = null;
  if (stage.s === 'type') {
    const ok = validCode(stage.code);
    body = (<>
      {head(_t("Штрихкод"), _tj("в «{0}»", mealLabel))}
      <div className="fp-body">
        <p className="fp-status"><b>{_t("Цифры под штрихкодом")}</b><small>{_t("обычно 13 цифр, вводи все подряд")}</small></p>
        <input className="bc-digits" inputMode="numeric" autoFocus value={stage.code} maxLength={14} onChange={(e) => setStage({ s: 'type', code: e.target.value.replace(/\D/g, '') })} aria-label={_t("Цифры штрихкода")} />
        {stage.code.length >= 8 && !ok && <p className="fp-note">{_t("Похоже, одна цифра не та. Проверь ещё раз.")}</p>}
        <button type="button" className="pri-btn" disabled={!ok} onClick={() => find(stage.code)}>{_t("Найти")}</button>
        <button type="button" className="link-btn fp-center" onClick={() => setStage({ s: 'cam' })}>{_t("Снова камера")}</button>
      </div>
    </>);
  } else if (stage.s === 'look') {
    body = (<>
      {head(_t("Штрихкод"), group(stage.code))}
      <div className="fp-body">
        <p className="fp-status" style={{ marginTop: 40 }}><b>{_t("Ищу товар…")}</b><small>{_t("в открытой базе продуктов")}</small></p>
        <div className="fp-dots"><i /><i /><i /></div>
        <button type="button" className="link-btn fp-center" onClick={close}>{_t("Отмена")}</button>
      </div>
    </>);
  } else if (stage.s === 'net') {
    body = (<>
      {head(_t("Штрихкод"), group(stage.code))}
      <div className="fp-body"><div className="fp-err">
        <div className="fp-big">📶</div><b>{_t("Не получилось связаться")}</b><p>{_t("Проверь интернет и попробуй ещё раз.")}</p>
        <button type="button" className="pri-btn" onClick={() => find(stage.code)}>{_t("Попробовать ещё раз")}</button>
        <button type="button" className="link-btn fp-center" onClick={close}>{_t("Написать текстом")}</button>
      </div></div>
    </>);
  } else if (stage.s === 'found') {
    const { p } = stage;
    const g = num(stage.g);
    const q = g > 0 ? g / 100 : 0;
    const chips: { l: string; g: number }[] = [];
    if (p.serving) chips.push({ l: _tj("порция · {0} {1}", p.serving, unit(p)), g: p.serving });
    if (p.pack && p.pack !== p.serving) { chips.push({ l: _tj("вся упаковка · {0} {1}", p.pack, unit(p)), g: p.pack }); if (p.pack >= 60) chips.push({ l: _tj("½ упаковки · {0} {1}", Math.round(p.pack / 2), unit(p)), g: Math.round(p.pack / 2) }); }
    if (!chips.some((c) => c.g === 100)) chips.push({ l: `100 ${unit(p)}`, g: 100 });
    const re = p.ing ? marks(p.ing, p.flags) : null;
    const strong = p.flags.filter((f) => f !== 'e471');
    body = (<>
      {head(_t("Нашёл"), _tj("в «{0}»", mealLabel))}
      <div className="fp-body">
        <div className="bc-prod">
          <span><b>{p.n}</b><small>{[p.brand, p.pack ? _tj("{0} {1}", p.pack, unit(p)) : '', p.own ? _t("записано тобой") : ''].filter(Boolean).join(' · ')}</small>
            {p.halal && <em className="bc-halal">☪ {_t("Знак «Халяль» на упаковке")}</em>}</span>
        </div>
        <small className="fd-lbl">{p.ml ? _t("На 100 мл") : _t("На 100 г")}</small>
        <div className="bc-per">
          <span><b>{Math.round(p.k)}</b>{_t("ккал")}</span><span><b>{fmt(p.p)}</b>{_t("белок")}</span><span><b>{fmt(p.f)}</b>{_t("жиры")}</span><span><b>{fmt(p.c)}</b>{_t("углев.")}</span>
        </div>
        <small className="fd-lbl">{_t("Сколько съел")}</small>
        <div className="bc-chips">
          {chips.map((c) => <button key={c.l} type="button" aria-pressed={g === c.g} onClick={() => setStage({ ...stage, g: String(c.g) })}>{c.l}</button>)}
          <label><input inputMode="decimal" value={stage.g} onChange={(e) => setStage({ ...stage, g: e.target.value })} aria-label={_t("Граммы")} /><small>{unit(p)}</small></label>
        </div>
        {p.flags.length > 0 ? (
          <div className="fp-warn"><b>{_t("Проверь состав")}</b>
            {_tj("Нашёл: {0}.", p.flags.map(flagName).join(', '))} {p.flags.map(flagWhy).join(' ')}{' '}
            {strong.length ? (p.halal ? _t("На упаковке есть знак халяль, но лучше посмотри сам.") : _t("Посмотри, есть ли на упаковке знак халяль, или спроси у производителя.")) : _t("Если важно, спроси у производителя.")}{' '}
            {_t("Это подсказка, а не фетва.")}</div>
        ) : p.ing ? (
          <div className="bc-ok"><b>{_t("Состав проверили")}</b>{p.halal ? _t("В базе отмечено, что на упаковке есть знак халяль. Знак ставит производитель, мы его не проверяем.") : _t("Сомнительных добавок в списке не нашли.")} {_t("Это подсказка, а не фетва.")}</div>
        ) : (
          <div className="bc-ok gray"><b>{_t("Состава в базе нет")}</b>{_t("Посмотри список ингредиентов на упаковке.")}</div>
        )}
        {p.ing && (
          <p className="bc-ing">{_t("Состав:")} {re ? highlight(p.ing, re) : p.ing}</p>
        )}
        <div className="fp-total">
          <span><small>{_t("Запишу")}</small><b>{_tj("{0} ккал", Math.round(p.k * q))}</b></span>
          <span><small>{_tj("белок {0} г", Math.round(p.p * q))}</small><small>{_tj("жиры {0} г · углеводы {1} г", Math.round(p.f * q), Math.round(p.c * q))}</small></span>
        </div>
        <button type="button" className="pri-btn fp-save" disabled={!(g > 0 && g < 5000)} onClick={() => save(p, g)}>{_tj("Записать в «{0}»", mealLabel)}</button>
        {!p.own && <p className="fp-note">{_t("Данные с этикетки из открытой базы Open Food Facts. Если цифры отличаются от упаковки, верь упаковке.")}</p>}
        <button type="button" className="link-btn fp-center" onClick={() => setStage({ s: 'cam' })}>{_t("Сканировать другой")}</button>
      </div>
    </>);
  } else if (stage.s === 'none') {
    const ok = stage.name.trim() && num(stage.k) > 0 && num(stage.k) < 950 && num(stage.g) > 0 && num(stage.g) < 5000;
    const total = Math.round((num(stage.k) * num(stage.g)) / 100);
    body = (<>
      {head(_t("Штрихкод"), group(stage.code))}
      <div className="fp-body">
        <div className="fp-err" style={{ paddingTop: 8 }}>
          <div className="fp-big">📦</div>
          <b>{_t("Этого товара пока нет в базе")}</b>
          <p>{_t("Так бывает с местными и новыми товарами. Можно записать по-другому:")}</p>
        </div>
        {onPhoto && <>
          <button type="button" className="pri-btn" onClick={() => { close(); onPhoto(); }}>{_t("Сфотографировать этикетку")}</button>
          <p className="fp-note">{_t("прочитаю таблицу калорий с упаковки (это одно фото из дневного лимита)")}</p>
        </>}
        <div className="h-card bc-form">
          <b>{_t("Или ввести с этикетки")}</b>
          <label><small>{_t("Название")}</small><input value={stage.name} maxLength={60} onChange={(e) => setStage({ ...stage, name: e.target.value })} /></label>
          <div className="fd-nums">
            <label><small>{_t("Ккал на 100 г")}</small><input inputMode="decimal" value={stage.k} onChange={(e) => setStage({ ...stage, k: e.target.value })} /></label>
            <label><small>{_t("Съел, г")}</small><input inputMode="decimal" value={stage.g} onChange={(e) => setStage({ ...stage, g: e.target.value })} /></label>
          </div>
          <button type="button" className="pri-btn" disabled={!ok} onClick={() => save({ code: stage.code, n: stage.name.trim(), k: Math.round(num(stage.k)), p: 0, f: 0, c: 0, flags: [], halal: false, own: true, t: Date.now() }, num(stage.g))}>
            {ok ? _tj("Записать {0} ккал в «{1}»", total, mealLabel) : _tj("Записать в «{0}»", mealLabel)}
          </button>
          <p className="fp-note">{_t("В следующий раз этот штрихкод узнаю сразу на твоём телефоне.")}</p>
        </div>
      </div>
    </>);
  }
  return <div className="sess light-sess fp-screen" role="dialog" aria-modal="true" aria-label={_t("Штрихкод")}>{body}</div>;
}
