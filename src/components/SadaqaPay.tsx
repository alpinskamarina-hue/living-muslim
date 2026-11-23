// «Подари Pro тому, кто просит» and «Куда отдать» (in Садака), «Поддержать Living Muslim» (in Профиль).
import { useEffect, useState } from 'react';
import { _t, _tj, LANG, LOC } from '../i18n';
import {
  EURS, giftWhat, supportWhat, sadaqaWall, sadaqaMine, cachedMine, proAsk, sadaqaCheckout, sadaqaTest, charities, CHARITY_KINDS, useSadaqaReady,
  type Eur, type SadaqaWall, type SadaqaMine, type Charity, type CharityKind, type PayKind,
} from '../sadaqa';
import { cloudMe } from '../cloud';

const isOwner = () => { try { return sessionStorage.getItem('lm.admin') === '1'; } catch { return false; } };
const plural = (n: number, one: string, few: string, many: string) => { if (LANG === 'en') return n === 1 ? one : few; const a = n % 100, b = n % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many; };
const months = (n: number) => `${n} ${plural(n, _t("месяц"), _t("месяца"), _t("месяцев"))}`;

function useWall() {
  const [w, setW] = useState<SadaqaWall | null>(null);
  useEffect(() => { sadaqaWall().then(setW); }, []);
  return w;
}
function useMine(): [SadaqaMine | null, () => void] {
  const [m, setM] = useState<SadaqaMine | null>(cachedMine);
  const load = () => { sadaqaMine().then((x) => x && setM(x)); };
  useEffect(load, []);
  return [m, load];
}

/** The card on «Садака · День». */
export function GiftProCard({ onOpen }: { onOpen: () => void }) {
  const ready = useSadaqaReady();
  const [w, setW] = useState<SadaqaWall | null>(null);
  useEffect(() => { if (ready) sadaqaWall().then(setW); }, [ready]);
  return (
    <div className="h-card sq-gift">
      <div className="meal-h"><b>{_t("Подари Pro тому, кто просит")}</b></div>
      <small>{w && w.waiting > 0 ? _t("Ждут: {0}. От €5 ты закрываешь кому-то месяц.", w.waiting) : _t("Кто-то не может заплатить за Pro. От €5 ты закрываешь ему месяц.")}</small>
      <button type="button" className="gold-btn" onClick={onOpen}>{_t("Подарить")}</button>
    </div>
  );
}

/** Amount picker shared by the gift and the support screens. */
function Amounts({ v, set, what }: { v: Eur; set: (e: Eur) => void; what: (e: Eur) => string }) {
  return (
    <div className="sq-amts" role="radiogroup" aria-label={_t("Сумма")}>
      {EURS.map((e) => (
        <button key={e} type="button" role="radio" aria-checked={v === e} onClick={() => set(e)}><b>€{e}</b><small>{what(e)}</small></button>
      ))}
    </div>
  );
}

function usePay(kind: PayKind, onPaid: () => void) {
  const [busy, setBusy] = useState(false);
  // Back from Stripe (/app/?sadaqa=ok|cancel): App.tsx leaves the answer here.
  const [msg, setMsg] = useState(() => {
    try {
      const b = sessionStorage.getItem('lm.sadaqaBack'); sessionStorage.removeItem('lm.sadaqaBack');
      if (b === 'ok') return kind === 'gift' ? _t("Оплата прошла. Джазак Аллаху хайран! Pro откроется тем, кто просит, через минуту.") : _t("Оплата прошла. Джазак Аллаху хайран! Значок появится через минуту.");
      if (b === 'cancel') return _t("Оплата отменена, деньги не списаны.");
    } catch { /* */ }
    return '';
  });
  useEffect(() => { if (msg) setTimeout(onPaid, 4000); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (o: { eur: Eur; mode: 'once' | 'month'; sign: 'secret' | 'nick'; wall: string }, test = false) => {
    if (!cloudMe()) { setMsg(_t("Сначала создай профиль: Профиль → Аккаунт. Без него подарок некому записать.")); return; }
    setBusy(true); setMsg('');
    if (test) {
      const r = await sadaqaTest({ kind, ...o }, LANG);
      setBusy(false);
      if ('error' in r) setMsg(r.error === 'admin' ? _t("Тестовая запись доступна только владельцу, войди по почте владельца.") : _t("Не получилось: {0}", r.error));
      else { setMsg(kind === 'gift' ? _tj("Тестовый подарок записан: открыто людям {0}, в запасе {1}.", r.opened, r.pooled) : _t("Тестовая запись сделана. На стене и в сумме её нет.")); onPaid(); }
      return;
    }
    const r = await sadaqaCheckout({ kind, ...o }, LANG);
    if (r.url) { location.href = r.url; return; }
    setBusy(false);
    setMsg(r.error === 'nostripe' ? _t("Оплата подключается. Как только Stripe будет включён, кнопка заработает.") : r.error === 'prepare' ? _t("Сервер ещё не готов. Попробуй чуть позже.") : _t("Не получилось открыть оплату. Попробуй ещё раз чуть позже."));
  };
  return { busy, msg, run };
}

/** «Подари Pro»: the full screen (in Садака and from the Stripe return). */
export function GiftPro() {
  const ready = useSadaqaReady();
  const w = useWall();
  const [mine, reload] = useMine();
  const [eur, setEur] = useState<Eur>(10);
  const [mode, setMode] = useState<'once' | 'month'>('once');
  const [sign, setSign] = useState<'secret' | 'nick'>('secret');
  const pay = usePay('gift', reload);
  const gifts = (mine?.list ?? []).filter((x) => x.kind === 'gift');
  const opened = gifts.reduce((a, x) => a + x.opened, 0);
  const hasNick = Boolean(cloudMe()?.name);
  return (
    <>
      <div className="h-card h-hero sq-hero">
        <small>{_t("Сейчас ждут")}</small>
        <b className="h-big sm">{w ? `${w.waiting} ${plural(w.waiting, _t("человек"), _t("человека"), _t("человек"))}` : '…'}</b>
        <small>{_t("Студенты, многодетные отцы, те, кто недавно принял ислам. Имён не показываем.")}</small>
        {w && w.helped > 0 && <small>{_tj("Уже получили Pro в подарок: {0}", w.helped)}</small>}
      </div>
      {!ready && <p className="q-msg left">{_t("Подарки скоро заработают: сервер ещё настраивается.")}</p>}
      <div className="h-card">
        <b>{_t("Сколько подарить")}</b>
        <Amounts v={eur} set={setEur} what={giftWhat} />
        <div className="seg sq-seg">
          <button type="button" aria-pressed={mode === 'once'} onClick={() => setMode('once')}>{_t("Один раз")}</button>
          <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>{_t("Каждый месяц")}</button>
        </div>
        {mode === 'month' && <small>{_t("Каждый месяц та же сумма закрывает Pro следующему, кто попросит. Отменить можно в любой момент по ссылке из письма Stripe.")}</small>}
      </div>
      <div className="h-card">
        <b>{_t("Как подписать")}</b>
        <div className="choices">
          <button type="button" aria-pressed={sign === 'secret'} onClick={() => setSign('secret')}>{_t("Тайно")}</button>
          <button type="button" aria-pressed={sign === 'nick'} disabled={!hasNick} onClick={() => setSign('nick')}>{_t("От моего ника")}</button>
        </div>
        <small>{sign === 'secret' ? _t("Человек получит: «Кто-то подарил тебе Pro. Сделай за него дуа».") : _t("Человек увидит твой ник и сможет сделать за тебя дуа.")}</small>
      </div>
      <button type="button" className="gold-btn big-btn" disabled={!ready || pay.busy} onClick={() => pay.run({ eur, mode, sign, wall: '' })}>
        {mode === 'month' ? _tj("Дарить €{0} каждый месяц", eur) : _tj("Подарить €{0}", eur)}
      </button>
      {isOwner() && ready && <button type="button" className="ghost-btn" disabled={pay.busy} onClick={() => pay.run({ eur, mode, sign, wall: '' }, true)}>{_t("Тестовая запись без оплаты (только владелец)")}</button>}
      {pay.msg && <p className="pro-note">{pay.msg}</p>}
      <p className="q-msg left tiny-note">{_t("Оплата картой через Stripe (Apple Pay, Google Pay). Российские карты Stripe пока не принимает. Если все просьбы закрыты, подарок ждёт следующего, кто попросит.")}</p>
      <div className="deed sq-note"><small>{_t("Это ближе всего к садаке внутри приложения: польза идёт конкретному человеку. Отметь «Сегодня дал» в дневнике садаки, если хочешь.")}</small></div>
      {gifts.length > 0 && (
        <div className="h-card">
          <b>{_t("Мои подарки")}</b>
          <small>{_tj("Открыто людям: {0}. Ждут следующего, кто попросит: {1}.", opened, gifts.reduce((a, x) => a + x.pooled, 0))}</small>
          {gifts.slice(0, 5).map((g) => (
            <small key={g.id}>€{g.eur}{g.mode === 'month' ? _t(" каждый месяц") : ''} · {new Date(g.paid).toLocaleDateString(LOC, { day: 'numeric', month: 'short' })}{g.status === 'test' ? _t(" · тест") : g.status === 'ended' ? _t(" · остановлено") : ''}</small>
          ))}
        </div>
      )}
      <AskBlock mine={mine} reload={reload} ready={ready} />
    </>
  );
}

/** «Самому нужен Pro?»: the request and its answer. */
function AskBlock({ mine, reload, ready }: { mine: SadaqaMine | null; reload: () => void; ready: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const a = mine?.ask;
  if (!ready) return null;
  if (a?.status === 'got') return (
    <div className="h-card sq-got">
      <b>{_t("Тебе подарили Pro")}</b>
      <small>{a.from ? _tj("@{0} подарил тебе Pro на {1}. Сделай за него дуа.", a.from, months(a.months)) : _tj("Кто-то подарил тебе Pro на {0}. Сделай за него дуа.", months(a.months))}</small>
    </div>
  );
  if (a?.status === 'wait') return <p className="q-msg left">{_t("Ты в очереди на Pro в подарок. Как только кто-то подарит, Pro откроется сам.")}</p>;
  if (!open) return <button type="button" className="link-btn sq-ask-link" onClick={() => setOpen(true)}>{_t("Самому нужен Pro, а заплатить нечем? Попроси")}</button>;
  const send = async () => {
    if (!cloudMe()) { setMsg(_t("Сначала создай профиль: Профиль → Аккаунт.")); return; }
    setBusy(true);
    const r = await proAsk(note);
    setBusy(false);
    if (r.error) { setMsg(_t("Не получилось. Попробуй ещё раз.")); return; }
    setMsg(r.status === 'got' ? _t("Подарок уже был в запасе: Pro открыт. Сделай дуа за того, кто подарил.") : r.soon ? _t("Ты недавно получал Pro в подарок. Попросить снова можно через месяц.") : _t("Готово. Ты в очереди, имя никто не увидит."));
    reload();
  };
  return (
    <div className="h-card">
      <b>{_t("Попросить Pro в подарок")}</b>
      <small>{_t("Без стыда: для этого и придумано. Тот, кто дарит, не узнает, кто ты.")}</small>
      <input className="j-in" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={_t("Пару слов о себе (необязательно): студент, многодетный…")} />
      <button type="button" className="pri-btn" disabled={busy} onClick={send}>{_t("Попросить")}</button>
      {msg && <small>{msg}</small>}
    </div>
  );
}

const KIND_IC: Record<CharityKind, string> = { water: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', orphans: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 12a2.3 2.3 0 1 0 0-4.6M14 20c0-2.5 1-4 3-4s3 1.5 3 4', food: 'M4 11h16M5 11a7 7 0 0 0 14 0M12 4v3', mosque: 'M4 20h16M6 20v-7a6 6 0 0 1 12 0v7M12 3v4', urgent: 'M12 4l9 16H3zM12 10v4M12 17v.5', other: 'M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z' };
export const CharityIcon = ({ k }: { k: CharityKind }) => <span className="sq-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={KIND_IC[k] ?? KIND_IC.other} /></svg></span>;

/** The row on «Садака · День» that opens «Куда отдать». */
export function WhereRow({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="h-card sq-row" onClick={onOpen}>
      <CharityIcon k="water" />
      <span><b>{_t("Куда отдать")}</b><small>{_t("проверенные фонды · вода, сироты, еда")}</small></span>
      <i aria-hidden="true">›</i>
    </button>
  );
}

/** «Куда отдать»: the owner's list of charities. Money goes straight to them. */
export function WhereToGive({ onMark, onJariya }: { onMark: () => void; onJariya: (c: Charity) => void }) {
  const [list, setList] = useState<Charity[] | null>(null);
  const [k, setK] = useState<CharityKind | 'all'>('all');
  const [last, setLast] = useState<Charity | null>(null);
  const [done, setDone] = useState('');
  useEffect(() => { charities().then(setList); }, []);
  const shown = (list ?? []).filter((c) => k === 'all' || c.kind === k);
  const kinds = CHARITY_KINDS.filter(([x]) => (list ?? []).some((c) => c.kind === x));
  return (
    <>
      {kinds.length > 1 && (
        <div className="choices">
          <button type="button" aria-pressed={k === 'all'} onClick={() => setK('all')}>{_t("Все темы")}</button>
          {kinds.map(([x, l]) => <button key={x} type="button" aria-pressed={k === x} onClick={() => setK(x)}>{l}</button>)}
        </div>
      )}
      {list === null ? <p className="q-msg left">{_t("Загружаю…")}</p> : !list.length ? (
        <p className="q-msg left">{_t("Список фондов скоро появится: мы проверяем отчёты каждого. А пока отдай тому, кого знаешь сам.")}</p>
      ) : (
        <div className="h-card sq-list">
          {shown.map((c) => (
            <a key={c.id} className="sq-row in" href={c.url} target="_blank" rel="noopener noreferrer" onClick={() => setLast(c)}>
              <CharityIcon k={c.kind} />
              <span><b>{c.title}</b><small>{[c.org, c.note, c.region].filter(Boolean).join(' · ')}</small></span>
              <i aria-hidden="true">↗</i>
            </a>
          ))}
        </div>
      )}
      <div className="h-card">
        <b>{_t("Отдал через фонд?")}</b>
        <small>{last?.jariya ? _tj("Одна кнопка отметит садаку в дневнике и добавит «{0}» в «Джарию».", last.title) : _t("Вернись сюда: одна кнопка отметит садаку в дневнике. Если это колодец или мечеть, она попадёт и в «Джарию».")}</small>
        <button type="button" className="pri-btn" onClick={() => { onMark(); if (last?.jariya) onJariya(last); setDone(last?.jariya ? _t("Отмечено и добавлено в «Джарию». Пусть Аллах примет.") : _t("Отмечено. Пусть Аллах примет.")); }}>{_t("Отметить «Сегодня дал»")}</button>
        {done && <small>{done}</small>}
      </div>
      <p className="q-msg left tiny-note">{_t("Мы не берём комиссию и не получаем денег от фондов. В список попадают фонды с отчётами. Для России отдельные фонды, которые принимают российские карты.")}</p>
    </>
  );
}

/** Профиль → «Поддержать Living Muslim». Honestly not sadaqa. */
export function SupportPage({ onFounders, onGift }: { onFounders?: () => void; onGift?: () => void }) {
  const ready = useSadaqaReady();
  const w = useWall();
  const [mine, reload] = useMine();
  const [eur, setEur] = useState<Eur>(10);
  const [mode, setMode] = useState<'once' | 'month'>('once');
  const [anon, setAnon] = useState(false);
  const [wall, setWall] = useState(cloudMe()?.name ?? '');
  const pay = usePay('support', reload);
  return (
    <div className="h-wrap sq-page">
      <div className="h-card h-hero sq-hero">
        <small>{_t("Нас поддержали")}</small>
        <b className="h-big sm">{w ? `${w.supporters} ${plural(w.supporters, _t("человек"), _t("человека"), _t("человек"))}` : '…'}</b>
        <small>{_t("Каждый евро идёт на серверы, переводы и новые курсы. Рекламы в приложении нет и не будет.")}</small>
      </div>
      {mine?.supporter && <p className="q-msg left">{_t("Ты уже сторонник Living Muslim. Джазак Аллаху хайран!")}</p>}
      {!ready && <p className="q-msg left">{_t("Поддержка скоро заработает: сервер ещё настраивается.")}</p>}
      <div className="h-card">
        <b>{_t("Сумма")}</b>
        <Amounts v={eur} set={setEur} what={supportWhat} />
        <div className="seg sq-seg">
          <button type="button" aria-pressed={mode === 'once'} onClick={() => setMode('once')}>{_t("Один раз")}</button>
          <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>{_t("Каждый месяц")}</button>
        </div>
      </div>
      <div className="h-card">
        <b>{_t("В благодарность")}</b>
        <small>{_t("Значок «Сторонник» в профиле и имя на стене сторонников (если хочешь).")}</small>
        <input className="j-in" value={wall} disabled={anon} maxLength={40} onChange={(e) => setWall(e.target.value)} placeholder={_t("Имя на стене")} />
        <label className="check-row"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />{_t(" Анонимно, без значка и имени")}</label>
        {w && w.names.length + w.anon > 0 && (
          <div className="sq-wall">{w.names.slice(0, 12).map((n) => <span key={n}>{n}</span>)}{w.anon > 0 && <span>{_t("Анонимно · {0}", w.anon)}</span>}</div>
        )}
      </div>
      <button type="button" className="gold-btn big-btn" disabled={!ready || pay.busy || (!anon && !wall.trim())} onClick={() => pay.run({ eur, mode, sign: 'secret', wall: anon ? '' : wall.trim() })}>
        {mode === 'month' ? _tj("Поддерживать €{0} каждый месяц", eur) : _tj("Поддержать €{0}", eur)}
      </button>
      {isOwner() && ready && <button type="button" className="ghost-btn" disabled={pay.busy} onClick={() => pay.run({ eur, mode, sign: 'secret', wall: anon ? '' : wall.trim() }, true)}>{_t("Тестовая запись без оплаты (только владелец)")}</button>}
      {pay.msg && <p className="pro-note">{pay.msg}</p>}
      <p className="q-msg left tiny-note">{_t("Это не садака и не пожертвование, а поддержка проекта (оплата услуги). Оплата картой через Stripe, российские карты пока не принимаются.")}</p>
      {onGift && <button type="button" className="link-btn sq-ask-link" onClick={onGift}>{_t("Хочешь садаку? Подари Pro тому, кто просит ›")}</button>}
      {onFounders && (
        <button type="button" className="h-card sq-row" onClick={onFounders}>
          <span className="sq-ic star" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.3 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z" /></svg></span>
          <span><b>{_t("Хочешь больше?")}</b><small>{_t("Круг основателей, от €100")}</small></span>
          <i aria-hidden="true">›</i>
        </button>
      )}
    </div>
  );
}

/** «Сторонник» next to the founder's mark on someone's profile. */
export function SupporterTag() {
  return <span className="pp-tag t-supporter"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d={KIND_IC.other} fill="currentColor" /></svg> {_t("Сторонник Living Muslim")}</span>;
}
