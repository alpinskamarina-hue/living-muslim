import { useEffect, useMemo, useRef, useState } from 'react';
import { TIERS, tierOf, eur, certNo, checkout, testOrder, myFounder, useGift, foundersWall, type Tier, type Mine, type Wall, type FounderRec, type TierInfo } from '../founders';
import { cloudMe } from '../cloud';
import { authMe } from '../auth';
import { cachedProfile } from './Nick';
import { _t, _tj, LANG, LOC } from '../i18n';

// «Круг основателей» in the Profile: the levels and the payment, «Мой вклад» after it, gift codes, the wall.
// Payment: Stripe Checkout through /api/invest?op=checkout; the owner (lm_admins) has a test record without paying.

export interface FounderStart { tier?: Tier; ok?: boolean; cancel?: boolean; mine?: boolean; terms?: boolean; gift?: string }
const dateOf = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const TIER_EN: Record<Tier, string> = { f100: 'Founder', f250: 'Ansar', f500: 'Muhsin', f1000: 'Partner' };
export const tierName = (t: Tier) => (LANG === 'en' ? TIER_EN[t] : tierOf(t).name);

export function FoundersPage({ start, admin, onTerms }: { start?: FounderStart | null; admin: boolean; onTerms: () => void }) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [wall, setWall] = useState<Wall | null>(null);
  const [waiting, setWaiting] = useState(Boolean(start?.ok));
  const [note, setNote] = useState(start?.cancel ? _t("Оплата отменена. Ничего не списано, можно попробовать снова.") : '');
  const formRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false); // the form collapses when I already have a record, so it waits for the answer
  const load = () => myFounder().then((m) => { setMine(m); setLoaded(true); });
  useEffect(() => { load(); foundersWall().then(setWall); }, []);
  // back from Stripe: the webhook needs a few seconds, so we ask again until the record appears
  useEffect(() => {
    if (!start?.ok) return;
    let n = 0; const had = mine?.list.length ?? -1;
    const t = setInterval(async () => {
      n += 1; const m = await myFounder(); if (m) setMine(m);
      if ((m && m.list.length > Math.max(had, 0)) || n > 20) { clearInterval(t); setWaiting(false); if (!(m && m.list.length > Math.max(had, 0))) setNote(_t("Оплата прошла, запись появится через минуту. Если её нет через 10 минут, напишите нам: сертификат мы оформим вручную.")); }
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.ok]);
  const list = mine?.list ?? [];
  const toForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="fd">
      {waiting && <div className="fd-wait"><b>{_t("Спасибо! Оформляем ваш сертификат…")}</b><small>{_t("Это занимает несколько секунд. Письмо с PDF уже в пути.")}</small></div>}
      {note && <p className="pro-note">{note}</p>}
      {list.length > 0 && <MyContribution list={list} onUpgrade={toForm} onTerms={onTerms} />}
      <GiftCode onDone={load} gift={start?.gift} />
      <div ref={formRef} />
      {loaded && <Order start={start} admin={admin} onTerms={onTerms} hasOne={list.length > 0} onDone={(r) => { setMine((m) => ({ list: [...(m?.list ?? []), r], forever: m?.forever || r.pro_forever, until: r.pro_until ?? m?.until ?? null })); foundersWall().then(setWall); window.scrollTo(0, 0); }} />}
      <WallBlock wall={wall} />
      <p className="tiny fd-fine">{_t("Круг основателей это покупка привилегий и вклад в дело, не доля в компании и не обещание дохода. Карты, выпущенные в России, не принимаются.")} <button type="button" className="link-btn" onClick={onTerms}>{_t("Условия")}</button></p>
    </div>
  );
}

function MyContribution({ list, onUpgrade, onTerms }: { list: FounderRec[]; onUpgrade: () => void; onTerms: () => void }) {
  const best = [...list].sort((a, b) => b.amount - a.amount)[0];
  const gifts = list.flatMap((r) => r.gifts.map((g) => ({ ...g, from: r.code })));
  const [copied, setCopied] = useState('');
  const share = async (code: string) => {
    const url = `${location.origin}/app/?gift=${code}`;
    const text = _t("Дарю тебе год Living Muslim Pro. Открой ссылку и код применится сам: {0}", url);
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* cancelled */ }
    try { await navigator.clipboard.writeText(text); setCopied(code); setTimeout(() => setCopied(''), 2000); } catch { prompt(_t("Скопируй и отправь:"), text); }
  };
  return (
    <>
      <h3 className="pf-sub">{_t("Мой вклад")}</h3>
      {list.map((r) => (
        <div key={r.id} className={`fd-card t-${r.tier}`}>
          <div className="fd-row"><span className="fd-badge">◆ {tierName(r.tier)}</span><b>{eur(r.amount)}</b></div>
          <h3>{_t("Сертификат № {0}", certNo(r.no))}</h3>
          <div className="fd-m">{dateOf(r.paid)} · {r.pro_forever ? _t("Pro навсегда") : r.pro_until ? _t("Pro активен до {0}", dateOf(r.pro_until)) : ''}{r.status === 'test' ? ` · ${_t("тестовая запись")}` : ''}</div>
          <div className="fd-m">{_tj("Привилегии {0} · запись вклада {1}", eur(r.service), eur(r.contrib))}{r.wall ? ` · ${_t("на стене: {0}", r.wall)}` : ` · ${_t("на стене анонимно")}`}</div>
          <div className="fd-mini">
            <a href={`/api/invest?op=cert&code=${encodeURIComponent(r.code)}`} target="_blank" rel="noopener">{_t("Открыть PDF")}</a>
            <a href={`/api/invest?op=cert&code=${encodeURIComponent(r.code)}&dl=1`}>{_t("Скачать")}</a>
            {r.id === best.id && r.tier !== 'f1000' && <button type="button" className="link-btn" onClick={onUpgrade}>{_t("Поднять уровень")}</button>}
          </div>
        </div>
      ))}
      {gifts.length > 0 && (
        <div className="fd-card">
          <h3>{_t("Подарочные Pro")}</h3>
          <div className="fd-m">{_t("По году Pro каждому, кому отправите код. Человек вводит его в Профиль → Круг основателей, или просто открывает ссылку.")}</div>
          <div className="fd-codes">
            {gifts.map((g) => (
              <div key={g.code} className={g.used ? 'used' : ''}>
                <span>{g.code}</span>
                {g.used ? <small>{_t("использован")}</small> : <button type="button" className="link-btn" onClick={() => share(g.code)}>{copied === g.code ? _t("Скопировано") : _t("Отправить близкому")}</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="fd-card soft">
        <h3>{_t("Голос основателей и отчёт")}</h3>
        <div className="fd-m">{_t("Раз в месяц основатели выбирают, что делать в первую очередь. Первый опрос в декабре. Отчёт за квартал (пользователи, подписки, что сделано) придёт письмом 1 марта.")}</div>
        <div className="fd-mini"><button type="button" className="link-btn" onClick={onTerms}>{_t("Условия Круга основателей")}</button></div>
      </div>
    </>
  );
}

function GiftCode({ onDone, gift }: { onDone: () => void; gift?: string }) {
  const [open, setOpen] = useState(Boolean(gift));
  const [code, setCode] = useState((gift ?? '').toUpperCase());
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    const r = await useGift(code);
    setBusy(false);
    if (r.ok) { setMsg(_t("Готово: Pro открыт до {0}. ДжазакаЛлаху хайран тому, кто подарил.", dateOf(r.until))); setCode(''); onDone(); }
    else setMsg(r.error === 'used' ? _t("Этот код уже использован.") : r.error === 'own' ? _t("Свой подарочный код применить нельзя, он для другого человека.") : r.error === 'nocode' ? _t("Такого кода нет. Проверьте буквы: 0 и O в кодах не используются.") : _t("Не получилось. Проверьте интернет и попробуйте ещё раз."));
  };
  return (
    <div className="fd-gift">
      <button type="button" className="link-btn" onClick={() => setOpen(!open)}>{open ? _t("Скрыть") : _t("🎁 У меня есть подарочный код")}</button>
      {open && (
        <div className="fd-gift-f">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LM-GIFT-XXXXX" maxLength={14} autoCapitalize="characters" />
          <button type="button" className="pri-btn" disabled={busy || code.trim().length < 10} onClick={apply}>{_t("Применить")}</button>
        </div>
      )}
      {msg && <p className="pro-note">{msg}</p>}
    </div>
  );
}

/** «Два плода»: the spiritual fruit now and the recorded contribution with the first offer of a share at the round.
 *  No income, percentages or forecasts here (payment goes through Stripe; the share terms wait for the lawyer). */
function TwoFruits({ t }: { t: TierInfo }) {
  return (
    <section className="fd-fruits" aria-label={_t("Два плода вашего участия")}>
      <h3>{_t("Два плода вашего участия")}</h3>
      <div className="fd-fruit fd-fruit-a">
        <small>{_t("Духовный · уже сейчас")}</small>
        <b>{_t("Садака джария")}</b>
        <p>{_t("Каждый намаз, страница Корана и дуа, совершённые с помощью приложения, становятся и вашей садакой: вы помогли его построить. Ваше имя в основании проекта, пока он живёт.")}</p>
      </div>
      <div className="fd-fruit fd-fruit-b">
        <small>{_t("Финансовый · на раунде")}</small>
        <b>{_t("Запись вклада и право первого предложения")}</b>
        <p>{_tj("За вами записывается {0} из {1}: это ваш вклад после привилегий. Когда компания откроет раунд, члены круга первыми получат предложение доли по договору мудараба, пропорционально вкладу.", <strong>{eur(t.amount - t.service)}</strong>, eur(t.amount))}</p>
        <p className="fd-fruit-fine">{_t("Это право первого предложения, не обещание дохода. Условия доли появятся после проверки юристом и имамом.")}</p>
      </div>
      <ol className="fd-steps">
        <li><b>{_t("Сейчас")}</b><span>{_t("привилегии уровня и запись вклада")}</span></li>
        <li><b>{_t("Раунд")}</b><span>{_t("предложение доли членам круга, первым")}</span></li>
        <li><b>{_t("Договор")}</b><span>{_t("мудараба, отдельно и по вашему согласию")}</span></li>
      </ol>
    </section>
  );
}

const DRAFT = 'lm.founderDraft';
interface Draft { tier: Tier; name: string; email: string; country: string; anon: boolean; wall: string; agree: boolean }
function Order({ start, admin, hasOne, onTerms, onDone }: { start?: FounderStart | null; admin: boolean; hasOne: boolean; onTerms: () => void; onDone: (r: FounderRec) => void }) {
  const prof = cachedProfile();
  const me = authMe();
  // the draft survives a trip to the terms page (the form unmounts there)
  const draft = useMemo<Partial<Draft>>(() => { try { return JSON.parse(sessionStorage.getItem(DRAFT) || '{}'); } catch { return {}; } }, []);
  const [tier, setTier] = useState<Tier>(start?.tier ?? draft.tier ?? 'f250');
  const [name, setName] = useState(draft.name ?? (prof?.name || me?.name || cloudMe()?.name || ''));
  const [email, setEmail] = useState(draft.email ?? (me?.email || ''));
  const [country, setCountry] = useState(draft.country ?? '');
  const [anon, setAnon] = useState(draft.anon ?? false);
  const [wall, setWall] = useState(draft.wall ?? '');
  const [agree, setAgree] = useState(draft.agree ?? false);
  useEffect(() => { try { sessionStorage.setItem(DRAFT, JSON.stringify({ tier, name, email, country, anon, wall, agree } satisfies Draft)); } catch { /* */ } }, [tier, name, email, country, anon, wall, agree]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(!hasOne || Boolean(start?.tier));
  useEffect(() => { if (start?.tier) setOpen(true); }, [start?.tier]);
  const t = tierOf(tier);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const ok = name.trim().length >= 2 && emailOk && agree;
  const order = () => ({ tier, name: name.trim(), email: email.trim(), country: country.trim(), wall: anon ? '' : (wall.trim() || [name.trim().split(/\s+/)[0], country.trim()].filter(Boolean).join(', ')) });
  const pay = async () => {
    if (!ok) return;
    setBusy(true); setMsg('');
    const r = await checkout(order(), LANG);
    if (r.url) { try { sessionStorage.removeItem(DRAFT); } catch { /* */ } location.href = r.url; return; }
    setBusy(false);
    setMsg(r.error === 'nostripe' ? _t("Оплата подключается. Как только Stripe будет включён, кнопка заработает, а вы ничего не потеряете: уровни и цены те же.") : r.error === 'input' ? _t("Проверьте имя и почту.") : _t("Не получилось открыть оплату. Попробуйте ещё раз чуть позже."));
  };
  const test = async () => {
    if (!ok) { setMsg(_t("Заполните имя и почту и поставьте галочку.")); return; }
    setBusy(true); setMsg('');
    const r = await testOrder(order(), LANG);
    setBusy(false);
    if ('error' in r) setMsg(r.error === 'admin' ? _t("Тестовая запись доступна только владельцу, войдите по почте владельца.") : _t("Не получилось: {0}", r.error));
    else { setMsg(''); setOpen(false); try { sessionStorage.removeItem(DRAFT); } catch { /* */ } onDone(r); }
  };
  if (!open) return <div className="fd-more"><button type="button" className="ghost-btn" onClick={() => setOpen(true)}>{_t("Поднять уровень или поддержать ещё")}</button></div>;
  return (
    <div className="fd-order">
      {!hasOne && (
        <div className="fd-hero">
          <div className="fd-eyebrow">{_t("Круг основателей · от €100")}</div>
          <h2>{_t("Войдите в круг тех, кто сделал Living Muslim")}</h2>
          <p>{_t("Вы помогаете собрать приложение и получаете награду за каждый намаз, совершённый с его помощью. А ещё привилегии, по уровню.")}</p>
        </div>
      )}
      {hasOne && <h3 className="pf-sub">{_t("Поднять уровень или поддержать ещё")}</h3>}
      <div className="fd-tiers" role="radiogroup" aria-label={_t("Уровень")}>
        {TIERS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={tier === x.id} className={`fd-tier${x.hot ? ' hot' : ''}${x.top ? ' top' : ''}`} onClick={() => setTier(x.id)}>
            <small>{x.tag}</small><b>{tierName(x.id)}</b><em>{eur(x.amount)}</em>
            <ul>{x.perks.map((p) => <li key={p}>{p}</li>)}</ul>
          </button>
        ))}
      </div>
      <TwoFruits t={t} />
      <div className="fd-form">
        <div className="fd-row fd-sum"><span>{tierName(tier)}</span><b>{eur(t.amount)}</b></div>
        <div className="fd-m">{t.perks.slice(0, 3).join(' · ')}</div>
        <label><span>{_t("Имя для сертификата")}</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" /></label>
        <label><span>{_t("Почта (сертификат и чек)")}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email" inputMode="email" /></label>
        <label><span>{_t("Страна или город")}</span><input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} placeholder={_t("Например: Казань")} /></label>
        <label className={anon ? 'off' : ''}><span>{_t("На стене основателей показать")}</span><input value={wall} disabled={anon} onChange={(e) => setWall(e.target.value)} maxLength={40} placeholder={[name.trim().split(/\s+/)[0], country.trim()].filter(Boolean).join(', ') || _t("Имя, город")} /></label>
        <label className="fd-agree"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /><span>{_t("Остаться анонимно (на стене будет «Анонимно»)")}</span></label>
        <label className="fd-agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>{_tj("Принимаю {0}. Понимаю, что это покупка привилегий и вклад в дело, не доля в компании и не обещание дохода.", <button type="button" className="link-btn" onClick={onTerms}>{_t("условия Круга основателей")}</button>)}</span></label>
        <button type="button" className="pri-btn big-btn fd-pay" disabled={!ok || busy} onClick={pay}>
          {_t("Оплатить {0}", eur(t.amount))}<small>{_t("карта · Apple Pay · Google Pay · безопасно через Stripe")}</small>
        </button>
        {admin && <button type="button" className="ghost-btn" disabled={busy} onClick={test}>{_t("Тестовая запись без оплаты (только владелец)")}</button>}
        {msg && <p className="pro-note">{msg}</p>}
        <p className="tiny">{_t("Сертификат и чек придут на почту сразу после оплаты. Привилегии включаются сами.")}</p>
      </div>
    </div>
  );
}

export function WallBlock({ wall }: { wall: Wall | null }) {
  if (!wall) return null;
  const pct = Math.min(100, Math.round((wall.sum / wall.goal) * 100));
  return (
    <div className="fd-wall">
      <h3 className="pf-sub">{_t("Стена основателей")}</h3>
      <div className="fd-prog"><div className="l"><span><b>{eur(wall.sum)}</b> {_t("из {0}", eur(wall.goal))}</span><span>{_tj("{0} в круге", wall.count)}</span></div><i style={{ '--w': `${pct}%` } as React.CSSProperties} /></div>
      {wall.names.length + wall.anon > 0 ? (
        <div className="fd-names">
          {wall.names.map((n, i) => <span key={i} className={`t-${n.t}`}>{n.t !== 'f100' && <b>◆ </b>}{n.w}</span>)}
          {wall.anon > 0 && <span>{_t("Анонимно · {0}", wall.anon)}</span>}
        </div>
      ) : <p className="tiny">{_t("Первые имена появятся здесь. Пусть первым будет ваше.")}</p>}
    </div>
  );
}

/** The terms the checkbox points to. A short page in the person's words; the legal review is the owner's.  */
export function FounderTerms() {
  if (LANG === 'en') return (
    <div className="fd-terms">
      <p><b>What you buy.</b> Membership in the Founders Circle of Living Muslim at the chosen level: Pro for the level's time (3 months, a year, or forever), your name on the wall of founders (or anonymity), the founder's mark next to your nick, a named certificate, and for the higher levels gift Pro codes, a voice in the monthly roadmap poll and a yearly call with the team. These are services of the app, provided by Navo Motors Bulgaria EOOD (Bulgaria).</p>
      <p><b>The recorded contribution.</b> The payment minus the price of the privileges (€15 / €30 / €60 / €100) is recorded in your account as your contribution to the project. It is not a share in the company, not a loan, not a promise of income, and it is not paid back. If the project later offers founders a way to take part in a round, members of the Circle are told first; the terms of that will be a separate agreement.</p>
      <p><b>Refunds.</b> Within 14 days of payment, on request by email, if the gift codes have not been used, in full. After that the privileges stay for their whole time and the payment is not refunded.</p>
      <p><b>Fair play.</b> No ads, no sale of data, no gambling mechanics. The wall shows only what you typed in «show on the wall». The certificate code is personal: whoever has the link can open the PDF.</p>
      <p><b>Taxes and payments.</b> Payments go through Stripe; the receipt comes from Stripe. Cards issued in Russia are not accepted. Prices include VAT where it applies.</p>
      <p className="tiny">This text is the plain-words version of the terms and will be reviewed by a lawyer. Where the two differ, the reviewed version applies.</p>
    </div>
  );
  return (
    <div className="fd-terms">
      <p><b>Что вы покупаете.</b> Участие в Круге основателей Living Muslim на выбранном уровне: Pro на срок уровня (3 месяца, год или навсегда), имя на стене основателей (или анонимность), значок основателя рядом с ником, именной сертификат, а на старших уровнях подарочные коды Pro, голос в ежемесячном опросе по дорожной карте и звонок с командой раз в год. Это услуги приложения, их оказывает Наво Мотърс България ЕООД (Болгария).</p>
      <p><b>Запись вклада.</b> Платёж минус стоимость привилегий (€15 / €30 / €60 / €100) записывается в вашем кабинете как ваш вклад в проект. Это не доля в компании, не займ, не обещание дохода, и он не возвращается. Если проект позже предложит основателям участие в раунде, членам Круга скажут первыми; условия этого будут отдельным соглашением.</p>
      <p><b>Возврат.</b> В течение 14 дней после оплаты, по письму на почту, если подарочные коды не использованы, полностью. После этого привилегии действуют весь срок, а платёж не возвращается.</p>
      <p><b>Честно.</b> Без рекламы, продажи данных и азартных механик. На стене показывается только то, что вы сами написали в поле «на стене показать». Код сертификата личный: у кого ссылка, тот и откроет PDF.</p>
      <p><b>Налоги и оплата.</b> Оплата идёт через Stripe, чек приходит от Stripe. Карты, выпущенные в России, не принимаются. Цены включают НДС там, где он применяется.</p>
      <p className="tiny">Это условия простыми словами, их проверит юрист. Если тексты расходятся, действует проверенная версия.</p>
    </div>
  );
}
